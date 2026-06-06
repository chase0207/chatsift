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

    // 旧 token 兼容：JWT 中无 is_super/data_scope/user_type/tenant_id/role_key，从数据库补充(W19)
    // role_key 是 scope helper 的隔离判据,缺失必须补全(否则 fail-closed 收紧,不会越权)
    if (req.user.is_super == null || req.user.data_scope == null || req.user.user_type == null || req.user.role_key === undefined) {
      try {
        const [rows] = await pool.query(
          'SELECT r.is_super, r.data_scope, r.name AS role_name, r.role_key, u.user_type, u.tenant_id FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? LIMIT 1',
          [req.user.id]
        );
        if (rows.length) {
          req.user.is_super = rows[0].is_super;
          req.user.data_scope = rows[0].data_scope;
          req.user.role_name = rows[0].role_name;
          req.user.role_key = rows[0].role_key;
          req.user.user_type = rows[0].user_type;
          req.user.tenant_id = rows[0].tenant_id;
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
