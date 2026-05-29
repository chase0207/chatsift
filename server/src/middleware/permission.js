const pool = require('../config/db')

function requirePermission(permissionCode) {
  return async (req, res, next) => {
    try {
      var user = req.user
      if (!user) return res.status(401).json({ code: 401, message: '未认证' })

      // JWT 中没有 is_super（旧 token 兼容），从数据库查询
      if (user.is_super == null) {
        var [rows] = await pool.query(
          'SELECT r.is_super FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? LIMIT 1',
          [user.id]
        )
        user.is_super = rows.length ? rows[0].is_super : 0
      }

      if (user.is_super) return next()

      var permissions = user.permissions || []
      if (permissions.indexOf(permissionCode) !== -1) return next()

      return res.status(403).json({ code: 403, message: '无权限' })
    } catch (err) {
      console.error('[permission]', err)
      return res.status(500).json({ code: 500, message: '权限检查失败' })
    }
  }
}

module.exports = requirePermission
