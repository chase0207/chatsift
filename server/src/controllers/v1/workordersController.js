const pool = require('../../config/db')
const { ok, fail, tenantId, paging, jsonValue, parseJsonField } = require('./_shared')

async function list(req, res) {
  const tenant = tenantId(req)
  const { page, pageSize, offset } = paging(req.query)
  const params = [tenant]
  let where = 'WHERE tenant_id = ?'

  for (const key of ['workorder_type', 'status', 'assigned_to', 'priority']) {
    if (req.query[key]) {
      where += ` AND ${key} = ?`
      params.push(req.query[key])
    }
  }
  if (req.query.overdue === 'true') {
    where += ' AND status <> ? AND sla_due_at IS NOT NULL AND sla_due_at < NOW()'
    params.push('done')
  }

  try {
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM workorders ${where}`, params)
    const [rows] = await pool.query(
      `SELECT id, conversation_id, lead_id, workorder_type, title, payload,
              completeness_score, missing_fields, suggestion, priority,
              DATE_FORMAT(sla_due_at, '%Y-%m-%d %H:%i:%s') AS sla_due_at,
              status, assigned_to,
              DATE_FORMAT(assigned_at, '%Y-%m-%d %H:%i:%s') AS assigned_at,
              DATE_FORMAT(completed_at, '%Y-%m-%d %H:%i:%s') AS completed_at,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM workorders ${where}
       ORDER BY priority ASC, id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    )
    ok(res, {
      list: rows.map(normalize),
      total,
      page,
      page_size: pageSize,
    })
  } catch (err) {
    console.error('[v1.workorders.list]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function detail(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM workorders WHERE tenant_id = ? AND id = ? LIMIT 1',
      [tenantId(req), req.params.id]
    )
    if (!rows.length) return fail(res, 404, 2001, '工单不存在')
    ok(res, normalize(rows[0]))
  } catch (err) {
    console.error('[v1.workorders.detail]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function update(req, res) {
  const allowed = ['status', 'title', 'suggestion', 'priority', 'completeness_score', 'assigned_to', 'sla_due_at']
  const fields = []
  const values = []
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      fields.push(`${key} = ?`)
      values.push(req.body[key])
    }
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'payload')) {
    fields.push('payload = ?')
    values.push(jsonValue(req.body.payload))
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'missing_fields')) {
    fields.push('missing_fields = ?')
    values.push(jsonValue(req.body.missing_fields))
  }
  if (req.body.status === 'done') fields.push('completed_at = NOW()')
  if (!fields.length) return fail(res, 400, 1003, '没有可更新字段')

  try {
    const [result] = await pool.query(
      `UPDATE workorders SET ${fields.join(', ')} WHERE tenant_id = ? AND id = ?`,
      [...values, tenantId(req), req.params.id]
    )
    if (!result.affectedRows) return fail(res, 404, 2001, '工单不存在')
    ok(res)
  } catch (err) {
    console.error('[v1.workorders.update]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function assign(req, res) {
  if (!req.body.assigned_to) return fail(res, 400, 1003, 'assigned_to 不能为空')
  try {
    const [result] = await pool.query(
      `UPDATE workorders
       SET assigned_to = ?, assigned_at = NOW(), status = 'assigned'
       WHERE tenant_id = ? AND id = ?`,
      [req.body.assigned_to, tenantId(req), req.params.id]
    )
    if (!result.affectedRows) return fail(res, 404, 2001, '工单不存在')
    ok(res)
  } catch (err) {
    console.error('[v1.workorders.assign]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

function normalize(row) {
  return {
    ...row,
    payload: parseJsonField(row.payload, {}),
    missing_fields: parseJsonField(row.missing_fields, []),
  }
}

module.exports = { list, detail, update, assign }
