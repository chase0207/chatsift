---
文档: W16 验收报告 — 平台/租户双入口拆分
版本: v0.2.0(本地就绪,生产待你拉闸)
状态: 本地 Task1-7 物料全部就绪;生产侧待你执行(DNS/证书 + 拉闸)
日期: 2026-06-03
---

## 总览

| Task | 状态 | 说明 |
|---|---|---|
| 1 修 auth 补 permissions | ✅ 本地完成 | `server/src/middleware/auth.js`(refresh/旧 token 不再丢权限点) |
| 2 建租户账号 | ✅ 本地完成 | 本地 `tenant`/id=4/密码 `Mc5jpOnnC99x`;**生产需另建** |
| 3 数据迁移 | ✅ 备份+脚本+演练就绪;⏸ **apply 留你拉闸** | `scripts/w16_migrate.js` |
| 4 插件改租户账号 token | ✅ 无需改代码 | popup 用生产租户账号登录即可 |
| 5 验证数据归属 | ⏳ 迁移 apply 后 | 见下方验证步骤 |
| 6 入口拆分 | ✅ 本地完成 | 租户 SQL(`scripts/w16_task6_role_perms.sql`)+ 前端域名过滤(`admin/src/utils/entry.js`) |
| 7 mychat 域名 | ✅ nginx conf 就绪;🌐 **DNS+证书你做**;⏸ reload 你拉闸 | `deploy/nginx/mychat.kongyuekeji.com.conf` |
| 8 端到端验收 + commit | ⏳ 上线后 | |

**决策已定**:plugin:list 不给租户(Chase 2026-06-03)。

---

## 已完成详情(本地,可回滚)

### Task 1 — auth 补 permissions
`server/src/middleware/auth.js`:verify 后对非超管且缺 permissions 的 token(refresh/旧)从 DB 补 `req.user.permissions`。修 `authController.refresh` 不带 permissions → 普通用户刷新后 403 的问题。语法通过。**生产需 rebuild server 容器生效**。

### Task 2 — 租户账号
本地:`tenant` / TENANT_ID=4 / role_id=2 / 密码 `Mc5jpOnnC99x`。**生产另建**(见清单第 3 步)。

### Task 3 — 数据迁移(脚本+备份就绪,apply 留闸)
- 备份:`~/chatsift_backups/chatsift_before_w16_migration_2026-06-03-00-19-02.sql.gz`(本地;⚠️ 未离机)。
- 脚本:`scripts/w16_migrate.js`(事务+逐表核对行数一致才 COMMIT,否则 ROLLBACK;`--apply` 才执行,`--dst=` 指定目标 id)。
- 迁移表:conversations/messages/leads/workorders/analysis_jobs/tenant_llm_config/price_table。`intent_rules(tenant_id=0)` 不迁。
- 本地基线:conv=4, msg=186, lead=4, wo=4, jobs=186, llm=1, price=1。

### Task 6 — 入口拆分
- **租户侧**(`scripts/w16_task6_role_perms.sql`):删 role 2 的平台页权限点(user/platform/role/menu/log + **plugin:list**)。本地已执行验证:role 2 删后纯业务页+dashboard+业务配置,无平台页。
- **admin 侧**(`admin/src/utils/entry.js` + router + MainLayout):因超管 `menu.tree` 返回全部菜单,改 SQL 无效 → 前端**按域名过滤**:`admin.*`=平台入口(只显平台页)、`mychat.*`=租户入口(只显业务页)、localhost/IP='all'不过滤。单测 17/17 + `build:admin` 通过。

### Task 7 — mychat nginx
`deploy/nginx/mychat.kongyuekeji.com.conf`:复制 admin 配置(443 ssl + root `/opt/chatsift/admin/dist` + `/api`→3100 + SPA fallback),改 server_name/证书路径/日志为 mychat。

---

## 生产上线清单(★你执行,顺序不可乱)

> 前置(你做,我做不了):mychat.kongyuekeji.com **DNS A 记录 → 124.222.146.193**;DNS 生效后 BT 申请 mychat 证书。

```bash
# ── 0. 备份生产库(安全网,先做)──
PW=$(grep MYSQL_ROOT_PASSWORD /opt/chatsift/deploy/.env.production | cut -d= -f2)
docker exec chatsift-mysql sh -c "mysqldump -uroot -p$PW chatsift" > ~/chatsift_prod_before_w16_$(date +%Y%m%d).sql
gzip ~/chatsift_prod_before_w16_*.sql && gunzip -t ~/chatsift_prod_before_w16_*.sql.gz && echo 备份OK
# 下载离机: 在你本机 scp 把这个 .gz 拉走

# ── 1. 同步本次代码改动到 /opt/chatsift ──
#   改动文件: server/src/middleware/auth.js, admin/src/utils/entry.js,
#             admin/src/router/index.js, admin/src/layouts/MainLayout.vue,
#             admin/dist/*(重新构建), scripts/w16_*.{js,sql}, deploy/nginx/mychat*.conf
#   用你既有发版流程(scripts/release-prod.sh 或 rsync)同步;admin 需 npm run build:admin 后同步 dist

# ── 2. rebuild + 重启 server 容器(上 Task1 auth 修复)── 会让 api 短暂中断
cd /opt/chatsift/deploy
docker compose -f docker-compose.prod.yml build server
docker compose -f docker-compose.prod.yml up -d server

# ── 3. 生产建租户账号(强密码; 进 mysql 容器)── 记下返回的 id 作 PROD_TENANT_ID
#   密码哈希: 用 server 容器生成 bcrypt:
docker exec chatsift-server node -e "console.log(require('bcryptjs').hashSync(process.argv[1],10))" '你的强密码'
#   然后(把上面输出的 hash 填入):
docker exec chatsift-mysql sh -c "mysql -uroot -p$PW chatsift -e \"INSERT INTO users(username,password,role,role_id,status) VALUES('tenant','<上面的hash>',1,2,1); SELECT LAST_INSERT_ID();\""

# ── 4. ★数据迁移(不可逆;事务版 SQL,在 mysql 容器)── 把 PROD_TENANT_ID 换成第3步返回的 id
docker exec chatsift-mysql sh -c "mysql -uroot -p$PW chatsift" <<'SQL'
START TRANSACTION;
SELECT COUNT(*) FROM conversations WHERE tenant_id=1;   -- 记录基线
UPDATE conversations     SET tenant_id=<PROD_TENANT_ID> WHERE tenant_id=1;
UPDATE messages          SET tenant_id=<PROD_TENANT_ID> WHERE tenant_id=1;
UPDATE leads             SET tenant_id=<PROD_TENANT_ID> WHERE tenant_id=1;
UPDATE workorders        SET tenant_id=<PROD_TENANT_ID> WHERE tenant_id=1;
UPDATE analysis_jobs     SET tenant_id=<PROD_TENANT_ID> WHERE tenant_id=1;
UPDATE tenant_llm_config SET tenant_id=<PROD_TENANT_ID> WHERE tenant_id=1;
UPDATE price_table       SET tenant_id=<PROD_TENANT_ID> WHERE tenant_id=1;
-- 核对: 下面应为 0(源已清空); 各表 tenant_id=PROD_TENANT_ID 行数应等于基线
SELECT (SELECT COUNT(*) FROM conversations WHERE tenant_id=1)
     + (SELECT COUNT(*) FROM messages WHERE tenant_id=1)
     + (SELECT COUNT(*) FROM leads WHERE tenant_id=1)
     + (SELECT COUNT(*) FROM workorders WHERE tenant_id=1) AS src_remaining;
COMMIT;   -- src_remaining=0 且行数对 → COMMIT; 否则 ROLLBACK;
SQL

# ── 5. 入口拆分: 租户角色去平台页权限点 ──
docker exec chatsift-mysql sh -c "mysql -uroot -p$PW chatsift" < /opt/chatsift/scripts/w16_task6_role_perms.sql

# ── 6. mychat nginx(DNS+证书就绪后)──
cp /opt/chatsift/deploy/nginx/mychat.kongyuekeji.com.conf /www/server/panel/vhost/nginx/html_mychat.kongyuekeji.com.conf
nginx -t && nginx -s reload
```

### 上线后验证(Task 5 + 8)
- 租户账号登录 mychat.kongyuekeji.com → 只见业务页菜单,看得到迁移后的全部会话/线索/工单;手敲 `/users` 被弹回。
- admin 登录 admin.kongyuekeji.com → 只见平台页;手敲 `/conversations` → 后端返回空(数据已迁走)。
- 插件用 tenant 账号登录 → 采一条 → 新数据 tenant_id=PROD_TENANT_ID。
- test 环境(test-admin/3101)同步同一套。

---

## 待你事项(汇总)
1. 🌐 mychat DNS A 记录 + SSL 证书(我做不了)。
2. 🔒 拉闸(都在上面清单):生产库备份→代码同步→server rebuild→建账号→**迁移**→权限 SQL→nginx reload。
3. 📦 离机保存备份。
4. 📝 Task 8 commit(我未提交;上线验收 OK 后我按 stage2 文档的 commit message 提,在新分支不 push)。

## 本地改动清单(未 commit)
- `server/src/middleware/auth.js`(Task1)
- `admin/src/utils/entry.js`(新)、`admin/src/router/index.js`、`admin/src/layouts/MainLayout.vue`(Task6 前端)
- `scripts/w16_migrate.js`、`scripts/w16_task6_role_perms.sql`(新)
- `deploy/nginx/mychat.kongyuekeji.com.conf`(新)
- 本地 DB:建了 tenant 账号、role 2 已去 plugin:list(均可由备份回滚)
- `docs/reports/W16_acceptance.md`(本报告)
