-- ============================================================
-- W20 客服账号采集权/查看权治理 — 数据模型(阶段A)
-- ============================================================
-- 运行顺序:在 02_w19_tenant_asset.sql 之后(依赖 service_accounts / users / tenants 已建)。
-- W20 与 W19 不混写:本文件是 W20 独立基线,所有 W20 schema 改动只落这里。
-- init 挂载(fresh DB)与 deploy/w20_account_governance.sql(已有库升级)同源本文件。
-- 只增不改:ALTER ADD service_accounts 四列 + 建三表 + esa 标废弃(不 DROP、不迁移)。
-- 依据:docs/research/2026-06-07_W20技术方案.md v1.3 §2。
-- ============================================================

SET NAMES utf8mb4;

-- ---- W20.1 service_accounts 扩生命周期 + 采集负责人 ----------
--   ★status 与 lifecycle 双字段:status(旧二态)暂留不扩展、不再做业务判断;
--     W20 一切生命周期判断只读 lifecycle(避免双字段语义打架)。
--   collector_id 单人 = 采集权;collector_kind temp(pending临时)/formal(active正式)。
--   现有账号无真实数据,默认落 pending、需管理员确认(不做复杂迁移)。
ALTER TABLE service_accounts
  ADD COLUMN lifecycle      VARCHAR(16) NOT NULL DEFAULT 'pending'
             COMMENT 'W20 生命周期 pending/active/disabled;★业务判断只看 lifecycle' AFTER status,
  ADD COLUMN first_seen_by  INT DEFAULT NULL COMMENT 'W20 首次发现员工 users.id' AFTER first_seen_at,
  ADD COLUMN collector_id   INT DEFAULT NULL COMMENT 'W20 采集负责人(单人=采集权);NULL=无人' AFTER first_seen_by,
  ADD COLUMN collector_kind VARCHAR(8) DEFAULT NULL COMMENT 'temp(pending临时)/formal(active正式)' AFTER collector_id,
  ADD KEY idx_lifecycle (tenant_id, lifecycle),
  ADD CONSTRAINT fk_sa_first_seen FOREIGN KEY (first_seen_by) REFERENCES users(id),
  ADD CONSTRAINT fk_sa_collector  FOREIGN KEY (collector_id)  REFERENCES users(id);

-- ---- W20.2 service_account_view 查看权(多人 — Q2) -----------
CREATE TABLE IF NOT EXISTS service_account_view (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL                COMMENT '冗余,便于隔离查询',
  service_account_id INT NOT NULL,
  employee_id INT NOT NULL              COMMENT 'users.id(被授查看权的员工)',
  granted_by INT DEFAULT NULL           COMMENT '授权人;NULL=系统(采集人默认查看权)',
  granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_view (service_account_id, employee_id),
  KEY idx_tenant_emp (tenant_id, employee_id),
  CONSTRAINT fk_sav_tenant   FOREIGN KEY (tenant_id)          REFERENCES tenants(id),
  CONSTRAINT fk_sav_sa       FOREIGN KEY (service_account_id) REFERENCES service_accounts(id),
  CONSTRAINT fk_sav_employee FOREIGN KEY (employee_id)        REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='W20 客服账号查看权(多人)';

-- ---- W20.3 service_account_audit 治理审计(PRD §8) -----------
--   审计表:operator/target 可空,不设 FK(loose,容纳系统操作 NULL)。
CREATE TABLE IF NOT EXISTS service_account_audit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  operator_user_id INT DEFAULT NULL     COMMENT '操作者(管理员/系统NULL)',
  target_employee_id INT DEFAULT NULL,
  service_account_id INT DEFAULT NULL,
  event_type VARCHAR(40) NOT NULL
    COMMENT 'first_seen/temp_grant/confirm/reassign_collector/view_add/view_remove/reject_collect/pending_grab/instance_conflict/old_collector_blocked',
  before_value JSON DEFAULT NULL,
  after_value JSON DEFAULT NULL,
  device_id VARCHAR(64) DEFAULT NULL,
  browser_profile_id VARCHAR(64) DEFAULT NULL,
  tab_id VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tenant_sa (tenant_id, service_account_id),
  KEY idx_event (tenant_id, event_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='W20 客服账号治理审计';

-- ---- W20.4 collect_instances 采集实例 heartbeat(阶段D) ------
--   ★uk_instance 用 collector_instance_id(NOT NULL)单列,不含 nullable 字段(避免 NULL-in-uk 多条重复)。
--   heartbeat 表,loose,不设 FK。
CREATE TABLE IF NOT EXISTS collect_instances (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  employee_id INT NOT NULL,
  collector_instance_id VARCHAR(64) NOT NULL  COMMENT '★= hash(device_id+browser_profile_id+tab_id),NOT NULL 做唯一键',
  device_id VARCHAR(64) DEFAULT NULL,
  browser_profile_id VARCHAR(64) DEFAULT NULL,
  tab_id VARCHAR(64) DEFAULT NULL,
  platform VARCHAR(32),
  platform_page VARCHAR(64),
  account_biz_id VARCHAR(128) DEFAULT NULL,
  conversation_id VARCHAR(128) DEFAULT NULL,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(16) DEFAULT 'active',
  UNIQUE KEY uk_instance (tenant_id, collector_instance_id),
  KEY idx_acct (tenant_id, platform, platform_page, account_biz_id),
  KEY idx_conv (tenant_id, platform, platform_page, account_biz_id, conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='W20 采集实例 heartbeat';

-- ---- W20.5 employee_service_account 标废弃(Q2,不 DROP) ------
--   采集权→service_accounts.collector_id;查看权→service_account_view。
--   本阶段不删、不迁移(无真实用户数据);DROP 留 W20 稳定后单独一步(同 W19 RBAC 两步纪律)。
ALTER TABLE employee_service_account
  COMMENT = 'W20 废弃:采集权移至 service_accounts.collector_id、查看权移至 service_account_view;不再读写;DROP 待 W20 稳定后单独一步';
