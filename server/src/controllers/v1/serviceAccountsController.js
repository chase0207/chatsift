const pool = require('../../config/db')
const { ok, fail, tenantId } = require('./_shared')

// W20.1:采集权只读查询(供 W21 辅助采集器切换前判定"当前员工可否采该账号")。
//   ★只读:不建账号、不 confirm、不分配、不改 lifecycle;首见建 pending 仍只走 events batch 路径。
//   与 events batch 采集权闸门同口径(allowed iff batch 会接受):
//     无账号 → missing_account;disabled → account_disabled;本人=collector → ok;
//     pending 且非本人 → pending_owner;active 且非本人 → not_collector。
//   ★tenant_admin 不因管理员身份天然 allowed;按 collector_id 判。查看权≠采集权。
//   权限:登录的租户员工(external)可调,只查本租户账号;internal 拒。
async function collectPermission(req, res) {
  const tenant = tenantId(req)
  if (req.user.user_type === 'internal' || tenant == null) {
    return fail(res, 403, 1003, '平台方账号不可查询采集权')
  }

  const platform = req.query.platform
  const platformPage = req.query.platform_page
  const bizId = req.query.account_biz_id
  const deny = (reason) => ok(res, { allowed: false, reason, lifecycle: null, collector_id: null, collector_kind: null })

  if (!platform || !platformPage || !bizId) return deny('missing_account')

  try {
    const [pf] = await pool.query('SELECT id FROM platforms WHERE platform_key = ? LIMIT 1', [platform])
    if (!pf.length) return deny('missing_account')
    const [pg] = await pool.query(
      'SELECT id FROM platform_pages WHERE platform_id = ? AND page_key = ? LIMIT 1',
      [pf[0].id, platformPage]
    )
    if (!pg.length) return deny('missing_account')
    const [rows] = await pool.query(
      `SELECT lifecycle, collector_id, collector_kind FROM service_accounts
       WHERE tenant_id = ? AND platform_id = ? AND page_id = ? AND account_biz_id = ? LIMIT 1`,
      [tenant, pf[0].id, pg[0].id, bizId]
    )
    if (!rows.length) return deny('missing_account')

    const sa = rows[0]
    const isCollector = sa.collector_id === req.user.id
    let allowed = false
    let reason = 'unknown'
    if (sa.lifecycle === 'disabled') {
      allowed = false; reason = 'account_disabled'
    } else if (isCollector) {
      allowed = true; reason = 'ok'
    } else if (sa.lifecycle === 'pending') {
      allowed = false; reason = 'pending_owner'   // pending 已属他人(临时采集人)
    } else if (sa.lifecycle === 'active') {
      allowed = false; reason = 'not_collector'
    } else {
      allowed = false; reason = 'unknown'
    }
    ok(res, { allowed, reason, lifecycle: sa.lifecycle, collector_id: sa.collector_id, collector_kind: sa.collector_kind })
  } catch (err) {
    console.error('[v1.serviceAccounts.collectPermission]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

module.exports = { collectPermission }
