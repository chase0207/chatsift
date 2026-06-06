const pool = require('../config/db')

// GET /api/service-accounts?tenant_id=&page=&size=  客服账号列表(平台方可按租户筛)
async function list(req, res) {
  const page    = Math.max(1, parseInt(req.query.page) || 1)
  const size    = Math.min(100, parseInt(req.query.size) || 20)
  const offset  = (page - 1) * size
  // W19-C3:租户方(超管)强制本租户;平台方(若访问)可按 query 筛
  const tenantId = req.user.user_type === 'external'
    ? req.user.tenant_id
    : (req.query.tenant_id ? parseInt(req.query.tenant_id) : null)
  try {
    const where  = tenantId ? 'WHERE sa.tenant_id = ?' : ''
    const params = tenantId ? [tenantId] : []
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM service_accounts sa ${where}`, params)
    const [rows] = await pool.query(
      `SELECT sa.id, sa.tenant_id, t.name AS tenant_name,
              sa.account_biz_id, sa.account_nickname, sa.status,
              p.platform_name, pp.page_name,
              DATE_FORMAT(sa.first_seen_at, '%Y-%m-%d %H:%i:%s') AS first_seen_at,
              (SELECT COUNT(*) FROM employee_service_account esa WHERE esa.service_account_id = sa.id) AS assigned_count
       FROM service_accounts sa
       LEFT JOIN tenants t ON t.id = sa.tenant_id
       LEFT JOIN platforms p ON p.id = sa.platform_id
       LEFT JOIN platform_pages pp ON pp.id = sa.page_id
       ${where} ORDER BY sa.id DESC LIMIT ? OFFSET ?`,
      [...params, size, offset]
    )
    res.json({ code: 0, data: { list: rows, total, page, size } })
  } catch (err) {
    console.error('[serviceAccount.list]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// GET /api/service-accounts/employees?tenant_id=  某租户员工(供分配选择)
async function employees(req, res) {
  // W19-C3:租户方强制本租户
  const tenantId = req.user.user_type === 'external'
    ? req.user.tenant_id
    : (req.query.tenant_id ? parseInt(req.query.tenant_id) : null)
  if (!tenantId) return res.status(400).json({ code: 400, message: '缺少 tenant_id' })
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.username, COALESCE(r.name,'') AS role_name, r.role_code
       FROM users u LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.tenant_id = ? AND u.user_type = 'external'
       ORDER BY u.id`,
      [tenantId]
    )
    res.json({ code: 0, data: rows })
  } catch (err) {
    console.error('[serviceAccount.employees]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// GET /api/service-accounts/:id/assignments  该账号已分配的员工 id
async function assignments(req, res) {
  const id = parseInt(req.params.id)
  try {
    const [rows] = await pool.query(
      'SELECT employee_id FROM employee_service_account WHERE service_account_id = ?', [id]
    )
    res.json({ code: 0, data: rows.map((r) => r.employee_id) })
  } catch (err) {
    console.error('[serviceAccount.assignments]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// POST /api/service-accounts/:id/assignments  { employee_id } 分配(校验同租户)
async function assign(req, res) {
  const id = parseInt(req.params.id)
  const employeeId = parseInt(req.body.employee_id)
  if (!employeeId) return res.status(400).json({ code: 400, message: '缺少 employee_id' })
  try {
    const [[sa]] = await pool.query('SELECT tenant_id FROM service_accounts WHERE id = ? LIMIT 1', [id])
    if (!sa) return res.status(404).json({ code: 404, message: '客服账号不存在' })
    // W19-C3:租户方只能分配本租户的客服账号
    if (req.user.user_type === 'external' && sa.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({ code: 403, message: '无权分配其他租户的客服账号' })
    }
    const [[emp]] = await pool.query('SELECT tenant_id FROM users WHERE id = ? LIMIT 1', [employeeId])
    if (!emp) return res.status(404).json({ code: 404, message: '员工不存在' })
    if (emp.tenant_id !== sa.tenant_id) return res.status(400).json({ code: 400, message: '员工与客服账号不属同一租户' })
    await pool.query(
      `INSERT IGNORE INTO employee_service_account (tenant_id, employee_id, service_account_id, assigned_by)
       VALUES (?,?,?,?)`,
      [sa.tenant_id, employeeId, id, req.user.id]
    )
    res.json({ code: 0 })
  } catch (err) {
    console.error('[serviceAccount.assign]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// DELETE /api/service-accounts/:id/assignments/:employeeId  解绑
async function unassign(req, res) {
  const id = parseInt(req.params.id)
  const employeeId = parseInt(req.params.employeeId)
  try {
    await pool.query(
      'DELETE FROM employee_service_account WHERE service_account_id = ? AND employee_id = ?',
      [id, employeeId]
    )
    res.json({ code: 0 })
  } catch (err) {
    console.error('[serviceAccount.unassign]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

module.exports = { list, employees, assignments, assign, unassign }
