const pool = require('../config/db')

// GET /api/users/column-prefs/:pageKey
exports.get = async (req, res) => {
  var pageKey = req.params.pageKey
  try {
    var [rows] = await pool.query(
      'SELECT column_prefs FROM user_column_prefs WHERE user_id = ? AND page_key = ? LIMIT 1',
      [req.user.id, pageKey]
    )
    res.json({ code: 0, data: rows.length ? rows[0].column_prefs : null })
  } catch (err) {
    console.error('[columnPref.get]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// PUT /api/users/column-prefs/:pageKey
exports.set = async (req, res) => {
  var pageKey = req.params.pageKey
  var { column_prefs } = req.body
  if (!Array.isArray(column_prefs)) return res.status(400).json({ code: 400, message: 'column_prefs 必须是数组' })
  try {
    await pool.query(
      'INSERT INTO user_column_prefs (user_id, page_key, column_prefs) VALUES (?,?,?) ON DUPLICATE KEY UPDATE column_prefs = ?',
      [req.user.id, pageKey, JSON.stringify(column_prefs), JSON.stringify(column_prefs)]
    )
    res.json({ code: 0 })
  } catch (err) {
    console.error('[columnPref.set]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}
