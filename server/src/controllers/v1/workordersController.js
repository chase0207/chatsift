const pool = require('../../config/db')
const { ok, fail, scope, paging, jsonValue, parseJsonField } = require('./_shared')

async function list(req, res) {
  const { page, pageSize, offset } = paging(req.query)
  const s = await scope(req, { tenantCol: 'w.tenant_id', saCol: 'w.service_account_id' })
  // W22:基础筛选(状态/优先级/超时,不含 workorder_type)——tab 类型单独叠加
  let baseWhere = 'WHERE 1=1' + s.sql
  const baseParams = [...s.params]
  for (const key of ['status', 'assigned_to', 'priority']) {
    if (req.query[key]) {
      baseWhere += ` AND w.${key} = ?`
      baseParams.push(req.query[key])
    }
  }
  if (req.query.overdue === 'true') {
    baseWhere += ' AND w.status <> ? AND w.sla_due_at IS NOT NULL AND w.sla_due_at < NOW()'
    baseParams.push('done')
  }
  // 当前 tab 类型,叠加在基础筛选之上
  let listWhere = baseWhere
  const listParams = [...baseParams]
  if (req.query.workorder_type) {
    listWhere += ' AND w.workorder_type = ?'
    listParams.push(req.query.workorder_type)
  }

  try {
    // tab 数字:各类型在"基础筛选(不含类型)"下的数量,不受当前选中 tab 自身影响
    const [countRows] = await pool.query(
      `SELECT w.workorder_type AS t, COUNT(*) AS cnt FROM workorders w ${baseWhere} GROUP BY w.workorder_type`,
      baseParams
    )
    const counts = { all: 0, appointment: 0, inquiry: 0, pricing: 0, complaint: 0 }
    for (const r of countRows) {
      if (Object.prototype.hasOwnProperty.call(counts, r.t)) counts[r.t] = r.cnt
      counts.all += r.cnt
    }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM workorders w ${listWhere}`, listParams)
    const [rows] = await pool.query(
      `SELECT w.id, w.conversation_id, w.lead_id, w.workorder_type, w.payload,
              w.completeness_score, w.missing_fields, w.suggestion, w.priority,
              DATE_FORMAT(w.sla_due_at, '%Y-%m-%d %H:%i:%s') AS sla_due_at,
              w.status, w.assigned_to,
              DATE_FORMAT(w.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
              c.customer_nickname, l.customer_name
       FROM workorders w
       LEFT JOIN conversations c ON c.id = w.conversation_id AND c.tenant_id = w.tenant_id
       LEFT JOIN leads l ON l.id = w.lead_id AND l.tenant_id = w.tenant_id
       ${listWhere}
       ORDER BY w.priority ASC, w.id DESC LIMIT ? OFFSET ?`,
      [...listParams, pageSize, offset]
    )
    ok(res, {
      list: rows.map(normalize),
      total,
      counts,
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
    const s = await scope(req, { tenantCol: 'w.tenant_id', saCol: 'w.service_account_id' })
    const [rows] = await pool.query(
      `SELECT w.*, c.customer_nickname
       FROM workorders w
       LEFT JOIN conversations c ON c.id = w.conversation_id AND c.tenant_id = w.tenant_id
       WHERE w.id = ?${s.sql} LIMIT 1`,
      [req.params.id, ...s.params]
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
    const s = await scope(req, { tenantCol: 'tenant_id', saCol: 'service_account_id' })
    const [result] = await pool.query(
      `UPDATE workorders SET ${fields.join(', ')} WHERE id = ?${s.sql}`,
      [...values, req.params.id, ...s.params]
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
    const s = await scope(req, { tenantCol: 'tenant_id', saCol: 'service_account_id' })
    const [result] = await pool.query(
      `UPDATE workorders
       SET assigned_to = ?, assigned_at = NOW(), status = 'assigned'
       WHERE id = ?${s.sql}`,
      [req.body.assigned_to, req.params.id, ...s.params]
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
