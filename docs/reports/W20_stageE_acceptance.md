---
文档: W20 阶段E 验收(试点回归)— 活文档
版本: v1.0.0
周次: W20
落位: docs/reports/
状态: Draft(E1 已执行;E2/E3/E4 待 Chase 在场)
身份: DEV(CC4) / 环境: dev 库 chatsift @ 127.0.0.1:3306 / 分支: w20-account-governance(未 merge/push/deploy)
---

# W20 阶段E 验收 — 试点回归

## 变更日志
| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0.0 | 2026-06-08 | E1 dev 库清库重采 + W20 apply 执行完成(Chase 在场,选项B);post-check + 只读 smoke 全过。E2/E3/E4 待续。 |

---

## E1 — dev 库清库重采 + W20 apply(2026-06-08,Chase 在场,选项B)✅

### 1. 目标库确认
- host=`chys-MBP.local` / port=`3306` / db=`chatsift` / MySQL 9.6.0 → **dev,非 test/prod**。
- 拓扑:主库 `~/vscode/chatsift/server/.env` DB_HOST=127.0.0.1/DB_PORT=3306/DB_NAME=chatsift(无 docker、3307 关闭),即 dev server(3100)所用库。

### 2. 备份
- 文件:`~/chatsift_backups/chatsift_dev_pre_w20_20260608_121542.sql`(90K)。
- SHA256:`41464700ada637f6ed7e1011e786798e466b6360a38f9baac474955a2be85840`。
- 备注:`mysqldump --single-transaction --routines --triggers --databases chatsift` 成功导出;自动"还原到独立库验证"脚本因 sed 改库名未生效而未完成验证(非备份本身问题)。**随后 Chase 指示"可不备份"**,备份文件仍保留作保险。

### 3. 清库范围(FK 顺序 DELETE,保留基础表)
| 清空(采集业务数据) | 前 | 后 |
|---|---|---|
| analysis_jobs | 79 | 0 |
| messages | 79 | 0 |
| leads | 4 | 0 |
| workorders | 8 | 0 |
| conversations | 4 | 0 |
| employee_service_account | 1 | 0 |
| service_accounts | 1 | 0 |
| **保留(基础/RBAC)** | tenants=2 / users=4 / roles=3 / platforms=8 / platform_pages=4 | 不变 |
- 删除顺序:6 个子表(analysis_jobs/messages/leads/workorders/conversations/esa)→ service_accounts(唯一被 FK 引用的父表,最后删)。FK 关系核对:仅这 6 表 → service_accounts,无其他外键依赖,无残留。

### 4. apply
- `mysql -uroot chatsift < deploy/w20_account_governance.sql` → **成功**(含 W20.0 uk DROP/ADD + 四列 + 三表 + esa 注释;空表无重复阻塞)。

### 5. apply 后核对(post-check)
- §2:w20_cols_present=**4** / w20_tables_present=**3** / uk_account=`tenant_id,platform_id,page_id,account_biz_id`(**去 nickname**)。
- §3:空(无 nickname-split 重复)。
- §4:service_accounts/conversations/messages/esa 全 **0**(清库符合预期)。
- lifecycle 分布:空(无存量账号)。
- esa 表注释:`W20 废弃:采集权移至 service_accounts.collector_id...`。
- **只读 smoke(dev server 3100)**:`/home`、`/conversations`、`/leads`、`/workorders`、`/analytics/funnel` × {tenant_admin, agent} = **10 组全 HTTP 200**,无 500;TA `/conversations` 返回 `{code:0, data:{list:[], total:0}}`。

### 6. ★handoff(E2 前必读)
- 当前状态:**dev 库 = 新 W20 schema;dev server(3100)= main(旧)代码**。二者兼容(smoke 200:旧 upsert 兼容新 uk、新列有默认值)。
- **E2 真机要测 W20 行为,需把 dev server 切到 w20 分支代码运行**(本地 dev 重启自 `~/vscode/chatsift-w20/server`,属"本地运行 app"非"部署生产"),**Chase 在场**决定如何切(停 3100 旧实例 / 换工作区起服务)。
- 插件侧:E2 加载 worktree 重建的 `content.js`。

---

## E2 — 真机全链路回归(运行环境已就绪,真机采集待 Chase 操作)

### 运行环境切换(2026-06-08,按 Chase 运行方案)✅
1. 停 main server:kill nodemon(31813)+ node(87665)→ 3100 释放。
2. 起 W20 server:`cd ~/vscode/chatsift-w20/server && NODE_PATH=~/vscode/chatsift/node_modules node src/app.js`(后台,复用 main `.env`,同 dev 库 127.0.0.1:3306/chatsift)。
   - worktree 无 node_modules → 用 NODE_PATH 指向主库 root node_modules(不建软链,避免污染 git;worktree git 仍干净)。
   - `.env` 从 main 复制到 worktree server(gitignored)。
3. **W20 代码确认**:启动日志 `Chatsift Server running on port 3100` + `analyzer worker started`;`GET /api/v1/home`(tenant_admin)返回含 **`pending_accounts:{count:0,list:[]}`**(W20 专有字段,旧代码无)→ W20 代码在跑、连 dev 库(board 业务计数全 0 = 已清库)。

### 待 Chase 操作(真机)
- 加载插件:Chrome 扩展 → 加载已解压 → `~/vscode/chatsift-w20/plugin/`(manifest.json + 重建后的 content.js)。
- 真机抖音私信采集,按 `W20_stageE_materials.md §二` O1-O6 跑;采集产生数据后我可查 dev 库 / 看 server 日志协助核对。
- E2 完成后再决定是否切回 main server(Chase 运行方案 §5)。

观察清单见 `W20_stageE_materials.md §二`(O1-O6 + 三角色×三态 SQL 断言)。

## E3 — 三角色×三态 SQL 可见性断言(待 E2 数据)

## E4 — 红线复核 + 验收收口(待 E2/E3)
