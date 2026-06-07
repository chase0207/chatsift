-- M16 第二步:物理删 users.role(旧 1/9 双轨,W19 已统一 role_id;本次去掉代码所有 role 读写后删列)
-- 给已有库(prod/test);全新库由 server/sql/00_reused_tables.sql 基线直接建成(已无 role 列),不跑本文件。
--
-- ★执行顺序(务必)★:必须在"去 role 读写的新代码已部署到该环境之后"才跑本 DROP。
--   原因:若先 DROP 列、旧代码(authController 仍 SELECT/返回 role、userController 仍写 role)还在跑
--   → 旧代码因列不存在报错。正确序:① 部署含本次去 role 改动的新版本 → ② 再跑本 DROP。
--   prod 当前 v0.5.0 仍带 role 读写,故 prod DROP 要等"含本改动的新版本部署到 prod"之后、Chase 在场再跑。
--
-- users.role = NOT NULL DEFAULT 1,删列不影响其它列;role_id/user_type/role_code 才是现行判据。

ALTER TABLE users DROP COLUMN role;
