const pool = require('../config/db')

// GET /api/menus — 扁平列表
exports.list = async (req, res) => {
  try {
    var [rows] = await pool.query(
      `SELECT m.*, p.name AS parent_name
       FROM menus m LEFT JOIN menus p ON p.id = m.parent_id
       ORDER BY m.sort_order`
    )
    res.json({ code: 0, data: rows })
  } catch (err) {
    console.error('[menu.list]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// 将扁平数组构建为树
function buildTree(flat) {
  var map = {}
  var roots = []
  flat.forEach(function (item) {
    item.children = []
    map[item.id] = item
  })
  flat.forEach(function (item) {
    if (item.parent_id && map[item.parent_id]) {
      map[item.parent_id].children.push(item)
    } else if (!item.parent_id) {
      roots.push(item)
    }
  })
  return roots
}

// GET /api/menus/tree — 树形结构
// ?includeButtons=1 时包含 button 节点（供 Roles.vue 配置权限用）
// 默认只返回 type='menu'（供侧边栏渲染）
exports.tree = async (req, res) => {
  try {
    var userId = req.user.id
    var isSuper = req.user.is_super
    var includeButtons = req.query.includeButtons === '1'

    var sql = `SELECT DISTINCT m.* FROM menus m`
    var params = []

    if (!isSuper) {
      sql += ` JOIN role_has_permissions rp ON rp.menu_id = m.id
               JOIN users u ON u.role_id = rp.role_id
               WHERE u.id = ? AND m.status = 1`
      params.push(userId)
      if (!includeButtons) sql += ` AND m.type = 'menu'`
    } else {
      sql += ` WHERE m.status = 1`
      if (!includeButtons) sql += ` AND m.type = 'menu'`
    }

    sql += ` ORDER BY m.sort_order`

    var [rows] = await pool.query(sql, params)

    // 非超管:补全已授权菜单的祖先分组,避免子菜单因父组未单独授权被 buildTree 丢弃
    if (!isSuper && rows.length) {
      var haveIds = {}
      rows.forEach(function (r) { haveIds[r.id] = true })
      var [allMenus] = await pool.query('SELECT id, parent_id FROM menus WHERE status = 1')
      var parentOf = {}
      allMenus.forEach(function (m) { parentOf[m.id] = m.parent_id })
      var needIds = {}
      rows.forEach(function (r) {
        var p = parentOf[r.id]
        while (p && !haveIds[p] && !needIds[p]) { needIds[p] = true; p = parentOf[p] }
      })
      var needList = Object.keys(needIds)
      if (needList.length) {
        var [anc] = await pool.query('SELECT DISTINCT m.* FROM menus m WHERE m.id IN (?) AND m.status = 1', [needList])
        rows = rows.concat(anc)
        rows.sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0) })
      }
    }

    res.json({ code: 0, data: buildTree(rows) })
  } catch (err) {
    console.error('[menu.tree]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// POST /api/menus
exports.create = async (req, res) => {
  var { parent_id, name, icon, route, component, type, permission_code, sort_order, status } = req.body
  if (!name || !permission_code) return res.status(400).json({ code: 400, message: '名称和权限编码不能为空' })
  try {
    var [{ insertId }] = await pool.query(
      'INSERT INTO menus (parent_id, name, icon, route, component, type, permission_code, sort_order, status) VALUES (?,?,?,?,?,?,?,?,?)',
      [parent_id || null, name, icon || '', route || null, component || null, type || 'menu', permission_code, sort_order || 0, status != null ? status : 1]
    )
    res.json({ code: 0, data: { id: insertId } })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ code: 409, message: '权限编码或路由已存在' })
    console.error('[menu.create]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// PUT /api/menus/:id
exports.update = async (req, res) => {
  var id = parseInt(req.params.id)
  var { parent_id, name, icon, route, component, type, permission_code, sort_order, status } = req.body
  if (!name || !permission_code) return res.status(400).json({ code: 400, message: '名称和权限编码不能为空' })
  try {
    var [{ affectedRows }] = await pool.query(
      'UPDATE menus SET parent_id=?, name=?, icon=?, route=?, component=?, type=?, permission_code=?, sort_order=?, status=? WHERE id=?',
      [parent_id || null, name, icon || '', route || null, component || null, type || 'menu', permission_code, sort_order || 0, status != null ? status : 1, id]
    )
    if (!affectedRows) return res.status(404).json({ code: 404, message: '菜单不存在' })
    res.json({ code: 0 })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ code: 409, message: '权限编码或路由已存在' })
    console.error('[menu.update]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// DELETE /api/menus/:id
exports.remove = async (req, res) => {
  var id = parseInt(req.params.id)
  try {
    // 先查出所有子菜单 ID（含自身）
    var [children] = await pool.query('SELECT id FROM menus WHERE parent_id = ? OR id = ?', [id, id])
    var ids = children.map(function (r) { return r.id })
    if (!ids.length) return res.status(404).json({ code: 404, message: '菜单不存在' })

    await pool.query('DELETE FROM role_has_permissions WHERE menu_id IN (?)', [ids])
    await pool.query('DELETE FROM menus WHERE id IN (?)', [ids])
    res.json({ code: 0, data: { deleted: ids.length } })
  } catch (err) {
    console.error('[menu.remove]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}
