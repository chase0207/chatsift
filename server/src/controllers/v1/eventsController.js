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
  const saCache = new Map()    // batch 内 account → 完整 sa 状态对象 memoize(W20)
  const boundCache = new Map() // batch 内已自动绑定的 sa_id
  let accepted = 0
  let duplicated = 0
  let rejected = 0

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

      // W20-B:account_biz_id+昵称 → 完整 SA 状态(缺/映射不到 → null);
      //        首见在此建 pending + 临时采集权(本员工)+ 查看权 + audit。
      //        ★阶段B 不做采集权拒绝闸门(留阶段C C1);本阶段仍全量入库。
      const sa = await resolveServiceAccount(conn, tenant, req, event, saCache)
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

      // B2:客服上报首见账号 → 自动绑定 employee_service_account(隔离闭环)
      await autoBindAgent(conn, tenant, req, saId, boundCache)
      accepted += 1
    }

    await conn.commit()
    ok(res, { accepted, duplicated, rejected })
  } catch (err) {
    await conn.rollback()
    console.error('[v1.events.batch]', err)
    fail(res, 500, 5000, '服务器内部错误')
  } finally {
    conn.release()
  }
}

// W20-B:event → 完整 SA 状态 { id, lifecycle, collector_id, collector_kind, created }。
//   缺 account_biz_id / 平台·页面映射不到 → 返回 null(放行/拒绝由阶段C C1 按 page 判)。
//   命中既有账号 → 返回该行(created:false)。
//   首见(uk_account 未命中)→ 事务内建 pending + 临时采集权(本员工 collector_kind='temp')
//     + service_account_view 一行(granted_by=NULL,采集人默认查看权)+ audit first_seen/temp_grant。
//   ★并发首见:后到者 INSERT 撞 uk_account → 捕获后改查(FOR UPDATE 读最新已提交)命中行返回(created:false)。
async function resolveServiceAccount(conn, tenant, req, event, cache) {
  const bizId = event.account_biz_id
  if (!bizId) return null
  const nick = event.account_nickname || ''
  const key = [event.platform, event.platform_page, bizId, nick].join('|')
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

  const found = await selectServiceAccount(conn, tenant, platformId, pageId, bizId, nick)
  if (found) { cache.set(key, found); return found }

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
      const row = await selectServiceAccount(conn, tenant, platformId, pageId, bizId, nick, true)
      if (row) { cache.set(key, row); return row }
    }
    throw err
  }
}

async function selectServiceAccount(conn, tenant, platformId, pageId, bizId, nick, forUpdate = false) {
  const [rows] = await conn.query(
    `SELECT id, lifecycle, collector_id, collector_kind
     FROM service_accounts
     WHERE tenant_id=? AND platform_id=? AND page_id=? AND account_biz_id=? AND account_nickname=?
     LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [tenant, platformId, pageId, bizId, nick]
  )
  if (!rows.length) return null
  return {
    id: rows[0].id,
    lifecycle: rows[0].lifecycle,
    collector_id: rows[0].collector_id,
    collector_kind: rows[0].collector_kind,
    created: false,
  }
}

// B2:客服(role_code='agent')上报首见账号 → 自动建 employee_service_account(系统来源,uk_assign 幂等);
//     租户超管不自动绑(默认看全租户,codex#5)
async function autoBindAgent(conn, tenant, req, saId, bound) {
  if (saId == null || req.user.role_code !== 'agent' || bound.has(saId)) return
  await conn.query(
    `INSERT IGNORE INTO employee_service_account (tenant_id, employee_id, service_account_id, assigned_by)
     VALUES (?,?,?,NULL)`,
    [tenant, req.user.id, saId]
  )
  bound.set(saId, true)
}

async function heartbeat(req, res) {
  ok(res, {
    server_time: new Date().toISOString(),
    config_version: 1,
  })
}

async function domAdapterConfig(req, res) {
  ok(res, {
    version: 1,
    platform: req.query.platform || 'douyin',
    selectors: req.query.version && Number(req.query.version) >= 1 ? null : {},
  })
}

module.exports = { batch, heartbeat, domAdapterConfig, resolveServiceAccount }
