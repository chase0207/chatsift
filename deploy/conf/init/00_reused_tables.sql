SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL UNIQUE COMMENT '角色名称',
  description VARCHAR(255) DEFAULT NULL COMMENT '角色描述',
  is_super TINYINT NOT NULL DEFAULT 0 COMMENT '是否超级管理员：1=拥有所有权限',
  data_scope ENUM('self','dept','all') NOT NULL DEFAULT 'self',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '1=启用 0=禁用',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE COMMENT '登录账号',
  password VARCHAR(255) NOT NULL COMMENT 'bcrypt 加密密码',
  role TINYINT NOT NULL DEFAULT 1 COMMENT '1=普通用户 9=管理员',
  role_id INT DEFAULT NULL COMMENT '关联 roles 表',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '1=正常 0=禁用',
  expire_at DATETIME DEFAULT NULL COMMENT '账号到期时间，NULL表示永久',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_role_id (role_id),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS menus (
  id INT AUTO_INCREMENT PRIMARY KEY,
  parent_id INT DEFAULT NULL COMMENT '父级菜单 ID，顶级为 NULL',
  name VARCHAR(64) NOT NULL COMMENT '菜单显示名称',
  icon VARCHAR(32) DEFAULT NULL COMMENT 'Element Plus 图标名称',
  route VARCHAR(128) DEFAULT NULL COMMENT '路由路径，叶节点必填',
  component VARCHAR(64) DEFAULT NULL COMMENT '前端组件名（叶节点必填）',
  type ENUM('menu','button') NOT NULL DEFAULT 'menu',
  permission_code VARCHAR(64) NOT NULL COMMENT '权限编码，如 user:list',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '排序，数字越小越靠前',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '0=隐藏 1=显示',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_parent_id (parent_id),
  UNIQUE KEY uk_permission_code (permission_code),
  UNIQUE KEY uk_route (route)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_has_permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role_id INT NOT NULL COMMENT '角色 ID',
  menu_id INT NOT NULL COMMENT '菜单 ID',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_role_menu (role_id, menu_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platforms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  platform_name VARCHAR(100) NOT NULL COMMENT '平台名称',
  platform_key VARCHAR(50) NOT NULL COMMENT '平台标识码',
  url VARCHAR(512) NOT NULL COMMENT '平台检测 URL，支持逗号分隔多个',
  enabled TINYINT(1) DEFAULT 1 COMMENT '状态：1启用 0禁用',
  dom_status TINYINT NOT NULL DEFAULT 0 COMMENT '0未开发 1开发中 2待验证 3已上线 4修复中',
  sort_order INT DEFAULT 0 COMMENT '排序',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_platform_key (platform_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS platform_pages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  platform_id INT NOT NULL COMMENT '关联平台',
  page_name VARCHAR(100) NOT NULL COMMENT '页面名称',
  url VARCHAR(512) NOT NULL COMMENT '页面URL',
  sort_order INT DEFAULT 0 COMMENT '排序',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (platform_id) REFERENCES platforms(id) ON DELETE CASCADE,
  INDEX idx_platform_id (platform_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS plugins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL COMMENT '归属用户',
  plugin_key VARCHAR(64) NOT NULL UNIQUE COMMENT '插件唯一标识',
  platform VARCHAR(32) NOT NULL COMMENT '平台：taobao/jd/pinduoduo等',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '1=active 0=inactive',
  expire_at DATETIME DEFAULT NULL COMMENT '插件到期时间',
  max_online INT NOT NULL DEFAULT 1 COMMENT '最大同时在线设备数',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS configs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plugin_id INT NOT NULL COMMENT '关联插件',
  platform VARCHAR(32) NOT NULL COMMENT '平台标识',
  config_json TEXT NOT NULL COMMENT 'JSON格式配置内容',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_plugin_platform (plugin_id, platform),
  FOREIGN KEY (plugin_id) REFERENCES plugins(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO roles (id, name, description, is_super, data_scope, status) VALUES
(1, '超级管理员', '拥有所有权限，可以管理角色和菜单配置', 1, 'all', 1),
(2, '普通用户', '默认角色，只能查看基础信息', 0, 'self', 1);

INSERT IGNORE INTO users (id, username, password, role, role_id, status)
VALUES (1, 'admin', '$2a$10$EFXZtms.CB6ne2KvLSt39eBy5YKacinlqSITUO/.PEN8iluemGKPa', 9, 1, 1);

INSERT IGNORE INTO platforms (platform_name, platform_key, url, enabled, dom_status, sort_order) VALUES
('抖音系', 'douyin', 'https://im.jinritemai.com,https://fxg.jinritemai.com,https://buyin.jinritemai.com,https://life.douyin.com,https://im.douyin.com,https://anchor.douyin.com', 1, 3, 1),
('小红书', 'xiaohongshu', 'https://www.xiaohongshu.com,https://xiaohongshu.com', 1, 3, 2),
('快手', 'kuaishou', 'https://www.kuaishou.com,https://kuaishou.com,https://lbs.kuaishou.com', 1, 3, 3),
('拼多多', 'pinduoduo', 'https://mms.pinduoduo.com,https://yangkeduo.com', 1, 4, 4),
('京东', 'jd', 'https://im.jd.com,https://jd.com', 1, 0, 5),
('淘宝/天猫', 'taobao', 'https://taobao.com,https://tmall.com,https://qianniu.com', 1, 4, 6),
('美团', 'meituan', 'https://g.dianping.com,https://meituan.com', 1, 0, 7),
('微信/视频号', 'wechat', 'https://channels.weixin.qq.com,https://weixin.qq.com', 1, 3, 8);

INSERT IGNORE INTO platform_pages (platform_id, page_name, url, sort_order)
SELECT id, '来客私信', 'https://life.douyin.com/p/login', 1 FROM platforms WHERE platform_key = 'douyin';

INSERT IGNORE INTO platform_pages (platform_id, page_name, url, sort_order)
SELECT id, '飞鸽', 'https://im.jinritemai.com', 2 FROM platforms WHERE platform_key = 'douyin';

INSERT IGNORE INTO platform_pages (platform_id, page_name, url, sort_order)
SELECT id, '抖音私信', 'https://im.douyin.com', 3 FROM platforms WHERE platform_key = 'douyin';

INSERT IGNORE INTO menus (id, parent_id, name, icon, route, component, type, permission_code, sort_order, status) VALUES
(1, NULL, '控制台', 'House', '/dashboard', 'Dashboard', 'menu', 'dashboard', 1, 1),
(2, NULL, '用户管理', 'User', '/users', 'Users', 'menu', 'user:list', 2, 1),
(3, NULL, '插件授权', 'Connection', '/plugins', 'Plugins', 'menu', 'plugin:list', 3, 1),
(4, NULL, '平台管理', 'Grid', '/platforms', 'Platforms', 'menu', 'platform:list', 4, 1),
(5, NULL, '日志中心', 'Document', '/logs', 'Logs', 'menu', 'log:list', 5, 1),
(6, NULL, '角色管理', 'Key', '/roles', 'Roles', 'menu', 'role:list', 6, 1),
(7, NULL, '菜单管理', 'Menu', '/menus', 'Menus', 'menu', 'menu:list', 7, 1),
(8, NULL, '会话中心', 'ChatLineSquare', '/conversations', 'Conversations', 'menu', 'conversation:list', 8, 1),
(9, NULL, '线索中心', 'UserFilled', '/leads', 'Leads', 'menu', 'lead:manage', 9, 1),
(10, NULL, '工单中心', 'Tickets', '/workorders', 'Workorders', 'menu', 'workorder:handle', 10, 1),
(11, NULL, '运营分析', 'TrendCharts', '/analytics', 'Analytics', 'menu', 'analytics', 11, 1),
(12, NULL, '系统设置', 'Setting', '/settings', 'Settings', 'menu', 'settings', 12, 1);

INSERT IGNORE INTO menus (parent_id, name, type, permission_code, sort_order, status)
SELECT id, '新增用户', 'button', 'user:create', 1, 1 FROM menus WHERE permission_code = 'user:list';
INSERT IGNORE INTO menus (parent_id, name, type, permission_code, sort_order, status)
SELECT id, '编辑用户', 'button', 'user:update', 2, 1 FROM menus WHERE permission_code = 'user:list';
INSERT IGNORE INTO menus (parent_id, name, type, permission_code, sort_order, status)
SELECT id, '删除用户', 'button', 'user:delete', 3, 1 FROM menus WHERE permission_code = 'user:list';
INSERT IGNORE INTO menus (parent_id, name, type, permission_code, sort_order, status)
SELECT id, '新增角色', 'button', 'role:create', 1, 1 FROM menus WHERE permission_code = 'role:list';
INSERT IGNORE INTO menus (parent_id, name, type, permission_code, sort_order, status)
SELECT id, '编辑角色', 'button', 'role:update', 2, 1 FROM menus WHERE permission_code = 'role:list';
INSERT IGNORE INTO menus (parent_id, name, type, permission_code, sort_order, status)
SELECT id, '删除角色', 'button', 'role:delete', 3, 1 FROM menus WHERE permission_code = 'role:list';
INSERT IGNORE INTO menus (parent_id, name, type, permission_code, sort_order, status)
SELECT id, '派单', 'button', 'workorder:assign', 1, 1 FROM menus WHERE permission_code = 'workorder:handle';
INSERT IGNORE INTO menus (parent_id, name, type, permission_code, sort_order, status)
SELECT id, '意图规则', 'button', 'intent-rule:config', 1, 1 FROM menus WHERE permission_code = 'settings';
INSERT IGNORE INTO menus (parent_id, name, type, permission_code, sort_order, status)
SELECT id, '价格表', 'button', 'price:manage', 2, 1 FROM menus WHERE permission_code = 'settings';
INSERT IGNORE INTO menus (parent_id, name, type, permission_code, sort_order, status)
SELECT id, 'LLM配置', 'button', 'llm:config', 3, 1 FROM menus WHERE permission_code = 'settings';

INSERT IGNORE INTO role_has_permissions (role_id, menu_id)
SELECT 1, id FROM menus;

INSERT IGNORE INTO role_has_permissions (role_id, menu_id)
SELECT 2, id FROM menus WHERE permission_code IN ('dashboard', 'conversation:list', 'lead:manage', 'workorder:handle');

SET FOREIGN_KEY_CHECKS = 1;
