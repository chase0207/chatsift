const jwt = require('jsonwebtoken');
const pool = require('../config/db');

async function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 401, message: '缺少认证Token' });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // 旧 token 兼容：JWT 中无 is_super/data_scope，从数据库补充
    if (req.user.is_super == null || req.user.data_scope == null) {
      try {
        const [rows] = await pool.query(
          'SELECT r.is_super, r.data_scope FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? LIMIT 1',
          [req.user.id]
        );
        if (rows.length) {
          req.user.is_super = rows[0].is_super;
          req.user.data_scope = rows[0].data_scope;
        }
      } catch (e) {
        // 查询失败不阻塞请求
      }
    }

    // permissions 缺失（refresh token 或旧 token 不带）时从 DB 补全；超管放行不看 permissions，无需补
    if (req.user.permissions == null && !req.user.is_super) {
      try {
        const [rows] = await pool.query(
          `SELECT m.permission_code FROM role_has_permissions rp
           JOIN menus m ON m.id = rp.menu_id
           JOIN users u ON u.role_id = rp.role_id
           WHERE u.id = ? AND m.status = 1`,
          [req.user.id]
        );
        req.user.permissions = rows.map(function (r) { return r.permission_code });
      } catch (e) {
        // 查询失败不阻塞请求
      }
    }

    next();
  } catch (err) {
    return res.status(401).json({ code: 401, message: 'Token无效或已过期' });
  }
}

module.exports = authMiddleware;
