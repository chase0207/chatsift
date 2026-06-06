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

-- A3 角色 seed(三类角色 + role_has_permissions)待审后追加到本文件
