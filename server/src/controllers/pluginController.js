const { randomUUID } = require('crypto')
const pool = require('../config/db')
const { normalizePlatformKey } = require('../utils/platforms')
const { applyDataScope } = require('../utils/data-scope')

// GET /api/plugins
async function list(req, res) {
  const page   = Math.max(1, parseInt(req.query.page)  || 1)
  const size   = Math.min(100, parseInt(req.query.size) || 20)
  const offset = (page - 1) * size
  const scope  = applyDataScope(req, { ownerColumn: 'user_id', alias: 'p' })

  try {
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM plugins p WHERE 1=1${scope.sql}`,
      scope.params
    )
    const [rows] = await pool.query(
      `SELECT p.id, p.user_id, u.username, p.plugin_key, p.platform,
              p.status, p.max_online,
              DATE_FORMAT(p.expire_at, '%Y-%m-%d %H:%i:%s') AS expire_at,
              DATE_FORMAT(p.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM plugins p
       LEFT JOIN users u ON u.id = p.user_id
       WHERE 1=1${scope.sql}
       ORDER BY p.id DESC LIMIT ? OFFSET ?`,
      [...scope.params, size, offset]
    )
    res.json({ code: 0, data: { list: rows, total, page, size } })
  } catch (err) {
    console.error('[plugin.list]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// POST /api/plugins
async function create(req, res) {
  const { user_id, platform, status = 1, expire_at = null, max_online = 1 } = req.body
  if (!user_id || !platform) {
    return res.status(400).json({ code: 400, message: 'user_id 和 platform 不能为空' })
  }
  try {
    const plugin_key = randomUUID()
    const normalizedPlatform = normalizePlatformKey(platform)
    const [result] = await pool.query(
      'INSERT INTO plugins (user_id, plugin_key, platform, status, expire_at, max_online) VALUES (?,?,?,?,?,?)',
      [user_id, plugin_key, normalizedPlatform, status, expire_at || null, max_online]
    )
    res.json({ code: 0, data: { id: result.insertId, plugin_key } })
  } catch (err) {
    console.error('[plugin.create]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// PUT /api/plugins/:id
async function update(req, res) {
  const { id } = req.params
  const scope   = applyDataScope(req, { ownerColumn: 'user_id', alias: 'p' })
  const { status, expire_at, max_online, platform } = req.body

  try {
    // 行级鉴权：data_scope=self 只能改自己的
    if (scope.sql) {
      const [[row]] = await pool.query(
        `SELECT id FROM plugins p WHERE id = ?${scope.sql}`,
        [id, ...scope.params]
      )
      if (!row) return res.status(404).json({ code: 404, message: '记录不存在或无权限' })
    }

    const fields = []
    const values = []
    if (status     !== undefined) { fields.push('status = ?');     values.push(status) }
    if (expire_at  !== undefined) { fields.push('expire_at = ?');  values.push(expire_at || null) }
    if (max_online !== undefined) { fields.push('max_online = ?'); values.push(max_online) }
    if (platform   !== undefined) { fields.push('platform = ?');   values.push(normalizePlatformKey(platform)) }

    if (!fields.length) {
      return res.status(400).json({ code: 400, message: '没有可更新的字段' })
    }
    values.push(id)
    await pool.query(`UPDATE plugins SET ${fields.join(', ')} WHERE id = ?`, values)
    res.json({ code: 0, message: '更新成功' })
  } catch (err) {
    console.error('[plugin.update]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// DELETE /api/plugins/:id
async function remove(req, res) {
  const scope = applyDataScope(req, { ownerColumn: 'user_id', alias: 'p' })
  try {
    if (scope.sql) {
      const [[row]] = await pool.query(
        `SELECT id FROM plugins p WHERE id = ?${scope.sql}`,
        [req.params.id, ...scope.params]
      )
      if (!row) return res.status(404).json({ code: 404, message: '记录不存在或无权限' })
    }
    await pool.query('DELETE FROM plugins WHERE id = ?', [req.params.id])
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    console.error('[plugin.remove]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

module.exports = { list, create, update, remove }
