-- ============================================================
-- W19 租户资产模型 — 数据模型(阶段A:A1 三表 + A2 加字段)
-- ============================================================
-- 运行顺序:在 00_reused_tables.sql(users/roles/platforms)+ v1-schema.sql(业务表)之后。
-- init 挂载(fresh DB)与 deploy 手动升级(已有库)同源本文件;角色 seed(A3)待审后追加。
-- 只增不改、字段先 nullable(service_account_id)。page_id NOT NULL(Q3,私信页恒有)。
-- ============================================================

SET NAMES utf8mb4;

-- ---- A1.1 tenants 租户主体 ----------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(128) NOT NULL                COMMENT '企业名称(admin 录入)',
  contact     VARCHAR(128) DEFAULT NULL            COMMENT '联系人/电话',
  status      TINYINT  NOT NULL DEFAULT 1          COMMENT '1=启用 0=停用',
  expire_at   DATETIME DEFAULT NULL                COMMENT '到期,NULL=永久',
  remark      VARCHAR(255) DEFAULT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='租户主体';

-- ---- A1.2 service_accounts 客服账号(资产原点) ---------------
CREATE TABLE IF NOT EXISTS service_accounts (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id         INT NOT NULL                   COMMENT '资产归属租户',
  platform_id       INT NOT NULL                   COMMENT '全局平台字典',
  page_id           INT NOT NULL                   COMMENT '全局页面字典(Q3:私信页恒有,NOT NULL)',
  account_biz_id    VARCHAR(128) NOT NULL          COMMENT '商家账号稳定ID(=URL accountId)',
  account_nickname  VARCHAR(128) NOT NULL          COMMENT '坐席昵称(可改,人工校正)',
  status            TINYINT  NOT NULL DEFAULT 1,
  first_seen_at     DATETIME DEFAULT NULL,
  remark            VARCHAR(255) DEFAULT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_account (tenant_id, platform_id, page_id, account_biz_id, account_nickname),
  KEY idx_tenant (tenant_id),
  CONSTRAINT fk_sa_tenant   FOREIGN KEY (tenant_id)   REFERENCES tenants(id),
  CONSTRAINT fk_sa_platform FOREIGN KEY (platform_id) REFERENCES platforms(id),
  CONSTRAINT fk_sa_page     FOREIGN KEY (page_id)     REFERENCES platform_pages(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='客服账号(资产原点)';

-- ---- A1.3 employee_service_account 员工↔账号 多对多 ---------
CREATE TABLE IF NOT EXISTS employee_service_account (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id           INT NOT NULL                 COMMENT '冗余,便于隔离查询',
  employee_id         INT NOT NULL                 COMMENT 'users.id',
  service_account_id  INT NOT NULL,
  assigned_by         INT DEFAULT NULL             COMMENT '谁分配,NULL=系统自动',
  assigned_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_assign (employee_id, service_account_id),
  KEY idx_sa (service_account_id),
  CONSTRAINT fk_esa_tenant   FOREIGN KEY (tenant_id)          REFERENCES tenants(id),
  CONSTRAINT fk_esa_employee FOREIGN KEY (employee_id)        REFERENCES users(id),
  CONSTRAINT fk_esa_sa       FOREIGN KEY (service_account_id) REFERENCES service_accounts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='员工↔客服账号分配';

-- ---- A2.1 users 加 tenant_id(内部用户=NULL/租户员工=租户id) --
ALTER TABLE users
  ADD COLUMN tenant_id INT DEFAULT NULL COMMENT 'W19 租户id,内部用户(平台方)=NULL,租户员工=所属租户' AFTER role_id,
  ADD KEY idx_tenant (tenant_id),
  ADD CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id);

-- ---- A2.2 五张业务表加 service_account_id(都已有 tenant_id) --
ALTER TABLE conversations
  ADD COLUMN service_account_id INT DEFAULT NULL COMMENT 'W19 客服账号归属(采集时填,先nullable)' AFTER tenant_id,
  ADD KEY idx_sa (tenant_id, service_account_id),
  ADD CONSTRAINT fk_conv_sa FOREIGN KEY (service_account_id) REFERENCES service_accounts(id);

ALTER TABLE leads
  ADD COLUMN service_account_id INT DEFAULT NULL COMMENT 'W19 客服账号归属' AFTER tenant_id,
  ADD KEY idx_sa (tenant_id, service_account_id),
  ADD CONSTRAINT fk_lead_sa FOREIGN KEY (service_account_id) REFERENCES service_accounts(id);

ALTER TABLE workorders
  ADD COLUMN service_account_id INT DEFAULT NULL COMMENT 'W19 客服账号归属' AFTER tenant_id,
  ADD KEY idx_sa (tenant_id, service_account_id),
  ADD CONSTRAINT fk_wo_sa FOREIGN KEY (service_account_id) REFERENCES service_accounts(id);

ALTER TABLE messages
  ADD COLUMN service_account_id INT DEFAULT NULL COMMENT 'W19 客服账号归属(最底层事实表,codex#2)' AFTER tenant_id,
  ADD KEY idx_sa (tenant_id, service_account_id),
  ADD CONSTRAINT fk_msg_sa FOREIGN KEY (service_account_id) REFERENCES service_accounts(id);

ALTER TABLE analysis_jobs
  ADD COLUMN service_account_id INT DEFAULT NULL COMMENT 'W19 客服账号归属' AFTER tenant_id,
  ADD KEY idx_sa (tenant_id, service_account_id),
  ADD CONSTRAINT fk_job_sa FOREIGN KEY (service_account_id) REFERENCES service_accounts(id);

-- ============================================================
-- A3 角色清洗(两层模型:user_type 系统级 + role 租户级)+ 种子租户 + 用户映射
--   本段在 00_reused_tables.sql(seed users/roles)之后跑;seed 幂等(可重跑)
-- ============================================================

-- A3.0 users 加 user_type(internal 平台方 / external 租户方)
ALTER TABLE users ADD COLUMN user_type VARCHAR(20) NOT NULL DEFAULT 'external'
  COMMENT 'internal=平台方/external=租户方' AFTER tenant_id;

-- A3.1 roles 清洗为租户级三类("内部用户"不再是 role,由 user_type 表达)
UPDATE roles SET name='平台管理员',     description='平台方(internal),全权限'       WHERE id=1;
UPDATE roles SET name='租户超级管理员', description='租户内最高,管员工+分配客服账号' WHERE id=2;
INSERT INTO roles (name, description, is_super, data_scope, status)
  SELECT '客服','租户普通员工,只看分到的客服账号',0,'self',1
  WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name='客服');

-- A3.2 种子租户(阶段E 清库保留 tenants)
INSERT INTO tenants (name, status)
  SELECT '空月培训教育',1 WHERE NOT EXISTS (SELECT 1 FROM tenants WHERE name='空月培训教育');

-- A3.3 用户映射(两层,按 username 稳定匹配)
UPDATE users SET user_type='internal', tenant_id=NULL WHERE username='admin';
UPDATE users SET user_type='external',
       tenant_id=(SELECT id FROM tenants WHERE name='空月培训教育' LIMIT 1)
  WHERE username='18651359635';
UPDATE users SET user_type='external',
       tenant_id=(SELECT id FROM tenants WHERE name='空月培训教育' LIMIT 1),
       role_id=(SELECT id FROM roles WHERE name='客服' LIMIT 1)
  WHERE username='tenant';

-- A3.4 role_has_permissions:客服 = mychat 业务页只读(会话/线索/工单/分析/聚合)
--   平台管理员(is_super=1)=代码层全权限无需配点;租户超管沿用 00_reused 现配(mychat 业务集)
INSERT IGNORE INTO role_has_permissions (role_id, menu_id)
  SELECT (SELECT id FROM roles WHERE name='客服' LIMIT 1), m.id
  FROM menus m WHERE m.route IN ('/conversations','/leads','/workorders','/analytics','/aggregate');

-- ============================================================
-- R1 角色判据加固(role_code 正向枚举)+ Q2 platform_pages.page_key(B2 前置)
--   R1: scope helper 改正向枚举 + fail-closed,用稳定 role_code(非中文 role_name/非魔法 role_id)判角色;
--       internal→1=0 / tenant_admin→本租户全部 / agent→分配集 / else→1=0(未知 fail-closed,不 fallthrough 放大)。
--   Q2: page_key = adapter 实际发出的 platform_page 串(供 B2 采集 page→page_id 映射),对齐实发防错位。
-- ============================================================

-- R1.1 roles 加 role_code(platform_admin/tenant_admin/agent/未来自定义=NULL→受限)
ALTER TABLE roles ADD COLUMN role_code VARCHAR(32) DEFAULT NULL
  COMMENT '稳定角色枚举 platform_admin/tenant_admin/agent;scope helper 判据(不用中文 name/role_id)' AFTER name;
UPDATE roles SET role_code='platform_admin' WHERE name='平台管理员';
UPDATE roles SET role_code='tenant_admin'   WHERE name='租户超级管理员';
UPDATE roles SET role_code='agent'          WHERE name='客服';

-- Q2.1 platform_pages 加 page_key = adapter 实发 platform_page 串(对照 platforms.platform_key)
ALTER TABLE platform_pages ADD COLUMN page_key VARCHAR(64) DEFAULT NULL
  COMMENT '页面键=adapter 实发 platform_page 串(采集 page→page_id 映射)' AFTER page_name,
  ADD KEY idx_page_key (platform_id, page_key);
-- 现有 seed 补 page_key(对齐 adapter 实发串,见 plugin/adapters/douyin/*.adapter.js)
UPDATE platform_pages SET page_key='laike-message'   WHERE page_name='来客私信';
UPDATE platform_pages SET page_key='feige'           WHERE page_name='飞鸽';
UPDATE platform_pages SET page_key='private-message' WHERE page_name='抖音私信';
-- 经营宝(美团)无 adapter → page_key 留 NULL,待该平台采集落地再补

-- ============================================================
-- 阶段C/D menus + 权限点(验收反馈调整后口径)
--   C 租户管理: 平台方,挂系统设置组(is_super 自动放行)
--   C 客服账号: ★租户方(超管),挂客服管理组(kefu:group),授 tenant_admin(分配仅本租户)
--   D mychat 首页: 租户角色 tenant_admin/agent 给 home:view
--   注:INSERT...SELECT 引用 menus 用派生表包一层,绕开 MySQL 同表限制
-- ============================================================
INSERT INTO menus (parent_id, name, route, type, permission_code, sort_order, status)
SELECT g.id, '租户管理', '/tenants', 'menu', 'tenant:list', 5, 1
FROM (SELECT id FROM menus WHERE permission_code='system:group' LIMIT 1) g
WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM menus WHERE route='/tenants') x);

-- 客服账号挂"客服管理"组(租户侧),供租户超管在 mychat 分配
INSERT INTO menus (parent_id, name, route, type, permission_code, sort_order, status)
SELECT g.id, '客服账号', '/service-accounts', 'menu', 'service-account:list', 6, 1
FROM (SELECT id FROM menus WHERE permission_code='kefu:group' LIMIT 1) g
WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM menus WHERE route='/service-accounts') x);

INSERT INTO menus (parent_id, name, type, permission_code, status)
SELECT m.id, '分配账号', 'button', 'service-account:update', 1
FROM (SELECT id FROM menus WHERE route='/service-accounts' LIMIT 1) m
WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM menus WHERE permission_code='service-account:update') x);

INSERT INTO menus (parent_id, name, type, permission_code, status)
SELECT m.id, '新增租户', 'button', 'tenant:create', 1
FROM (SELECT id FROM menus WHERE route='/tenants' LIMIT 1) m
WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM menus WHERE permission_code='tenant:create') x);

INSERT INTO menus (parent_id, name, type, permission_code, status)
SELECT m.id, '编辑租户', 'button', 'tenant:update', 1
FROM (SELECT id FROM menus WHERE route='/tenants' LIMIT 1) m
WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM menus WHERE permission_code='tenant:update') x);

INSERT INTO menus (parent_id, name, type, permission_code, status)
SELECT m.id, '删除租户', 'button', 'tenant:delete', 1
FROM (SELECT id FROM menus WHERE route='/tenants' LIMIT 1) m
WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM menus WHERE permission_code='tenant:delete') x);

INSERT INTO menus (parent_id, name, route, type, permission_code, sort_order, status)
SELECT NULL, '首页', '/home', 'menu', 'home:view', 0, 1
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM (SELECT id FROM menus WHERE route='/home') x);

-- 租户角色权限:超管+客服 给 /home;★客服账号(list+分配)仅给租户超管(tenant_admin)
INSERT IGNORE INTO role_has_permissions (role_id, menu_id)
SELECT r.id, m.id
FROM roles r CROSS JOIN (SELECT id FROM menus WHERE route='/home' LIMIT 1) m
WHERE r.role_code IN ('tenant_admin','agent');

INSERT IGNORE INTO role_has_permissions (role_id, menu_id)
SELECT r.id, m.id
FROM roles r CROSS JOIN (SELECT id FROM menus WHERE permission_code IN ('service-account:list','service-account:update')) m
WHERE r.role_code = 'tenant_admin';

-- 租户超管管本租户成员:用户管理(list/create/update/delete);Users 页 mychat 入口共享,后端按 user_type 隔离
INSERT IGNORE INTO role_has_permissions (role_id, menu_id)
SELECT r.id, m.id
FROM roles r CROSS JOIN (SELECT id FROM menus WHERE permission_code IN ('user:list','user:create','user:update','user:delete')) m
WHERE r.role_code = 'tenant_admin';
