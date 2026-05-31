const pool = require('../config/db')
const { applyDataScope } = require('../utils/data-scope')

exports.stats = async (req, res) => {
  try {
    const pluginScope = applyDataScope(req, { ownerColumn: 'user_id' })

    const userCount = pluginScope.sql
      ? 1
      : (await pool.query('SELECT COUNT(*) AS cnt FROM users'))[0][0].cnt

    const [[pluginRow]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM plugins WHERE status = 1${pluginScope.sql}`,
      pluginScope.params
    )
    const [[msgRow]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM messages m
       WHERE DATE(m.occurred_at) = CURDATE()${req.user?.data_scope === 'all' ? '' : ' AND m.tenant_id = ?'}`,
      req.user?.data_scope === 'all' ? [] : [req.user.id]
    )
    const [[deviceRow]] = await pool.query(
      `SELECT COUNT(DISTINCT platform, platform_page) AS cnt
       FROM conversations
       WHERE last_message_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)${req.user?.data_scope === 'all' ? '' : ' AND tenant_id = ?'}`,
      req.user?.data_scope === 'all' ? [] : [req.user.id]
    )

    res.json({
      code: 0,
      data: {
        users:    userCount,
        plugins:  pluginRow.cnt,
        messages: msgRow.cnt,
        devices:  deviceRow.cnt,
      }
    })
  } catch (err) {
    console.error('[dashboard] stats error:', err)
    res.status(500).json({ code: 1, message: '获取统计数据失败' })
  }
}
