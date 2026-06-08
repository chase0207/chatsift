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

### E2 第一轮(2026-06-08)→ 发现 bug → 已修(β)
- 现象:3 客户只采到 1 个(缺 chase)。根因+修复见 `W20_stageE_diagnosis.md`:heartbeat 冲突未限定"同采集负责人",非采集人管理员A 的实例 block 了合法采集人 B。
- 修复(Chase 选 β):heartbeat 只治理"同采集负责人多实例";非采集人不参与冲突,只被 batch 闸门拒。Stage D β 自测 19/19。
- **W20 server 已重启加载 β**。
- **dev 库已清第一轮残留**(2026-06-08,Chase 授权):业务表 + W20 治理表(service_account_view/audit/collect_instances/esa)全清 0,基础表(tenants/users/platforms)保留 → **ready for 第二轮 E2**。
- 第二轮提醒:O1 验 session-block 用**同一客服开两个页签**(非 A+B);插件 content.js 未变(本次只改 server),但确认插件 serverUrl 指向 `http://127.0.0.1:3100`。

### E2 阻塞修复:采集权模型核查 + admin 治理闭环(2026-06-08,Chase P0)
两件 P0:
- **采集权核查(任务1)**:确认 events/batch 采集闸门**不依赖**旧 employee_service_account/scope/查看分配(只用 `collector_id`)。放宽 collector 校验允许 tenant_admin 当采集人(PRD §5.1 管理员可给自己分配采集权;新增 `validateCollectorInTenant`;employees 下拉纳入 admin)。采集权 E2E `/tmp/w20_collectperm_test.js` **21/21** 覆盖 Chase 7 用例:
  1. B 首次未预分配→pending,collector=B ✅ 2. A 管理员随后→pending_grab 拒、不影响 B ✅ 3. confirm 保持 collector=B→B 可采 ✅ 4. 重分配 collector=A(管理员)→B 拒、A 可采 ✅ 5. 查看权给 C→能看不能采 ✅ 6. disabled→全员冻结 ✅ 7. 既有分配/查看权不限制首次采集 ✅。commit fcf54de。
- **admin 闭环(任务2)**:`ServiceAccounts.vue` 重建——lifecycle 过滤(待确认 badge)、列表展示(状态/采集人 temp·formal/查看人数/首次发现/最近采集/平台·页面/biz_id/昵称)、确认对话框(选采集人+查看人)、重分配采集人、查看人增删、停用/恢复;API client 补 confirm/setCollector/disable/enable。vite build 编译过。commit f333874。**不再依赖手写 SQL。**

### E2 运行环境(第二轮就绪)
| 端口 | 服务 | 说明 |
|---|---|---|
| 3100 | W20 server | β heartbeat + 采集权 fix,连 dev 库 |
| 5173 | **W20 admin**(http://localhost:5173) | 从 worktree 起,VITE_API_URL→3100;已停旧 main admin |
| 3306 | dev 库 chatsift | 已清空,W20 schema |
- ★浏览器用 `http://localhost:5173`(Vite 绑 IPv6 localhost)。租户超管登录(如 18651359635)→ 客服账号菜单 → W20 治理页。

### E2 第二轮修复(2026-06-08):首见抢占 + 插件状态可见
- **采集权口径修复**(fcb172e → 99f4e7a 修正):首见**始终建 pending**;★**不区分角色,谁发现就把临时采集权给谁(含管理员)**(Chase 纠正:"只给客服"有误)。管理员发现即临时采集人、可采;后续管理员 confirm 时再指派正式采集人。fcb172e 曾错误地"只授 agent+admin认领",99f4e7a 回退。采集权 E2E 24/24 + B/C/D 回归全过。
- **插件状态进消息日志**(commit 0b18584,Chase 选复用 popup 消息日志):event-uploader 把 batch reject_reasons 汇总中文 APPEND_LOG(`[采集]: N条·你不是该账号采集负责人，未上报`);legacy-collector 实例冲突 block/warn/恢复 APPEND_LOG(`[实例]: 同会话其他设备在采，已暂停`);均节流,`[采集]`/`[实例]:` 格式匹配 popup `shouldShowRuntimeLog` 白名单 → popup「消息日志」标签可见。
- **第三轮 E2 环境**:W20 server 重启(采集权 fix 已加载,3100);dev 库已清空;★**content.js 变了,Chase 需重新加载插件**(reload unpacked);插件 serverUrl 指向 127.0.0.1:3100。
  - 测法:用**客服B 的插件**采集(B 发现→认领→采);若 admin 插件也开,admin 不再抢采集权。状态看 popup「消息日志」。

## E3 — 三角色×三态 SQL 可见性断言(待 E2 数据)

## E4 — 红线复核 + 验收收口(待 E2/E3)
