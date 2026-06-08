-- ============================================================
-- W20 阶段E · E1 dev 库 apply 只读预检(★只 SELECT,不改任何数据)
-- ============================================================
-- 用法:mysql -uroot <dev库名> < deploy/w20_preflight_check.sql
-- 时机:Chase 在场、dev 库已备份(离机+验证可解压)之后;apply 前跑一次、apply 后再跑一次对比。
-- 判读:
--   apply 前期望:§2 w20_cols=0 / w20_tables=0 / uk 含 account_nickname;§3 空(无重复)。
--   apply 后期望:§2 w20_cols=4 / w20_tables=3 / uk 去 account_nickname;§3 仍空;§4 行数与 apply 前一致。
--   §3 若非空 → 存在 nickname-split 重复,uk 迁移会失败,先停,报 Chase 决定去重/清库。
-- ============================================================

SELECT '=== 0. 目标库 + 环境(确认是 dev,不是 test/prod)===' AS section;
SELECT DATABASE() AS target_db, @@version AS mysql_version, @@hostname AS host, NOW() AS checked_at;

SELECT '=== 1. W19 基线在位 ===' AS section;
SELECT
  (SELECT COUNT(*) FROM information_schema.TABLES  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='service_accounts')                          AS has_service_accounts,
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='user_type')         AS has_users_user_type,
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='roles' AND COLUMN_NAME='role_code')         AS has_roles_role_code;
SELECT id, role_code, role_scope, name FROM roles ORDER BY id;
SELECT id, username, user_type, tenant_id, role_id FROM users ORDER BY id;

SELECT '=== 2. W20 是否已 apply(pre-apply 期望全 0 / uk 含 nickname)===' AS section;
SELECT COUNT(*) AS w20_cols_present
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='service_accounts'
    AND COLUMN_NAME IN ('lifecycle','first_seen_by','collector_id','collector_kind');
SELECT COUNT(*) AS w20_tables_present
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('service_account_view','service_account_audit','collect_instances');
SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS uk_account_cols
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='service_accounts' AND INDEX_NAME='uk_account';

SELECT '=== 3. ★nickname-split 重复检查(uk 迁移前提:必须为空)===' AS section;
SELECT tenant_id, platform_id, page_id, account_biz_id, COUNT(*) AS dup_rows,
       GROUP_CONCAT(id) AS sa_ids, GROUP_CONCAT(account_nickname SEPARATOR ' | ') AS nicknames
  FROM service_accounts
  GROUP BY tenant_id, platform_id, page_id, account_biz_id
  HAVING COUNT(*) > 1;

SELECT '=== 4. 存量数据量(apply 前后核对一致,防丢失)===' AS section;
SELECT (SELECT COUNT(*) FROM service_accounts)         AS service_accounts,
       (SELECT COUNT(*) FROM conversations)            AS conversations,
       (SELECT COUNT(*) FROM messages)                 AS messages,
       (SELECT COUNT(*) FROM employee_service_account) AS esa_rows;

-- 注:本文件 pre-apply / post-apply 均可安全运行(纯 SELECT,不引用 W20 新列,避免 pre-apply 报错中断)。
-- apply 后另跑一行看生命周期分布:SELECT lifecycle, COUNT(*) FROM service_accounts GROUP BY lifecycle;

