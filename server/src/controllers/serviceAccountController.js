const pool = require('../config/db')
const { insertAudit } = require('../utils/account-audit')

// W20:校验 employeeId 是 sa 同租户的客服(external + role_code='agent')。返回 { ok, reason }。
async function validateAgentInTenant(conn, employeeId, tenantId) {
  const [[emp]] = await conn.query(
    'SELECT u.tenant_id, u.user_type, r.role_code FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ? LIMIT 1',
    [employeeId]
  )
  if (!emp) return { ok: false, reason: '员工不存在' }
  if (emp.tenant_id !== tenantId) return { ok: false, reason: '员工与客服账号不属同一租户' }
  if (emp.user_type !== 'external' || emp.role_code !== 'agent') return { ok: false, reason: '只能指派给本租户客服(agent)' }
  return { ok: true }
}

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
    // 仅客服(agent)可分配账号:租户超管按 design §5.4 看本租户全部、不受分配限制,故不列入
    const [rows] = await pool.query(
      `SELECT u.id, u.username, COALESCE(r.name,'') AS role_name, r.role_code
       FROM users u LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.tenant_id = ? AND u.user_type = 'external' AND r.role_code = 'agent'
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
    const [[sa]] = await pool.query('SELECT tenant_id FROM service_accounts WHERE id = ? LIMIT 1', [id])
    if (!sa) return res.status(404).json({ code: 404, message: '客服账号不存在' })
    if (req.user.user_type === 'external' && sa.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({ code: 403, message: '无权查看其他租户的客服账号' })
    }
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
    const [[emp]] = await pool.query(
      'SELECT u.tenant_id, r.role_code FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ? LIMIT 1',
      [employeeId]
    )
    if (!emp) return res.status(404).json({ code: 404, message: '员工不存在' })
    if (emp.tenant_id !== sa.tenant_id) return res.status(400).json({ code: 400, message: '员工与客服账号不属同一租户' })
    // 仅客服可被分配(超管看全租户,分配无意义)
    if (emp.role_code !== 'agent') return res.status(400).json({ code: 400, message: '只能将账号分配给客服' })
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
    const [[sa]] = await pool.query('SELECT tenant_id FROM service_accounts WHERE id = ? LIMIT 1', [id])
    if (!sa) return res.status(404).json({ code: 404, message: '客服账号不存在' })
    if (req.user.user_type === 'external' && sa.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({ code: 403, message: '无权解绑其他租户的客服账号' })
    }
    await pool.query(
      'DELETE FROM employee_service_account WHERE tenant_id = ? AND service_account_id = ? AND employee_id = ?',
      [sa.tenant_id, id, employeeId]
    )
    res.json({ code: 0 })
  } catch (err) {
    console.error('[serviceAccount.unassign]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// POST /api/service-accounts/:id/confirm  { collector_id?, viewer_ids? }
//   W20-B:pending→active;设正式采集负责人(默认=临时人,可改)collector_kind='formal';
//   确保 collector 有查看权(view 行);可附加查看人;audit confirm。
async function confirm(req, res) {
  const id = parseInt(req.params.id)
  const conn = await pool.getConnection()
  try {
    const [[sa]] = await conn.query(
      'SELECT id, tenant_id, lifecycle, collector_id FROM service_accounts WHERE id = ? LIMIT 1',
      [id]
    )
    if (!sa) { conn.release(); return res.status(404).json({ code: 404, message: '客服账号不存在' }) }
    if (req.user.user_type === 'external' && sa.tenant_id !== req.user.tenant_id) {
      conn.release(); return res.status(403).json({ code: 403, message: '无权操作其他租户的客服账号' })
    }
    if (sa.lifecycle !== 'pending') {
      conn.release(); return res.status(400).json({ code: 400, message: '该账号非待确认状态' })
    }

    const collectorId = req.body.collector_id ? parseInt(req.body.collector_id) : sa.collector_id
    if (!collectorId) { conn.release(); return res.status(400).json({ code: 400, message: '缺少采集负责人' }) }
    const vc = await validateAgentInTenant(conn, collectorId, sa.tenant_id)
    if (!vc.ok) { conn.release(); return res.status(400).json({ code: 400, message: vc.reason }) }

    const viewerIds = Array.isArray(req.body.viewer_ids) ? req.body.viewer_ids.map((v) => parseInt(v)).filter(Boolean) : []
    for (const vid of viewerIds) {
      const vv = await validateAgentInTenant(conn, vid, sa.tenant_id)
      if (!vv.ok) { conn.release(); return res.status(400).json({ code: 400, message: `查看人无效:${vv.reason}` }) }
    }

    await conn.beginTransaction()
    await conn.query(
      `UPDATE service_accounts SET lifecycle='active', collector_id=?, collector_kind='formal' WHERE id=?`,
      [collectorId, id]
    )
    // 采集人默认查看权(确保 view 行)
    await conn.query(
      `INSERT IGNORE INTO service_account_view (tenant_id, service_account_id, employee_id, granted_by)
       VALUES (?,?,?,?)`,
      [sa.tenant_id, id, collectorId, req.user.id]
    )
    for (const vid of viewerIds) {
      await conn.query(
        `INSERT IGNORE INTO service_account_view (tenant_id, service_account_id, employee_id, granted_by)
         VALUES (?,?,?,?)`,
        [sa.tenant_id, id, vid, req.user.id]
      )
    }
    await insertAudit(conn, {
      tenantId: sa.tenant_id, operatorUserId: req.user.id, targetEmployeeId: collectorId, serviceAccountId: id,
      eventType: 'confirm',
      beforeValue: { lifecycle: 'pending', collector_id: sa.collector_id },
      afterValue: { lifecycle: 'active', collector_id: collectorId, collector_kind: 'formal', viewer_ids: viewerIds },
    })
    await conn.commit()
    res.json({ code: 0 })
  } catch (err) {
    await conn.rollback()
    console.error('[serviceAccount.confirm]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  } finally {
    conn.release()
  }
}

module.exports = { list, employees, assignments, assign, unassign, confirm }
