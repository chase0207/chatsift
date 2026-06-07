const bcrypt = require('bcryptjs')
const pool   = require('../config/db')

// GET /api/users
async function list(req, res) {
  const page    = Math.max(1, parseInt(req.query.page)  || 1)
  const size    = Math.min(100, parseInt(req.query.size) || 20)
  const keyword = req.query.keyword?.trim() || ''
  const offset  = (page - 1) * size

  try {
    // W19:租户方(超管)只看本租户成员;平台方看全部
    const conds = []
    const params = []
    if (keyword) { conds.push('u.username LIKE ?'); params.push(`%${keyword}%`) }
    if (req.user.user_type === 'external') { conds.push('u.tenant_id = ?'); params.push(req.user.tenant_id) }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM users u ${where}`, params
    )
    const [rows] = await pool.query(
      `SELECT u.id, u.username, u.role_id, COALESCE(r.name,'') AS role_name,
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
  const { username, password, role_id, status = 1, expire_at = null } = req.body
  if (!username || !password) {
    return res.status(400).json({ code: 400, message: '账号和密码不能为空' })
  }
  if (!role_id) return res.status(400).json({ code: 400, message: '请选择角色' })

  // W19-C2:按创建者身份派生两层身份(不信 body 的越权指定)
  let userType, tenantId
  if (req.user.user_type === 'internal') {
    // 平台方:建内部用户;或为某租户 bootstrap 建管理员(显式带 tenant_id+external)
    userType = req.body.user_type === 'external' ? 'external' : 'internal'
    tenantId = userType === 'internal' ? null : (req.body.tenant_id || null)
    if (userType === 'external' && !tenantId) {
      return res.status(400).json({ code: 400, message: '为租户建账号必须指定租户' })
    }
  } else {
    // 租户方(超管):只能在本租户建 external 员工
    userType = 'external'
    tenantId = req.user.tenant_id
    if (!tenantId) return res.status(403).json({ code: 403, message: '当前账号无所属租户' })
  }

  // 角色层级校验:平台用户只能配平台角色;租户用户不能配平台角色
  const [[role]] = await pool.query('SELECT role_code FROM roles WHERE id = ? LIMIT 1', [role_id])
  if (!role) return res.status(400).json({ code: 400, message: '角色不存在' })
  if (userType === 'internal' && role.role_code !== 'platform_admin') {
    return res.status(400).json({ code: 400, message: '平台用户只能选择平台角色' })
  }
  if (userType === 'external' && role.role_code === 'platform_admin') {
    return res.status(400).json({ code: 400, message: '租户用户不能选择平台角色' })
  }

  try {
    const hash = await bcrypt.hash(password, 10)
    const [result] = await pool.query(
      'INSERT INTO users (username, password, role_id, user_type, tenant_id, status, expire_at) VALUES (?,?,?,?,?,?,?)',
      [username, hash, role_id, userType, tenantId, status, expire_at || null]
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
    const [[target]] = await pool.query('SELECT tenant_id, user_type FROM users WHERE id = ? LIMIT 1', [id])
    if (!target) return res.status(404).json({ code: 404, message: '用户不存在' })
    // W19:租户方(超管)只能改本租户成员
    if (req.user.user_type === 'external') {
      if (target.tenant_id !== req.user.tenant_id) return res.status(403).json({ code: 403, message: '无权操作其他租户成员' })
    }
    const nextUserType = req.user.user_type === 'internal' && req.body.user_type !== undefined
      ? req.body.user_type
      : target.user_type
    const nextTenantId = req.user.user_type === 'internal'
      ? (nextUserType === 'internal'
          ? null
          : (req.body.tenant_id !== undefined ? (req.body.tenant_id || null) : target.tenant_id))
      : target.tenant_id
    if (nextUserType === 'external' && !nextTenantId) {
      return res.status(400).json({ code: 400, message: '租户用户必须指定所属租户' })
    }
    if (role_id !== undefined) {
      const [[role]] = await pool.query('SELECT role_code FROM roles WHERE id = ? LIMIT 1', [role_id])
      if (!role) return res.status(400).json({ code: 400, message: '角色不存在' })
      if (nextUserType === 'internal' && role.role_code !== 'platform_admin') {
        return res.status(400).json({ code: 400, message: '平台用户只能选择平台角色' })
      }
      if (nextUserType === 'external' && role.role_code === 'platform_admin') {
        return res.status(400).json({ code: 400, message: '租户用户不能选择平台角色' })
      }
    }
    const fields = []
    const values = []
    if (password) {
      fields.push('password = ?')
      values.push(await bcrypt.hash(password, 10))
    }
    if (role_id   !== undefined) { fields.push('role_id = ?'); values.push(role_id) }
    if (status    !== undefined) { fields.push('status = ?');    values.push(status) }
    if (expire_at !== undefined) { fields.push('expire_at = ?'); values.push(expire_at || null) }
    // W19-C2:仅平台方可改 user_type/tenant_id(租户超管改员工只能动角色/状态/密码)
    if (req.user.user_type === 'internal') {
      if (req.body.user_type !== undefined) {
        fields.push('user_type = ?'); values.push(req.body.user_type)
        fields.push('tenant_id = ?'); values.push(req.body.user_type === 'internal' ? null : (req.body.tenant_id || null))
      } else if (req.body.tenant_id !== undefined) {
        fields.push('tenant_id = ?'); values.push(req.body.tenant_id || null)
      }
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
    // W19:租户方(超管)只能删本租户成员
    if (req.user.user_type === 'external') {
      const [[target]] = await pool.query('SELECT tenant_id FROM users WHERE id = ? LIMIT 1', [id])
      if (!target) return res.status(404).json({ code: 404, message: '用户不存在' })
      if (target.tenant_id !== req.user.tenant_id) return res.status(403).json({ code: 403, message: '无权操作其他租户成员' })
    }
    await pool.query('DELETE FROM users WHERE id = ?', [id])
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    console.error('[user.remove]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

module.exports = { list, create, update, remove }
