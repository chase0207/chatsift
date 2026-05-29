const pool = require('../config/db')

// GET /api/roles
exports.list = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.*, (SELECT COUNT(*) FROM users WHERE role_id = r.id) AS user_count
       FROM roles r ORDER BY r.id`
    )
    res.json({ code: 0, data: rows })
  } catch (err) {
    console.error('[role.list]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// POST /api/roles
exports.create = async (req, res) => {
  var { name, description, data_scope = 'self' } = req.body
  if (!name) return res.status(400).json({ code: 400, message: '角色名称不能为空' })
  try {
    var [{ insertId }] = await pool.query(
      'INSERT INTO roles (name, description, data_scope) VALUES (?,?,?)',
      [name, description || '', data_scope]
    )
    res.json({ code: 0, data: { id: insertId } })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ code: 409, message: '角色名称已存在' })
    console.error('[role.create]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// PUT /api/roles/:id
exports.update = async (req, res) => {
  var id = parseInt(req.params.id)
  var { name, description, data_scope } = req.body
  if (!name) return res.status(400).json({ code: 400, message: '角色名称不能为空' })
  try {
    var sets = ['name = ?', 'description = ?']
    var vals = [name, description || '']
    if (data_scope) { sets.push('data_scope = ?'); vals.push(data_scope) }
    vals.push(id)
    var [{ affectedRows }] = await pool.query(
      `UPDATE roles SET ${sets.join(', ')} WHERE id = ?`, vals
    )
    if (!affectedRows) return res.status(404).json({ code: 404, message: '角色不存在' })
    res.json({ code: 0 })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ code: 409, message: '角色名称已存在' })
    console.error('[role.update]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// DELETE /api/roles/:id
exports.remove = async (req, res) => {
  var id = parseInt(req.params.id)
  try {
    var [[{ cnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM users WHERE role_id = ?', [id])
    if (cnt > 0) return res.status(400).json({ code: 400, message: '该角色下仍有 ' + cnt + ' 名用户，无法删除' })
    var [{ affectedRows }] = await pool.query('DELETE FROM roles WHERE id = ?', [id])
    if (!affectedRows) return res.status(404).json({ code: 404, message: '角色不存在' })
    res.json({ code: 0 })
  } catch (err) {
    console.error('[role.remove]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// GET /api/roles/:id/permissions
exports.getPermissions = async (req, res) => {
  var id = parseInt(req.params.id)
  try {
    var [rows] = await pool.query(
      'SELECT menu_id FROM role_has_permissions WHERE role_id = ?', [id]
    )
    res.json({ code: 0, data: rows.map(function (r) { return r.menu_id }) })
  } catch (err) {
    console.error('[role.getPermissions]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// PUT /api/roles/:id/permissions
exports.setPermissions = async (req, res) => {
  var id = parseInt(req.params.id)
  var { menu_ids } = req.body
  if (!Array.isArray(menu_ids)) return res.status(400).json({ code: 400, message: 'menu_ids 必须是数组' })
  try {
    await pool.query('DELETE FROM role_has_permissions WHERE role_id = ?', [id])
    if (menu_ids.length > 0) {
      var values = menu_ids.map(function (mId) { return [id, mId] })
      await pool.query('INSERT INTO role_has_permissions (role_id, menu_id) VALUES ?', [values])
    }
    res.json({ code: 0 })
  } catch (err) {
    console.error('[role.setPermissions]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}
