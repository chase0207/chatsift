const pool = require('../config/db')
const { insertAudit } = require('../utils/account-audit')

// W20:校验 employeeId 是 sa 同租户的客服(external + role_code='agent')。用于查看权指派。返回 { ok, reason }。
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

// W20:校验 employeeId 可作为采集人 —— 同租户 external 员工(agent 或 tenant_admin)。
//   PRD §5.1:租户管理员可给自己或他人分配采集权,故采集人不限于 agent;internal/他租户/未知一律拒。
async function validateCollectorInTenant(conn, employeeId, tenantId) {
  const [[emp]] = await conn.query(
    'SELECT u.tenant_id, u.user_type, r.role_code FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ? LIMIT 1',
    [employeeId]
  )
  if (!emp) return { ok: false, reason: '员工不存在' }
  if (emp.tenant_id !== tenantId) return { ok: false, reason: '员工与客服账号不属同一租户' }
  if (emp.user_type !== 'external' || (emp.role_code !== 'agent' && emp.role_code !== 'tenant_admin')) {
    return { ok: false, reason: '采集人必须是本租户员工(客服或管理员)' }
  }
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
              sa.lifecycle, sa.collector_kind,
              sa.collector_id, cu.username AS collector_name,
              sa.first_seen_by, fu.username AS first_seen_by_name,
              p.platform_name, pp.page_name,
              DATE_FORMAT(sa.first_seen_at, '%Y-%m-%d %H:%i:%s') AS first_seen_at,
              (SELECT COUNT(*) FROM service_account_view v WHERE v.service_account_id = sa.id) AS view_count,
              (SELECT DATE_FORMAT(MAX(m.uploaded_at), '%Y-%m-%d %H:%i:%s') FROM messages m WHERE m.service_account_id = sa.id) AS last_collect_at
       FROM service_accounts sa
       LEFT JOIN tenants t ON t.id = sa.tenant_id
       LEFT JOIN platforms p ON p.id = sa.platform_id
       LEFT JOIN platform_pages pp ON pp.id = sa.page_id
       LEFT JOIN users cu ON cu.id = sa.collector_id
       LEFT JOIN users fu ON fu.id = sa.first_seen_by
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
    // W20:返回本租户 external 员工(agent + tenant_admin)。采集人可为二者之一(PRD §5.1);
    //   查看人前端只取 agent(管理员默认看全租户,无需查看权)。role_code 供前端区分。
    const [rows] = await pool.query(
      `SELECT u.id, u.username, COALESCE(r.name,'') AS role_name, r.role_code
       FROM users u LEFT JOIN roles r ON r.id = u.role_id
       WHERE u.tenant_id = ? AND u.user_type = 'external' AND r.role_code IN ('agent','tenant_admin')
       ORDER BY FIELD(r.role_code,'agent','tenant_admin'), u.id`,
      [tenantId]
    )
    res.json({ code: 0, data: rows })
  } catch (err) {
    console.error('[serviceAccount.employees]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// W20:加载 sa + 本租户校验。返回 sa 或 null(已写错误响应)。
async function loadSaScoped(req, res, id) {
  const [[sa]] = await pool.query(
    'SELECT id, tenant_id, lifecycle, collector_id FROM service_accounts WHERE id = ? LIMIT 1', [id]
  )
  if (!sa) { res.status(404).json({ code: 404, message: '客服账号不存在' }); return null }
  if (req.user.user_type === 'external' && sa.tenant_id !== req.user.tenant_id) {
    res.status(403).json({ code: 403, message: '无权操作其他租户的客服账号' }); return null
  }
  return sa
}

// GET /api/service-accounts/:id/views(= 旧 /assignments)  该账号查看人 id 列表
async function assignments(req, res) {
  const id = parseInt(req.params.id)
  try {
    const sa = await loadSaScoped(req, res, id)
    if (!sa) return
    const [rows] = await pool.query(
      'SELECT employee_id FROM service_account_view WHERE service_account_id = ?', [id]
    )
    res.json({ code: 0, data: rows.map((r) => r.employee_id) })
  } catch (err) {
    console.error('[serviceAccount.views]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// POST /api/service-accounts/:id/views(= 旧 /assignments) { employee_id } 加查看权 + audit view_add
async function assign(req, res) {
  const id = parseInt(req.params.id)
  const employeeId = parseInt(req.body.employee_id)
  if (!employeeId) return res.status(400).json({ code: 400, message: '缺少 employee_id' })
  const conn = await pool.getConnection()
  try {
    const [[sa]] = await conn.query('SELECT id, tenant_id FROM service_accounts WHERE id = ? LIMIT 1', [id])
    if (!sa) { conn.release(); return res.status(404).json({ code: 404, message: '客服账号不存在' }) }
    if (req.user.user_type === 'external' && sa.tenant_id !== req.user.tenant_id) {
      conn.release(); return res.status(403).json({ code: 403, message: '无权操作其他租户的客服账号' })
    }
    const v = await validateAgentInTenant(conn, employeeId, sa.tenant_id)
    if (!v.ok) { conn.release(); return res.status(400).json({ code: 400, message: v.reason }) }
    const [r] = await conn.query(
      `INSERT IGNORE INTO service_account_view (tenant_id, service_account_id, employee_id, granted_by)
       VALUES (?,?,?,?)`,
      [sa.tenant_id, id, employeeId, req.user.id]
    )
    if (r.affectedRows) {
      await insertAudit(conn, {
        tenantId: sa.tenant_id, operatorUserId: req.user.id, targetEmployeeId: employeeId,
        serviceAccountId: id, eventType: 'view_add',
      })
    }
    res.json({ code: 0 })
  } catch (err) {
    console.error('[serviceAccount.viewAdd]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  } finally {
    conn.release()
  }
}

// DELETE /api/service-accounts/:id/views/:employeeId(= 旧 /assignments) 删查看权 + audit view_remove
async function unassign(req, res) {
  const id = parseInt(req.params.id)
  const employeeId = parseInt(req.params.employeeId)
  const conn = await pool.getConnection()
  try {
    const [[sa]] = await conn.query('SELECT id, tenant_id FROM service_accounts WHERE id = ? LIMIT 1', [id])
    if (!sa) { conn.release(); return res.status(404).json({ code: 404, message: '客服账号不存在' }) }
    if (req.user.user_type === 'external' && sa.tenant_id !== req.user.tenant_id) {
      conn.release(); return res.status(403).json({ code: 403, message: '无权操作其他租户的客服账号' })
    }
    const [r] = await conn.query(
      'DELETE FROM service_account_view WHERE tenant_id = ? AND service_account_id = ? AND employee_id = ?',
      [sa.tenant_id, id, employeeId]
    )
    if (r.affectedRows) {
      await insertAudit(conn, {
        tenantId: sa.tenant_id, operatorUserId: req.user.id, targetEmployeeId: employeeId,
        serviceAccountId: id, eventType: 'view_remove',
      })
    }
    res.json({ code: 0 })
  } catch (err) {
    console.error('[serviceAccount.viewRemove]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  } finally {
    conn.release()
  }
}

// PUT /api/service-accounts/:id/collector  { employee_id } 采集权重分配
//   校验同租户 agent;记 old/new;新 collector 自动加 view 行;audit reassign_collector。
async function reassignCollector(req, res) {
  const id = parseInt(req.params.id)
  const employeeId = parseInt(req.body.employee_id)
  if (!employeeId) return res.status(400).json({ code: 400, message: '缺少 employee_id' })
  const conn = await pool.getConnection()
  try {
    const sa = await loadSaScoped(req, res, id)
    if (!sa) { conn.release(); return }
    const v = await validateCollectorInTenant(conn, employeeId, sa.tenant_id)
    if (!v.ok) { conn.release(); return res.status(400).json({ code: 400, message: v.reason }) }
    if (sa.collector_id === employeeId) { conn.release(); return res.json({ code: 0 }) }

    await conn.beginTransaction()
    const kind = sa.lifecycle === 'pending' ? 'temp' : 'formal'
    await conn.query('UPDATE service_accounts SET collector_id=?, collector_kind=? WHERE id=?', [employeeId, kind, id])
    await conn.query(
      `INSERT IGNORE INTO service_account_view (tenant_id, service_account_id, employee_id, granted_by)
       VALUES (?,?,?,?)`,
      [sa.tenant_id, id, employeeId, req.user.id]
    )
    await insertAudit(conn, {
      tenantId: sa.tenant_id, operatorUserId: req.user.id, targetEmployeeId: employeeId, serviceAccountId: id,
      eventType: 'reassign_collector',
      beforeValue: { collector_id: sa.collector_id },
      afterValue: { collector_id: employeeId, collector_kind: kind },
    })
    await conn.commit()
    res.json({ code: 0 })
  } catch (err) {
    await conn.rollback()
    console.error('[serviceAccount.reassignCollector]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  } finally {
    conn.release()
  }
}

// PUT /api/service-accounts/:id/disable | /enable  lifecycle 切 disabled/active(历史数据不删)
function setLifecycle(target) {
  return async function (req, res) {
    const id = parseInt(req.params.id)
    const conn = await pool.getConnection()
    try {
      const sa = await loadSaScoped(req, res, id)
      if (!sa) { conn.release(); return }
      await conn.beginTransaction()
      await conn.query('UPDATE service_accounts SET lifecycle=? WHERE id=?', [target, id])
      await insertAudit(conn, {
        tenantId: sa.tenant_id, operatorUserId: req.user.id, serviceAccountId: id,
        eventType: target === 'disabled' ? 'disable' : 'enable',
        beforeValue: { lifecycle: sa.lifecycle }, afterValue: { lifecycle: target },
      })
      await conn.commit()
      res.json({ code: 0 })
    } catch (err) {
      await conn.rollback()
      console.error('[serviceAccount.setLifecycle]', err)
      res.status(500).json({ code: 500, message: '服务器错误' })
    } finally {
      conn.release()
    }
  }
}

// GET /api/service-accounts/:id/conflicts  采集实例冲突记录(audit instance_conflict)
async function conflicts(req, res) {
  const id = parseInt(req.params.id)
  try {
    const sa = await loadSaScoped(req, res, id)
    if (!sa) return
    const [rows] = await pool.query(
      `SELECT id, target_employee_id, before_value, after_value, device_id, browser_profile_id, tab_id,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM service_account_audit
       WHERE service_account_id = ? AND event_type = 'instance_conflict'
       ORDER BY id DESC LIMIT 100`,
      [id]
    )
    res.json({ code: 0, data: rows })
  } catch (err) {
    console.error('[serviceAccount.conflicts]', err)
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
    const vc = await validateCollectorInTenant(conn, collectorId, sa.tenant_id)
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

module.exports = {
  list, employees, assignments, assign, unassign, confirm,
  reassignCollector, disable: setLifecycle('disabled'), enable: setLifecycle('active'), conflicts,
}
