const bcrypt = require('bcryptjs')
const pool   = require('../config/db')

// GET /api/users
async function list(req, res) {
  const page    = Math.max(1, parseInt(req.query.page)  || 1)
  const size    = Math.min(100, parseInt(req.query.size) || 20)
  const keyword = req.query.keyword?.trim() || ''
  const offset  = (page - 1) * size

  try {
    const where  = keyword ? `WHERE u.username LIKE ?` : ''
    const params = keyword ? [`%${keyword}%`] : []

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM users u ${where}`, params
    )
    const [rows] = await pool.query(
      `SELECT u.id, u.username, u.role, u.role_id, COALESCE(r.name,'') AS role_name,
              u.user_type, u.tenant_id,
              u.status,
              DATE_FORMAT(u.expire_at, '%Y-%m-%d %H:%i:%s') AS expire_at,
              DATE_FORMAT(u.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM users u
       LEFT JOIN roles r ON r.id = u.role_id
       ${where} ORDER BY u.id DESC LIMIT ? OFFSET ?`,
      [...params, size, offset]
    )
    res.json({ code: 0, data: { list: rows, total, page, size } })
  } catch (err) {
    console.error('[user.list]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// POST /api/users
async function create(req, res) {
  const { username, password, role_id = 2, status = 1, expire_at = null, user_type = 'external' } = req.body
  if (!username || !password) {
    return res.status(400).json({ code: 400, message: '账号和密码不能为空' })
  }
  // W19-C2:两层身份。internal=平台方(tenant_id=NULL);external=租户员工(必带 tenant_id)
  const tenantId = user_type === 'internal' ? null : (req.body.tenant_id || null)
  if (user_type === 'external' && !tenantId) {
    return res.status(400).json({ code: 400, message: '租户员工必须指定所属租户' })
  }
  try {
    const hash = await bcrypt.hash(password, 10)
    const [result] = await pool.query(
      'INSERT INTO users (username, password, role, role_id, user_type, tenant_id, status, expire_at) VALUES (?,?,?,?,?,?,?,?)',
      [username, hash, role_id === 1 ? 9 : 1, role_id, user_type, tenantId, status, expire_at || null]
    )
    res.json({ code: 0, data: { id: result.insertId } })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ code: 409, message: '用户名已存在' })
    }
    console.error('[user.create]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// PUT /api/users/:id
async function update(req, res) {
  const { id } = req.params
  const { password, role_id, status, expire_at } = req.body

  try {
    const fields = []
    const values = []
    if (password) {
      fields.push('password = ?')
      values.push(await bcrypt.hash(password, 10))
    }
    if (role_id   !== undefined) { fields.push('role_id = ?'); values.push(role_id); fields.push('role = ?'); values.push(role_id === 1 ? 9 : 1) }
    if (status    !== undefined) { fields.push('status = ?');    values.push(status) }
    if (expire_at !== undefined) { fields.push('expire_at = ?'); values.push(expire_at || null) }
    // W19-C2:改 user_type 联动 tenant_id(internal→NULL)
    if (req.body.user_type !== undefined) {
      fields.push('user_type = ?'); values.push(req.body.user_type)
      fields.push('tenant_id = ?'); values.push(req.body.user_type === 'internal' ? null : (req.body.tenant_id || null))
    } else if (req.body.tenant_id !== undefined) {
      fields.push('tenant_id = ?'); values.push(req.body.tenant_id || null)
    }

    if (!fields.length) {
      return res.status(400).json({ code: 400, message: '没有可更新的字段' })
    }
    values.push(id)
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values)
    res.json({ code: 0, message: '更新成功' })
  } catch (err) {
    console.error('[user.update]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// DELETE /api/users/:id
async function remove(req, res) {
  const { id } = req.params
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ code: 400, message: '不能删除自己' })
  }
  try {
    await pool.query('DELETE FROM users WHERE id = ?', [id])
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    console.error('[user.remove]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

module.exports = { list, create, update, remove }
