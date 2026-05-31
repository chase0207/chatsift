const pool = require('../../config/db')
const { ok, fail, tenantId, paging, jsonValue, parseJsonField } = require('./_shared')

async function list(req, res) {
  const tenant = tenantId(req)
  const { page, pageSize, offset } = paging(req.query)
  const params = [tenant]
  let where = 'WHERE tenant_id = ?'

  for (const key of ['status', 'lead_level', 'assigned_to', 'city']) {
    if (req.query[key]) {
      where += ` AND ${key} = ?`
      params.push(req.query[key])
    }
  }
  if (req.query.keyword) {
    where += ' AND (customer_nickname LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ? OR customer_wechat LIKE ?)'
    const keyword = `%${req.query.keyword}%`
    params.push(keyword, keyword, keyword, keyword)
  }

  try {
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM leads ${where}`, params)
    const [rows] = await pool.query(
      `SELECT id, primary_conversation_id, customer_nickname, customer_name, customer_platform_uid, customer_phone,
              customer_wechat, city, intent_label, lead_score, lead_level, tags, status,
              assigned_to, DATE_FORMAT(last_followed_at, '%Y-%m-%d %H:%i:%s') AS last_followed_at,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
              DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM leads ${where}
       ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    )
    ok(res, {
      list: rows.map((row) => ({ ...row, tags: parseJsonField(row.tags, []) })),
      total,
      page,
      page_size: pageSize,
    })
  } catch (err) {
    console.error('[v1.leads.list]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function detail(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM leads WHERE tenant_id = ? AND id = ? LIMIT 1',
      [tenantId(req), req.params.id]
    )
    if (!rows.length) return fail(res, 404, 2001, '线索不存在')
    const lead = { ...rows[0], tags: parseJsonField(rows[0].tags, []) }
    const [conversations] = await pool.query(
      `SELECT id, platform, platform_page, platform_conversation_id,
              customer_nickname, customer_platform_uid, intent_label, current_stage,
              completeness_score, message_count,
              DATE_FORMAT(last_message_at, '%Y-%m-%d %H:%i:%s') AS last_message_at
       FROM conversations
       WHERE tenant_id = ? AND id = ?
       LIMIT 1`,
      [tenantId(req), lead.primary_conversation_id]
    )
    const [workorders] = await pool.query(
      `SELECT id, conversation_id, workorder_type, title, completeness_score,
              missing_fields, suggestion, priority, status,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM workorders
       WHERE tenant_id = ? AND conversation_id = ?
       ORDER BY id DESC`,
      [tenantId(req), lead.primary_conversation_id]
    )
    ok(res, {
      lead,
      conversation: conversations[0] || null,
      workorders: workorders.map((row) => ({
        ...row,
        missing_fields: parseJsonField(row.missing_fields, []),
      })),
    })
  } catch (err) {
    console.error('[v1.leads.detail]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function update(req, res) {
  const allowed = [
    'status',
    'lead_level',
    'assigned_to',
    'customer_name',
    'customer_phone',
    'customer_wechat',
    'city',
    'lead_score',
    'intent_label',
    'customer_nickname',
  ]
  const fields = []
  const values = []
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      fields.push(`${key} = ?`)
      values.push(req.body[key])
    }
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'tags')) {
    fields.push('tags = ?')
    values.push(jsonValue(req.body.tags))
  }
  if (req.body.status === 'following') {
    fields.push('last_followed_at = NOW()')
  }
  if (!fields.length) return fail(res, 400, 1003, '没有可更新字段')

  try {
    const [result] = await pool.query(
      `UPDATE leads SET ${fields.join(', ')} WHERE tenant_id = ? AND id = ?`,
      [...values, tenantId(req), req.params.id]
    )
    if (!result.affectedRows) return fail(res, 404, 2001, '线索不存在')
    ok(res)
  } catch (err) {
    console.error('[v1.leads.update]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function convert(req, res) {
  try {
    const [result] = await pool.query(
      `UPDATE leads
       SET status = 'converted', last_followed_at = NOW()
       WHERE tenant_id = ? AND id = ?`,
      [tenantId(req), req.params.id]
    )
    if (!result.affectedRows) return fail(res, 404, 2001, '线索不存在')
    ok(res)
  } catch (err) {
    console.error('[v1.leads.convert]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

module.exports = { list, detail, update, convert }
