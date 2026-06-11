const pool = require('../../config/db')
const { ok, fail, scope, paging, dateRange, parseJsonField } = require('./_shared')
const { buildDiagnosis } = require('../../v1/diagnosis')

async function list(req, res) {
  const { page, pageSize, offset } = paging(req.query)
  const s = await scope(req, { tenantCol: 'c.tenant_id', saCol: 'c.service_account_id' })
  const params = [...s.params]
  let where = 'WHERE 1=1' + s.sql

  for (const key of ['platform', 'intent_label', 'current_stage']) {
    if (req.query[key]) {
      where += ` AND c.${key} = ?`
      params.push(req.query[key])
    }
  }
  if (req.query.platform_page) {
    where += ' AND c.platform_page LIKE ?'
    params.push(`%${req.query.platform_page}%`)
  }
  if (req.query.nickname) {
    where += ' AND c.customer_nickname LIKE ?'
    params.push(`%${req.query.nickname}%`)
  }
  where += dateRange(req.query, 'c.last_message_at', params)
  if (req.query.keyword) {
    where += ` AND EXISTS (
      SELECT 1 FROM messages m
      WHERE m.conversation_id = c.id AND m.tenant_id = c.tenant_id AND m.content_text LIKE ?
    )`
    params.push(`%${req.query.keyword}%`)
  }
  if (req.query.agent) {
    // W19:客服筛选改按 service_account_id(与客服账号资产一致),不再按 sender_nickname
    where += ' AND c.service_account_id = ?'
    params.push(req.query.agent)
  }
  if (req.query.workorder_type) {
    where += ` AND EXISTS (
      SELECT 1 FROM workorders w
      WHERE w.conversation_id = c.id AND w.tenant_id = c.tenant_id AND w.workorder_type = ?
    )`
    params.push(req.query.workorder_type)
  }

  try {
    if (req.query.diagnosis_color) {
      const [allRows] = await pool.query(
        `SELECT c.id, c.platform, c.platform_page, c.customer_nickname, c.customer_platform_uid,
                c.intent_label, c.intent_confidence, c.intent_source, c.current_stage,
                c.completeness_score, c.field_validity, c.message_count,
                DATE_FORMAT(c.last_message_at, '%Y-%m-%d %H:%i:%s') AS last_message_at,
                DATE_FORMAT(c.last_inbound_at, '%Y-%m-%d %H:%i:%s') AS last_inbound_at,
                DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                (SELECT lm.content_text FROM messages lm WHERE lm.conversation_id = c.id AND lm.tenant_id = c.tenant_id ORDER BY lm.segment_at DESC, lm.position DESC, lm.id DESC LIMIT 1) AS last_message_text,
                (SELECT lm.content_type FROM messages lm WHERE lm.conversation_id = c.id AND lm.tenant_id = c.tenant_id ORDER BY lm.segment_at DESC, lm.position DESC, lm.id DESC LIMIT 1) AS last_message_type
         FROM conversations c ${where}
         ORDER BY c.last_message_at DESC, c.id DESC`,
        params
      )
      const filtered = withDiagnosis(allRows).filter((row) => row.diagnosis.mainColor === req.query.diagnosis_color)
      return ok(res, {
        list: filtered.slice(offset, offset + pageSize),
        total: filtered.length,
        page,
        page_size: pageSize,
      })
    }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM conversations c ${where}`, params)
    const [rows] = await pool.query(
      `SELECT c.id, c.platform, c.platform_page, c.customer_nickname, c.customer_platform_uid,
              c.intent_label, c.intent_confidence, c.intent_source, c.current_stage,
              c.completeness_score, c.field_validity, c.message_count,
              DATE_FORMAT(c.last_message_at, '%Y-%m-%d %H:%i:%s') AS last_message_at,
              DATE_FORMAT(c.last_inbound_at, '%Y-%m-%d %H:%i:%s') AS last_inbound_at,
              DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
              (SELECT lm.content_text FROM messages lm WHERE lm.conversation_id = c.id AND lm.tenant_id = c.tenant_id ORDER BY lm.segment_at DESC, lm.position DESC, lm.id DESC LIMIT 1) AS last_message_text,
              (SELECT lm.content_type FROM messages lm WHERE lm.conversation_id = c.id AND lm.tenant_id = c.tenant_id ORDER BY lm.segment_at DESC, lm.position DESC, lm.id DESC LIMIT 1) AS last_message_type
       FROM conversations c ${where}
       ORDER BY c.last_message_at DESC, c.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    )
    ok(res, { list: withDiagnosis(rows), total, page, page_size: pageSize })
  } catch (err) {
    console.error('[v1.conversations.list]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function detail(req, res) {
  try {
    const s = await scope(req, { tenantCol: 'c.tenant_id', saCol: 'c.service_account_id' })
    const [rows] = await pool.query(
      `SELECT c.*, l.id AS lead_id
       FROM conversations c
       LEFT JOIN leads l ON l.primary_conversation_id = c.id AND l.tenant_id = c.tenant_id
       WHERE c.id = ?${s.sql}
       LIMIT 1`,
      [req.params.id, ...s.params]
    )
    if (!rows.length) return fail(res, 404, 2001, '会话不存在')
    const sw = await scope(req, { tenantCol: 'tenant_id', saCol: 'service_account_id' })
    const [workorders] = await pool.query(
      `SELECT id FROM workorders WHERE conversation_id = ?${sw.sql} ORDER BY id DESC`,
      [req.params.id, ...sw.params]
    )
    const conversation = {
      ...rows[0],
      field_validity: parseJsonField(rows[0].field_validity, {}),
    }
    ok(res, {
      ...conversation,
      diagnosis: buildDiagnosis(conversation),
      workorder_ids: workorders.map((row) => row.id),
    })
  } catch (err) {
    console.error('[v1.conversations.detail]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function messages(req, res) {
  const { page, pageSize, offset } = paging(req.query)
  try {
    const s = await scope(req, { tenantCol: 'tenant_id', saCol: 'service_account_id' })
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM messages WHERE conversation_id = ?${s.sql}`,
      [req.params.id, ...s.params]
    )
    const latest = req.query.latest === '1' || req.query.latest === 'true'
    const [rows] = await pool.query(
      `SELECT id, direction, position, sender_nickname, content_type, content_text, content_url, raw_snapshot,
              DATE_FORMAT(occurred_at, '%Y-%m-%d %H:%i:%s') AS occurred_at,
              DATE_FORMAT(segment_at, '%Y-%m-%d %H:%i:%s') AS segment_at
       FROM messages
       WHERE conversation_id = ?${s.sql}
       ORDER BY segment_at ${latest ? 'DESC' : 'ASC'}, position ${latest ? 'DESC' : 'ASC'}, id ${latest ? 'DESC' : 'ASC'}
       LIMIT ? OFFSET ?`,
      [req.params.id, ...s.params, pageSize, offset]
    )
    const list = latest ? rows.reverse() : rows
    ok(res, {
      list: list.map((row) => ({ ...row, raw_snapshot: parseJsonField(row.raw_snapshot) })),
      total,
      page,
      page_size: pageSize,
    })
  } catch (err) {
    console.error('[v1.conversations.messages]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

function withDiagnosis(rows) {
  return rows.map((row) => {
    const fieldValidity = parseJsonField(row.field_validity, {})
    const conversation = { ...row, field_validity: fieldValidity }
    return { ...conversation, diagnosis: buildDiagnosis(conversation) }
  })
}

// 筛选项(从真实会话数据派生:平台/页面/客服),供聚合页三级联动
async function facets(req, res) {
  try {
    const s = await scope(req, { tenantCol: 'tenant_id', saCol: 'service_account_id' })
    const [platforms] = await pool.query(
      `SELECT DISTINCT platform FROM conversations WHERE platform IS NOT NULL AND platform <> ''${s.sql} ORDER BY platform`,
      [...s.params]
    )
    const [pages] = await pool.query(
      `SELECT DISTINCT platform, platform_page FROM conversations WHERE platform_page IS NOT NULL AND platform_page <> ''${s.sql} ORDER BY platform, platform_page`,
      [...s.params]
    )
    // W19:客服下拉 = service_accounts(客服账号资产,与"客服账号分配"一致),按 scope 隔离;
    //   带 platform_key/page_key 供"平台→页面→客服"三级联动(对齐 conversations.platform/platform_page)
    const ssa = await scope(req, { tenantCol: 'sa.tenant_id', saCol: 'sa.id' })
    const [agents] = await pool.query(
      `SELECT sa.id AS service_account_id, sa.account_nickname AS agent,
              p.platform_key AS platform, pp.page_key AS platform_page
       FROM service_accounts sa
       JOIN platforms p ON p.id = sa.platform_id
       JOIN platform_pages pp ON pp.id = sa.page_id
       WHERE 1=1${ssa.sql}
       ORDER BY sa.id LIMIT 500`,
      [...ssa.params]
    )
    ok(res, { platforms: platforms.map((r) => r.platform), pages, agents })
  } catch (err) {
    console.error('[v1.conversations.facets]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

// v0.6.5:冷启动 re-align 只读接口。供插件冷启动(本地 position 态丢失)时取该会话已入库的
//   max(position) + 最近 K 条(direction/content_text/position),让客户端 PositionTracker 重建 seq、
//   把可见历史对齐回旧 position(幂等),只有真·新消息才续编 max+1。
//   ★只读:纯 SELECT,不建账号/不写库/不改 lifecycle。
//   ★按 tenant_id(JWT)隔离,不叠 service_account 查看权 —— 采集者需取本租户该会话 position,
//     与后台查看权无关;叠 saCol 会让"采集者非该账号查看权人"误判 found=false → 冷启动撞号。
async function positionState(req, res) {
  const platform = req.query.platform
  const platformPage = req.query.platform_page
  const conversationId = req.query.conversation_id
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30))
  if (!platform || !platformPage || !conversationId) return fail(res, 400, 1001, '参数缺失')
  const tenant = req.user && req.user.tenant_id
  if (req.user.user_type === 'internal' || tenant == null) {
    return ok(res, { found: false, max_position: null, recent: [] }) // 平台方不采集
  }
  try {
    const [convs] = await pool.query(
      'SELECT id FROM conversations WHERE tenant_id = ? AND platform = ? AND platform_page = ? AND platform_conversation_id = ? LIMIT 1',
      [tenant, platform, platformPage, conversationId]
    )
    if (!convs.length) return ok(res, { found: false, max_position: null, recent: [] })
    const cid = convs[0].id
    const [[agg]] = await pool.query(
      'SELECT MAX(position) AS max_position FROM messages WHERE tenant_id = ? AND conversation_id = ?',
      [tenant, cid]
    )
    const [recent] = await pool.query(
      `SELECT direction, content_text, position FROM messages
       WHERE tenant_id = ? AND conversation_id = ? AND position IS NOT NULL
       ORDER BY position DESC LIMIT ?`,
      [tenant, cid, limit]
    )
    ok(res, { found: true, max_position: agg.max_position, recent })
  } catch (err) {
    console.error('[v1.conversations.positionState]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

module.exports = { list, detail, messages, facets, positionState }
