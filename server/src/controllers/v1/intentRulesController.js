const pool = require('../../config/db')
const { ok, fail, tenantId, paging } = require('./_shared')

async function list(req, res) {
  const tenant = tenantId(req)
  const { page, pageSize, offset } = paging(req.query)
  try {
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM intent_rules WHERE tenant_id IN (0, ?)',
      [tenant]
    )
    const [rows] = await pool.query(
      `SELECT id, tenant_id, intent_label, rule_type, pattern, priority, enabled,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM intent_rules
       WHERE tenant_id IN (0, ?)
       ORDER BY tenant_id ASC, priority ASC, id ASC
       LIMIT ? OFFSET ?`,
      [tenant, pageSize, offset]
    )
    ok(res, { list: rows, total, page, page_size: pageSize })
  } catch (err) {
    console.error('[v1.intentRules.list]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function create(req, res) {
  const { intent_label, rule_type = 'keyword', pattern, priority = 100, enabled = 1 } = req.body
  if (!intent_label || !pattern) return fail(res, 400, 1003, 'intent_label 和 pattern 不能为空')
  try {
    const [result] = await pool.query(
      `INSERT INTO intent_rules (tenant_id, intent_label, rule_type, pattern, priority, enabled)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tenantId(req), intent_label, rule_type, pattern, priority, enabled]
    )
    ok(res, { id: result.insertId })
  } catch (err) {
    console.error('[v1.intentRules.create]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function update(req, res) {
  const allowed = ['intent_label', 'rule_type', 'pattern', 'priority', 'enabled']
  const fields = []
  const values = []
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      fields.push(`${key} = ?`)
      values.push(req.body[key])
    }
  }
  if (!fields.length) return fail(res, 400, 1003, '没有可更新字段')
  try {
    const [result] = await pool.query(
      `UPDATE intent_rules SET ${fields.join(', ')}
       WHERE tenant_id = ? AND id = ?`,
      [...values, tenantId(req), req.params.id]
    )
    if (!result.affectedRows) return fail(res, 404, 2001, '规则不存在或全局规则不可修改')
    ok(res)
  } catch (err) {
    console.error('[v1.intentRules.update]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function remove(req, res) {
  try {
    const [result] = await pool.query(
      'DELETE FROM intent_rules WHERE tenant_id = ? AND id = ?',
      [tenantId(req), req.params.id]
    )
    if (!result.affectedRows) return fail(res, 404, 2001, '规则不存在或全局规则不可删除')
    ok(res)
  } catch (err) {
    console.error('[v1.intentRules.remove]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

module.exports = { list, create, update, remove }
