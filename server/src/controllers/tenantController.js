const pool = require('../config/db')

// GET /api/tenants
async function list(req, res) {
  const page    = Math.max(1, parseInt(req.query.page) || 1)
  const size    = Math.min(100, parseInt(req.query.size) || 20)
  const keyword = (req.query.keyword || '').trim()
  const offset  = (page - 1) * size
  try {
    const where  = keyword ? 'WHERE name LIKE ? OR contact LIKE ?' : ''
    const params = keyword ? [`%${keyword}%`, `%${keyword}%`] : []
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM tenants ${where}`, params)
    const [rows] = await pool.query(
      `SELECT id, name, contact, status, remark,
              DATE_FORMAT(expire_at, '%Y-%m-%d %H:%i:%s') AS expire_at,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
              (SELECT COUNT(*) FROM users WHERE tenant_id = tenants.id) AS user_count
       FROM tenants ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, size, offset]
    )
    res.json({ code: 0, data: { list: rows, total, page, size } })
  } catch (err) {
    console.error('[tenant.list]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// GET /api/tenants/options  下拉用(建用户/分配选租户)
async function options(req, res) {
  try {
    const [rows] = await pool.query('SELECT id, name FROM tenants WHERE status = 1 ORDER BY id')
    res.json({ code: 0, data: rows })
  } catch (err) {
    console.error('[tenant.options]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// POST /api/tenants
async function create(req, res) {
  const { name, contact = null, status = 1, expire_at = null, remark = null } = req.body
  if (!name) return res.status(400).json({ code: 400, message: '企业名称不能为空' })
  try {
    const [{ insertId }] = await pool.query(
      'INSERT INTO tenants (name, contact, status, expire_at, remark) VALUES (?,?,?,?,?)',
      [name, contact, status, expire_at || null, remark]
    )
    res.json({ code: 0, data: { id: insertId } })
  } catch (err) {
    console.error('[tenant.create]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// PUT /api/tenants/:id
async function update(req, res) {
  const id = parseInt(req.params.id)
  const allowed = ['name', 'contact', 'status', 'expire_at', 'remark']
  const sets = []
  const vals = []
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, k)) {
      sets.push(`${k} = ?`)
      vals.push(k === 'expire_at' ? (req.body[k] || null) : req.body[k])
    }
  }
  if (!sets.length) return res.status(400).json({ code: 400, message: '没有可更新字段' })
  try {
    vals.push(id)
    const [{ affectedRows }] = await pool.query(`UPDATE tenants SET ${sets.join(', ')} WHERE id = ?`, vals)
    if (!affectedRows) return res.status(404).json({ code: 404, message: '租户不存在' })
    res.json({ code: 0 })
  } catch (err) {
    console.error('[tenant.update]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// DELETE /api/tenants/:id  有员工则禁删(防孤儿数据)
async function remove(req, res) {
  const id = parseInt(req.params.id)
  try {
    const [[{ cnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM users WHERE tenant_id = ?', [id])
    if (cnt > 0) return res.status(400).json({ code: 400, message: `该租户下仍有 ${cnt} 名员工，无法删除` })
    const [{ affectedRows }] = await pool.query('DELETE FROM tenants WHERE id = ?', [id])
    if (!affectedRows) return res.status(404).json({ code: 404, message: '租户不存在' })
    res.json({ code: 0 })
  } catch (err) {
    console.error('[tenant.remove]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

module.exports = { list, options, create, update, remove }
