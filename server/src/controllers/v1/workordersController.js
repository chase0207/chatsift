const pool = require('../../config/db')
const { ok, fail, tenantId, paging, jsonValue, parseJsonField } = require('./_shared')

async function list(req, res) {
  const tenant = tenantId(req)
  const { page, pageSize, offset } = paging(req.query)
  const params = [tenant]
  let where = 'WHERE w.tenant_id = ?'

  for (const key of ['workorder_type', 'status', 'assigned_to', 'priority']) {
    if (req.query[key]) {
      where += ` AND w.${key} = ?`
      params.push(req.query[key])
    }
  }
  if (req.query.overdue === 'true') {
    where += ' AND w.status <> ? AND w.sla_due_at IS NOT NULL AND w.sla_due_at < NOW()'
    params.push('done')
  }

  try {
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM workorders w ${where}`, params)
    const [rows] = await pool.query(
      `SELECT w.id, w.conversation_id, w.lead_id, w.workorder_type, w.title, w.payload,
              w.completeness_score, w.missing_fields, w.suggestion, w.priority,
              DATE_FORMAT(w.sla_due_at, '%Y-%m-%d %H:%i:%s') AS sla_due_at,
              w.status, w.assigned_to,
              DATE_FORMAT(w.assigned_at, '%Y-%m-%d %H:%i:%s') AS assigned_at,
              DATE_FORMAT(w.completed_at, '%Y-%m-%d %H:%i:%s') AS completed_at,
              DATE_FORMAT(w.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
              c.customer_nickname
       FROM workorders w
       LEFT JOIN conversations c ON c.id = w.conversation_id AND c.tenant_id = w.tenant_id
       ${where}
       ORDER BY w.priority ASC, w.id DESC LIMIT ? OFFSET ?`,
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
      `SELECT w.*, c.customer_nickname
       FROM workorders w
       LEFT JOIN conversations c ON c.id = w.conversation_id AND c.tenant_id = w.tenant_id
       WHERE w.tenant_id = ? AND w.id = ? LIMIT 1`,
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
