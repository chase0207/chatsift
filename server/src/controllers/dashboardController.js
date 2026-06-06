const pool = require('../config/db')

// W19-E1:平台首页(/dashboard,反馈5 后仅平台方可见)→ 平台级计数,不按 tenant。
//   移除 W19 前遗留的 data_scope/req.user.id 当 tenant 逻辑(避开 data_scope 跨租户泄漏坑);
//   plugin/logs 仍用 utils/data-scope.js(user 级授权),本控制器不再依赖它。
exports.stats = async (req, res) => {
  try {
    const [[{ cnt: users }]]    = await pool.query('SELECT COUNT(*) AS cnt FROM users')
    const [[{ cnt: plugins }]]  = await pool.query('SELECT COUNT(*) AS cnt FROM plugins WHERE status = 1')
    const [[{ cnt: messages }]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM messages WHERE DATE(occurred_at) = CURDATE()"
    )
    const [[{ cnt: devices }]]  = await pool.query(
      'SELECT COUNT(DISTINCT platform, platform_page) AS cnt FROM conversations WHERE last_message_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)'
    )

    res.json({ code: 0, data: { users, plugins, messages, devices } })
  } catch (err) {
    console.error('[dashboard] stats error:', err)
    res.status(500).json({ code: 1, message: '获取统计数据失败' })
  }
}
