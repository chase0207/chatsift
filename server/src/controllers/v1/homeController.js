const pool = require('../../config/db')
const { ok, fail, scope } = require('./_shared')

// GET /api/v1/home — mychat 首页:主体信息 + 企业/员工看板(全走 scope 隔离)
async function home(req, res) {
  try {
    const u = req.user || {}

    // 主体信息(租户主体,admin 录入)
    let tenant = null
    if (u.tenant_id != null) {
      const [[t]] = await pool.query(
        `SELECT id, name, contact, DATE_FORMAT(expire_at, '%Y-%m-%d') AS expire_at
         FROM tenants WHERE id = ? LIMIT 1`,
        [u.tenant_id]
      )
      tenant = t || null
    }

    // 看板计数:tenant_admin 看本租户全部 / agent 看分配账号(scope 自动隔离)
    const s = await scope(req, { tenantCol: 'tenant_id', saCol: 'service_account_id' })
    const [[conv]] = await pool.query(`SELECT COUNT(*) AS n FROM conversations WHERE 1=1${s.sql}`, s.params)
    const [[lead]] = await pool.query(`SELECT COUNT(*) AS n FROM leads WHERE 1=1${s.sql}`, s.params)
    const [[wo]]   = await pool.query(`SELECT COUNT(*) AS n FROM workorders WHERE 1=1${s.sql}`, s.params)

    const board = {
      level: u.role_code === 'tenant_admin' ? 'tenant' : 'agent',
      conversations: conv.n,
      leads: lead.n,
      workorders: wo.n,
    }
    if (u.role_code === 'tenant_admin' && u.tenant_id != null) {
      const [[emp]] = await pool.query('SELECT COUNT(*) AS n FROM users WHERE tenant_id = ?', [u.tenant_id])
      board.employees = emp.n
    }

    ok(res, { tenant, board })
  } catch (err) {
    console.error('[v1.home]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

module.exports = { home }
