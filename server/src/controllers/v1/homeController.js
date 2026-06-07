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

    // W20-B:待确认账号待办(仅租户管理员)。first_seen_by 姓名 + 首见时间 + 建议采集人=临时采集人。
    let pendingAccounts = null
    if (u.role_code === 'tenant_admin' && u.tenant_id != null) {
      const [[{ n }]] = await pool.query(
        `SELECT COUNT(*) AS n FROM service_accounts WHERE tenant_id = ? AND lifecycle = 'pending'`,
        [u.tenant_id]
      )
      const [list] = await pool.query(
        `SELECT sa.id, sa.account_biz_id, sa.account_nickname,
                p.platform_key AS platform, pp.page_key AS platform_page,
                sa.first_seen_by, fb.username AS first_seen_by_name,
                DATE_FORMAT(sa.first_seen_at, '%Y-%m-%d %H:%i:%s') AS first_seen_at,
                sa.collector_id AS suggested_collector_id, cb.username AS suggested_collector_name
         FROM service_accounts sa
         LEFT JOIN platforms p ON p.id = sa.platform_id
         LEFT JOIN platform_pages pp ON pp.id = sa.page_id
         LEFT JOIN users fb ON fb.id = sa.first_seen_by
         LEFT JOIN users cb ON cb.id = sa.collector_id
         WHERE sa.tenant_id = ? AND sa.lifecycle = 'pending'
         ORDER BY sa.first_seen_at DESC, sa.id DESC
         LIMIT 50`,
        [u.tenant_id]
      )
      pendingAccounts = { count: n, list }
    }

    ok(res, { tenant, board, pending_accounts: pendingAccounts })
  } catch (err) {
    console.error('[v1.home]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

module.exports = { home }
