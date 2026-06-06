const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const pool   = require('../config/db');

function signAccess(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function signRefresh(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  });
}

async function getUserPermissions(userId) {
  const [rows] = await pool.query(
    `SELECT m.permission_code FROM role_has_permissions rp
     JOIN menus m ON m.id = rp.menu_id
     JOIN users u ON u.role_id = rp.role_id
     WHERE u.id = ? AND m.status = 1`,
    [userId]
  )
  return rows.map(function (r) { return r.permission_code })
}

async function getUserRoleInfo(userId) {
  const [rows] = await pool.query(
    `SELECT r.id AS role_id, r.name AS role_name, r.is_super, r.data_scope
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = ? LIMIT 1`,
    [userId]
  )
  if (!rows.length) return { role_id: null, role_name: '', is_super: 0, data_scope: 'self' }
  return rows[0]
}

// POST /api/auth/login
async function login(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ code: 400, message: '账号和密码不能为空' });
  }

  try {
    const [rows] = await pool.query(
      'SELECT id, username, password, role, tenant_id, user_type, status, expire_at FROM users WHERE username = ? LIMIT 1',
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ code: 401, message: '账号或密码错误' });
    }

    const user = rows[0];

    if (user.status !== 1) {
      return res.status(403).json({ code: 403, message: '账号已被禁用' });
    }

    if (user.expire_at && new Date(user.expire_at) < new Date()) {
      return res.status(403).json({ code: 403, message: '账号已过期' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ code: 401, message: '账号或密码错误' });
    }

    // 获取角色和权限
    var roleInfo = await getUserRoleInfo(user.id)
    var permissions = roleInfo.is_super ? null : await getUserPermissions(user.id)

    const payload = {
      id: user.id,
      username: user.username,
      role: user.role,
      role_id: roleInfo.role_id,
      role_name: roleInfo.role_name,
      tenant_id: user.tenant_id,
      user_type: user.user_type,
      is_super: roleInfo.is_super,
      data_scope: roleInfo.data_scope,
      permissions: permissions,
    };
    const token        = signAccess(payload);
    const refreshToken = signRefresh({ id: user.id, username: user.username, role: user.role });

    const decoded = jwt.decode(token);

    return res.json({
      code: 0,
      data: {
        token,
        refreshToken,
        expire: decoded.exp,
        userInfo: {
          id:       user.id,
          username: user.username,
          role:     user.role,
          role_id:  roleInfo.role_id,
          role_name: roleInfo.role_name,
          tenant_id: user.tenant_id,
          user_type: user.user_type,
          is_super:  roleInfo.is_super,
          data_scope: roleInfo.data_scope,
          permissions: permissions,
        },
      },
    });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
}

// GET /api/auth/userinfo
async function userinfo(req, res) {
  try {
    var userId = req.user.id
    var roleInfo = await getUserRoleInfo(userId)
    var permissions = roleInfo.is_super ? null : await getUserPermissions(userId)

    const [rows] = await pool.query(
      'SELECT id, username, role, status, expire_at FROM users WHERE id = ? LIMIT 1',
      [userId]
    )
    if (!rows.length) return res.status(404).json({ code: 404, message: '用户不存在' })

    var user = rows[0]
    res.json({
      code: 0,
      data: {
        id: user.id,
        username: user.username,
        role: user.role,
        role_id: roleInfo.role_id,
        role_name: roleInfo.role_name,
        is_super: roleInfo.is_super,
        data_scope: roleInfo.data_scope,
        permissions: permissions,
      }
    })
  } catch (err) {
    console.error('[userinfo]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// POST /api/auth/verify
async function verify(req, res) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.json({ code: 0, data: { valid: false } });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 检查用户状态
    const [rows] = await pool.query(
      'SELECT id, username, role, status, expire_at FROM users WHERE id = ? LIMIT 1',
      [decoded.id]
    );

    if (rows.length === 0 || rows[0].status !== 1) {
      return res.json({ code: 0, data: { valid: false } });
    }

    const user = rows[0];
    if (user.expire_at && new Date(user.expire_at) < new Date()) {
      return res.json({ code: 0, data: { valid: false } });
    }

    var roleInfo = await getUserRoleInfo(user.id)
    var permissions = roleInfo.is_super ? null : await getUserPermissions(user.id)

    return res.json({
      code: 0,
      data: {
        valid: true,
        userInfo: {
          id: user.id,
          username: user.username,
          role: user.role,
          role_id: roleInfo.role_id,
          role_name: roleInfo.role_name,
          is_super: roleInfo.is_super,
          data_scope: roleInfo.data_scope,
          permissions: permissions,
        },
      },
    });
  } catch (err) {
    return res.json({ code: 0, data: { valid: false } });
  }
}

// POST /api/auth/refresh
async function refresh(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ code: 400, message: 'refreshToken不能为空' });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const payload  = { id: decoded.id, username: decoded.username, role: decoded.role };
    const token    = signAccess(payload);
    const exp      = jwt.decode(token).exp;

    return res.json({ code: 0, data: { token, expire: exp } });
  } catch (err) {
    return res.status(401).json({ code: 401, message: 'refreshToken无效或已过期' });
  }
}

// POST /api/auth/logout
async function logout(req, res) {
  return res.json({ code: 0, message: '已退出登录' });
}

module.exports = { login, verify, refresh, logout, userinfo };
