const pool = require('../../config/db')
const { ok, fail, tenantId, toMysqlDate, jsonValue } = require('./_shared')
const { insertAudit } = require('../../utils/account-audit')

async function batch(req, res) {
  const events = req.body && req.body.events
  if (!Array.isArray(events)) return fail(res, 400, 1003, 'events 必须是数组')
  if (events.length > 50) return fail(res, 400, 1003, '单批最多 50 条')

  const tenant = tenantId(req)
  // B2:平台方(internal)/无 tenant 不可上报采集数据(Q5/R2)
  if (req.user.user_type === 'internal' || tenant == null) {
    return fail(res, 403, 1003, '平台方账号不可上报采集数据')
  }
  const conn = await pool.getConnection()
  const saCache = new Map()      // batch 内 account → 完整 sa 状态对象 memoize(W20)
  const gateCache = new Map()    // batch 内 account → 采集权判定结果 memoize(W20-C1)
  let accepted = 0
  let duplicated = 0
  let rejected = 0
  const rejectReasons = []       // W20-C1:[{platform_message_id, reason}]

  try {
    await conn.beginTransaction()

    for (const event of events) {
      const platform = event.platform
      const platformConversationId = event.conversation_id || event.platform_conversation_id
      const platformMessageId = event.message_id || event.platform_message_id
      const direction = event.direction
      const occurredAt = toMysqlDate(event.occurred_at)   // W17:outbound 为 null(不存合成假时间)
      const segmentAt = toMysqlDate(event.segment_at)
      const msgTime = occurredAt || segmentAt             // 会话级时间跟踪:有精确用精确,否则退段时间

      // W17:放开"无 occurred_at 即 reject"(D4),允许 outbound occurred_at=NULL 正常入库
      if (!platform || !platformConversationId || !platformMessageId || !direction) {
        rejected += 1
        rejectReasons.push({ platform_message_id: platformMessageId || null, reason: 'invalid_event' })
        continue
      }

      const [existingMessages] = await conn.query(
        'SELECT id FROM messages WHERE tenant_id = ? AND platform_message_id = ? LIMIT 1',
        [tenant, platformMessageId]
      )
      if (existingMessages.length) {
        duplicated += 1
        continue
      }

      // W20-B:account_biz_id+昵称 → 完整 SA 状态(缺/映射不到 → null);首见在此建 pending+临时采集权+view+audit。
      const sa = await resolveServiceAccount(conn, tenant, req, event, saCache)

      // W20-C1:采集权判定闸门(★event 级 rejected,HTTP 仍 200;非整批 403)。
      const gate = await collectGate(conn, tenant, req, event, sa, gateCache)
      if (gate.reject) {
        rejected += 1
        rejectReasons.push({ platform_message_id: platformMessageId, reason: gate.reason })
        continue
      }
      const saId = sa ? sa.id : null

      let conversationId
      const [conversationRows] = await conn.query(
        `SELECT id FROM conversations
         WHERE tenant_id = ? AND platform = ? AND platform_conversation_id = ?
         LIMIT 1`,
        [tenant, platform, platformConversationId]
      )

      // 客户昵称只取 inbound(客户)消息的发送者,绝不被 outbound(客服)覆盖
      const inboundNickname = direction === 'inbound' ? (event.sender_nickname || null) : null

      if (conversationRows.length) {
        conversationId = conversationRows[0].id
        await conn.query(
          `UPDATE conversations
           SET service_account_id = COALESCE(?, service_account_id),
               platform_page = COALESCE(?, platform_page),
               customer_nickname = COALESCE(?, customer_nickname),
               customer_platform_uid = COALESCE(?, customer_platform_uid),
               last_message_at = CASE WHEN ? IS NOT NULL THEN GREATEST(COALESCE(last_message_at, ?), ?) ELSE last_message_at END,
               last_inbound_at = CASE WHEN ? = 'inbound' AND ? IS NOT NULL THEN GREATEST(COALESCE(last_inbound_at, ?), ?) ELSE last_inbound_at END,
               message_count = message_count + 1
           WHERE id = ?`,
          [
            saId,
            event.platform_page || null,
            inboundNickname,
            event.customer_platform_uid || event.platform_uid || null,
            msgTime,
            msgTime,
            msgTime,
            direction,
            occurredAt,
            occurredAt,
            occurredAt,
            conversationId,
          ]
        )
      } else {
        const [result] = await conn.query(
          `INSERT INTO conversations
           (tenant_id, service_account_id, platform, platform_page, platform_conversation_id, customer_nickname,
            customer_platform_uid, message_count, last_message_at, last_inbound_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [
            tenant,
            saId,
            platform,
            event.platform_page || null,
            platformConversationId,
            inboundNickname,
            event.customer_platform_uid || event.platform_uid || null,
            1,
            msgTime,
            direction === 'inbound' ? occurredAt : null,
          ]
        )
        conversationId = result.insertId
      }

      const [messageResult] = await conn.query(
        `INSERT INTO messages
         (tenant_id, service_account_id, conversation_id, platform_message_id, direction, position, sender_nickname,
          content_type, content_text, content_url, raw_snapshot, occurred_at, segment_at, analyzed_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`,
        [
          tenant,
          saId,
          conversationId,
          platformMessageId,
          direction,
          event.position != null ? event.position : null,
          event.sender_nickname || null,
          event.content_type || 'text',
          event.content_text || null,
          event.content_url || null,
          jsonValue(event.raw_snapshot),
          occurredAt,
          segmentAt,
        ]
      )

      await conn.query(
        `INSERT INTO analysis_jobs (tenant_id, service_account_id, message_id, conversation_id, status)
         VALUES (?, ?, ?, ?, 'pending')`,
        [tenant, saId, messageResult.insertId, conversationId]
      )

      accepted += 1
    }

    await conn.commit()
    ok(res, { accepted, duplicated, rejected, reject_reasons: rejectReasons })
  } catch (err) {
    await conn.rollback()
    console.error('[v1.events.batch]', err)
    fail(res, 500, 5000, '服务器内部错误')
  } finally {
    conn.release()
  }
}

// W20-B:event → 完整 SA 状态 { id, lifecycle, collector_id, collector_kind, created }。
//   ★稳定身份 = tenant+platform+page+account_biz_id(不含 account_nickname);昵称为展示字段,变化不拆账号。
//   缺 account_biz_id / 平台·页面映射不到 → 返回 null(放行/拒绝由阶段C C1 按 page 判)。
//   命中既有账号 → 返回该行(created:false);若传入昵称非空且与库中不同 → 更新展示昵称(同一 service_account_id)。
//   首见(uk_account 未命中)→ 事务内建 pending + 临时采集权(本员工 collector_kind='temp')
//     + service_account_view 一行(granted_by=NULL,采集人默认查看权)+ audit first_seen/temp_grant。
//   ★并发首见:后到者 INSERT 撞 uk_account → 捕获后改查(FOR UPDATE 读最新已提交)命中行返回(created:false)。
async function resolveServiceAccount(conn, tenant, req, event, cache) {
  const bizId = event.account_biz_id
  if (!bizId) return null
  const nick = event.account_nickname || ''
  const key = [event.platform, event.platform_page, bizId].join('|') // 稳定身份键,不含昵称
  if (cache.has(key)) return cache.get(key)

  const [pf] = await conn.query('SELECT id FROM platforms WHERE platform_key = ? LIMIT 1', [event.platform])
  if (!pf.length) { cache.set(key, null); return null }
  const [pg] = await conn.query(
    'SELECT id FROM platform_pages WHERE platform_id = ? AND page_key = ? LIMIT 1',
    [pf[0].id, event.platform_page]
  )
  if (!pg.length) { cache.set(key, null); return null }
  const platformId = pf[0].id
  const pageId = pg[0].id

  const found = await selectServiceAccount(conn, tenant, platformId, pageId, bizId)
  if (found) {
    if (nick && nick !== found.account_nickname) {
      await conn.query('UPDATE service_accounts SET account_nickname=? WHERE id=?', [nick, found.id])
      found.account_nickname = nick
    }
    cache.set(key, found)
    return found
  }

  const employeeId = req.user.id
  try {
    const [ins] = await conn.query(
      `INSERT INTO service_accounts
         (tenant_id, platform_id, page_id, account_biz_id, account_nickname,
          status, lifecycle, first_seen_at, first_seen_by, collector_id, collector_kind)
       VALUES (?,?,?,?,?, 1, 'pending', NOW(), ?, ?, 'temp')`,
      [tenant, platformId, pageId, bizId, nick, employeeId, employeeId]
    )
    const saId = ins.insertId
    await conn.query(
      `INSERT INTO service_account_view (tenant_id, service_account_id, employee_id, granted_by)
       VALUES (?,?,?,NULL)`,
      [tenant, saId, employeeId]
    )
    await insertAudit(conn, {
      tenantId: tenant, targetEmployeeId: employeeId, serviceAccountId: saId,
      eventType: 'first_seen', afterValue: { account_biz_id: bizId, account_nickname: nick, lifecycle: 'pending' },
    })
    await insertAudit(conn, {
      tenantId: tenant, targetEmployeeId: employeeId, serviceAccountId: saId,
      eventType: 'temp_grant', afterValue: { collector_id: employeeId, collector_kind: 'temp' },
    })
    const created = { id: saId, lifecycle: 'pending', collector_id: employeeId, collector_kind: 'temp', created: true }
    cache.set(key, created)
    return created
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      const row = await selectServiceAccount(conn, tenant, platformId, pageId, bizId, true)
      if (row) { cache.set(key, row); return row }
    }
    throw err
  }
}

// ★按稳定身份查询(tenant+platform+page+account_biz_id,不含昵称),与新 uk_account 一致。
async function selectServiceAccount(conn, tenant, platformId, pageId, bizId, forUpdate = false) {
  const [rows] = await conn.query(
    `SELECT id, lifecycle, collector_id, collector_kind, account_nickname
     FROM service_accounts
     WHERE tenant_id=? AND platform_id=? AND page_id=? AND account_biz_id=?
     LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [tenant, platformId, pageId, bizId]
  )
  if (!rows.length) return null
  return {
    id: rows[0].id,
    lifecycle: rows[0].lifecycle,
    collector_id: rows[0].collector_id,
    collector_kind: rows[0].collector_kind,
    account_nickname: rows[0].account_nickname,
    created: false,
  }
}

// W20-C1:采集权判定闸门(返回 {reject, reason})。★HTTP 仍 200,只在 event 级拒绝。
//   sa==null:private-message 缺 account_biz_id → 拒(治理不被绕过);laike/feige 等未治理页 → 放行(留 NULL)。
//   sa.created:首见已建临时采集权(collector=本员工)→ 放行。
//   sa.lifecycle=disabled → 拒(account_disabled)+ audit reject_collect。
//   本员工==collector_id → 放行;否则拒:pending→pending_grab;active→not_collector
//     (audit:pending_grab / 旧采集人被改→old_collector_blocked / 否则 reject_collect)。
//   同账号 batch 内 memoize,audit 只写一次。
async function collectGate(conn, tenant, req, event, sa, cache) {
  if (sa == null) {
    if (event.platform_page === 'private-message' && !event.account_biz_id) {
      return { reject: true, reason: 'missing_account_biz_id' }
    }
    return { reject: false }
  }
  if (cache.has(sa.id)) return cache.get(sa.id)

  let decision
  if (sa.created) {
    decision = { reject: false }
  } else if (sa.lifecycle === 'disabled') {
    await insertAudit(conn, {
      tenantId: tenant, targetEmployeeId: req.user.id, serviceAccountId: sa.id,
      eventType: 'reject_collect', afterValue: { reason: 'account_disabled' },
    })
    decision = { reject: true, reason: 'account_disabled' }
  } else if (sa.collector_id === req.user.id) {
    decision = { reject: false }
  } else {
    let reason, eventType
    if (sa.lifecycle === 'pending') {
      reason = 'pending_grab'; eventType = 'pending_grab'
    } else {
      reason = 'not_collector'
      eventType = (await wasFormerCollector(conn, sa.id, req.user.id)) ? 'old_collector_blocked' : 'reject_collect'
    }
    await insertAudit(conn, {
      tenantId: tenant, targetEmployeeId: req.user.id, serviceAccountId: sa.id,
      eventType, afterValue: { reason, lifecycle: sa.lifecycle },
    })
    decision = { reject: true, reason }
  }
  cache.set(sa.id, decision)
  return decision
}

// 该员工是否曾是此账号采集负责人(被管理员重分配后被拒)→ audit 用 old_collector_blocked 区分
async function wasFormerCollector(conn, saId, employeeId) {
  const [rows] = await conn.query(
    `SELECT 1 FROM service_account_audit
     WHERE service_account_id = ? AND event_type = 'reassign_collector'
       AND JSON_EXTRACT(before_value, '$.collector_id') = ?
     LIMIT 1`,
    [saId, employeeId]
  )
  return rows.length > 0
}

// W20-D2:采集实例 heartbeat + 冲突检测。
//   upsert collect_instances(uk=tenant+collector_instance_id,刷新 last_seen_at + 当前 account/conv)。
//   查同租户其他活跃实例(60s 窗口,排除自身):
//     会话级命中(同 account_biz_id+conversation_id)→ {conflict:'session',action:'block'} + audit instance_conflict。
//     账号级命中(同 account_biz_id,会话不同)→ {conflict:'account',action:'warn'}。
//   ★阻止是采集实例治理(停该 tab 采集),非踢登录会话(PRD §6.1)。无 collector_instance_id → 向后兼容仅回基础。
const HEARTBEAT_WINDOW_SECONDS = 60

async function heartbeat(req, res) {
  const base = { server_time: new Date().toISOString(), config_version: 1 }
  const tenant = tenantId(req)
  const body = req.body || {}
  const cid = body.collector_instance_id
  if (req.user.user_type === 'internal' || tenant == null || !cid) {
    return ok(res, base)
  }

  const accountBizId = body.account_biz_id || null
  const conversationId = body.conversation_id || null
  const conn = await pool.getConnection()
  try {
    await conn.query(
      `INSERT INTO collect_instances
         (tenant_id, employee_id, collector_instance_id, device_id, browser_profile_id, tab_id,
          platform, platform_page, account_biz_id, conversation_id, last_seen_at, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),'active')
       ON DUPLICATE KEY UPDATE
         employee_id=VALUES(employee_id), device_id=VALUES(device_id), browser_profile_id=VALUES(browser_profile_id),
         tab_id=VALUES(tab_id), platform=VALUES(platform), platform_page=VALUES(platform_page),
         account_biz_id=VALUES(account_biz_id), conversation_id=VALUES(conversation_id),
         last_seen_at=NOW(), status='active'`,
      [tenant, req.user.id, cid, body.device_id || null, body.browser_profile_id || null, body.tab_id || null,
       body.platform || null, body.platform_page || null, accountBizId, conversationId]
    )

    let conflict = null
    let action = null
    if (accountBizId) {
      const [others] = await conn.query(
        `SELECT conversation_id FROM collect_instances
         WHERE tenant_id=? AND account_biz_id=? AND collector_instance_id<>?
           AND last_seen_at >= DATE_SUB(NOW(), INTERVAL ${HEARTBEAT_WINDOW_SECONDS} SECOND)`,
        [tenant, accountBizId, cid]
      )
      const sessionHit = conversationId && others.some((o) => o.conversation_id === conversationId)
      if (sessionHit) {
        conflict = 'session'; action = 'block'
        await insertAudit(conn, {
          tenantId: tenant, targetEmployeeId: req.user.id, eventType: 'instance_conflict',
          afterValue: { conflict, account_biz_id: accountBizId, conversation_id: conversationId },
          deviceId: body.device_id || null, browserProfileId: body.browser_profile_id || null, tabId: body.tab_id || null,
        })
      } else if (others.length) {
        conflict = 'account'; action = 'warn'
      }
    }
    ok(res, Object.assign(base, { conflict, action }))
  } catch (err) {
    console.error('[v1.events.heartbeat]', err)
    fail(res, 500, 5000, '服务器内部错误')
  } finally {
    conn.release()
  }
}

async function domAdapterConfig(req, res) {
  ok(res, {
    version: 1,
    platform: req.query.platform || 'douyin',
    selectors: req.query.version && Number(req.query.version) >= 1 ? null : {},
  })
}

module.exports = { batch, heartbeat, domAdapterConfig, resolveServiceAccount }
