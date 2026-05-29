const pool = require('../../config/db')
const { ok, fail, tenantId, paging, dateRange, parseJsonField } = require('./_shared')

async function list(req, res) {
  const tenant = tenantId(req)
  const { page, pageSize, offset } = paging(req.query)
  const params = [tenant]
  let where = 'WHERE c.tenant_id = ?'

  for (const key of ['platform', 'intent_label', 'current_stage']) {
    if (req.query[key]) {
      where += ` AND c.${key} = ?`
      params.push(req.query[key])
    }
  }
  where += dateRange(req.query, 'c.last_message_at', params)
  if (req.query.keyword) {
    where += ` AND EXISTS (
      SELECT 1 FROM messages m
      WHERE m.conversation_id = c.id AND m.tenant_id = c.tenant_id AND m.content_text LIKE ?
    )`
    params.push(`%${req.query.keyword}%`)
  }

  try {
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM conversations c ${where}`, params)
    const [rows] = await pool.query(
      `SELECT c.id, c.platform, c.platform_page, c.customer_nickname, c.customer_platform_uid,
              c.intent_label, c.intent_confidence, c.intent_source, c.current_stage,
              c.completeness_score, c.message_count,
              DATE_FORMAT(c.last_message_at, '%Y-%m-%d %H:%i:%s') AS last_message_at,
              DATE_FORMAT(c.last_inbound_at, '%Y-%m-%d %H:%i:%s') AS last_inbound_at,
              DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM conversations c ${where}
       ORDER BY c.last_message_at DESC, c.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    )
    ok(res, { list: rows, total, page, page_size: pageSize })
  } catch (err) {
    console.error('[v1.conversations.list]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function detail(req, res) {
  const tenant = tenantId(req)
  try {
    const [rows] = await pool.query(
      `SELECT c.*, l.id AS lead_id
       FROM conversations c
       LEFT JOIN leads l ON l.primary_conversation_id = c.id AND l.tenant_id = c.tenant_id
       WHERE c.tenant_id = ? AND c.id = ?
       LIMIT 1`,
      [tenant, req.params.id]
    )
    if (!rows.length) return fail(res, 404, 2001, '会话不存在')
    const [workorders] = await pool.query(
      'SELECT id FROM workorders WHERE tenant_id = ? AND conversation_id = ? ORDER BY id DESC',
      [tenant, req.params.id]
    )
    ok(res, { ...rows[0], workorder_ids: workorders.map((row) => row.id) })
  } catch (err) {
    console.error('[v1.conversations.detail]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function messages(req, res) {
  const tenant = tenantId(req)
  const { page, pageSize, offset } = paging(req.query)
  try {
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM messages WHERE tenant_id = ? AND conversation_id = ?',
      [tenant, req.params.id]
    )
    const [rows] = await pool.query(
      `SELECT id, direction, sender_nickname, content_type, content_text, content_url, raw_snapshot,
              DATE_FORMAT(occurred_at, '%Y-%m-%d %H:%i:%s') AS occurred_at
       FROM messages
       WHERE tenant_id = ? AND conversation_id = ?
       ORDER BY occurred_at ASC, id ASC
       LIMIT ? OFFSET ?`,
      [tenant, req.params.id, pageSize, offset]
    )
    ok(res, {
      list: rows.map((row) => ({ ...row, raw_snapshot: parseJsonField(row.raw_snapshot) })),
      total,
      page,
      page_size: pageSize,
    })
  } catch (err) {
    console.error('[v1.conversations.messages]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

module.exports = { list, detail, messages }
