const pool = require('../config/db')
const { applyDataScope } = require('../utils/data-scope')

exports.stats = async (req, res) => {
  try {
    const pluginScope = applyDataScope(req, { ownerColumn: 'user_id' })
    const joinScope   = applyDataScope(req, { ownerColumn: 'user_id', alias: 'p' })

    const userCount = pluginScope.sql
      ? 1
      : (await pool.query('SELECT COUNT(*) AS cnt FROM users'))[0][0].cnt

    const [[pluginRow]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM plugins WHERE status = 1${pluginScope.sql}`,
      pluginScope.params
    )
    const [[msgRow]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM message_logs ml
       LEFT JOIN plugins p ON p.id = ml.plugin_id
       WHERE DATE(ml.created_at) = CURDATE()${joinScope.sql}`,
      joinScope.params
    )
    const [[deviceRow]] = await pool.query(
      `SELECT COUNT(DISTINCT ds.plugin_id, ds.device_id) AS cnt
       FROM device_sessions ds
       LEFT JOIN plugins p ON p.id = ds.plugin_id
       WHERE ds.status = 1${joinScope.sql}`,
      joinScope.params
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
