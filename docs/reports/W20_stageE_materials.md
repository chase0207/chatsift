---
文档: W20 阶段E · E1/E2 执行材料(活文档)
版本: v1.0.0
周次: W20
落位: docs/reports/
状态: Materials(准备就绪,执行需 Chase 在场;本轮未执行 E1/E2)
身份: DEV(CC4) / 环境: 本地 worktree chatsift-w20 / 分支: w20-account-governance(未 merge/未 push)
---

# W20 阶段E · E1/E2 执行材料

> 本文件是 E1(dev 库 apply)与 E2(真机回归)的可执行材料,**本轮仅准备,未对 dev 库做任何操作**。
> 预检 SQL 已在本地模拟库(devsim/fresh)验证,**未碰 dev 库 `chatsift`**。E1/E2 实际执行等 Chase 在场。
> 配套计划见 `W20_stageE_plan.md`。

## 变更日志
| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0.0 | 2026-06-08 | 初版:E1 预检 SQL + apply 前后核对 + 去重决策;E2 真机观察清单(含 Chase 两点 caveat);P3 已知限制 |
| v1.1.0 | 2026-06-08 | 修正措辞:只读预检可先跑(判断去重/清库需求,无需备份/Chase);备份是 apply/去重/清库前强制;apply 前最终预检需 Chase 在场确认目标库非 test/prod。预检 SQL 去尾部空行(git diff --check 通过) |
| v1.2.0 | 2026-06-08 | **E1 只读预检已对 dev 库 chatsift 实跑**(纯 SELECT,未改数据):W20 未 apply、§3 无 nickname-split 重复(无需去重)、存量 1 账号/4 会话/79 消息。新增 1.1.5 实测 + 1.2.5 apply 方式决策(A 原地/B 清库重采,推荐 B)。已停在 apply/清库前等 Chase。 |

---

## 一、E1 — dev 库 apply 执行材料

### 1.1 预检脚本(只读)
- 脚本:`deploy/w20_preflight_check.sql`(纯 SELECT,不改数据,pre/post 均可安全运行)。
- 跑法:`mysql -uroot <dev库名> < deploy/w20_preflight_check.sql`
- **时机**:
  - 只读预检**可先跑**(不改数据)→ 用于判断是否需要去重/清库;**无需备份、无需 Chase 在场**。
  - **apply 前的最终预检需 Chase 在场**,确认 §0 `target_db` 是 dev、**不是 test/prod**;apply 后再跑一次对比。
- **判读(本地模拟库实测样例)**:

| 段 | apply 前期望 | apply 后期望 |
|---|---|---|
| §0 目标库 | target_db = dev 库名(**确认不是 test/prod**) | 同 |
| §1 W19 基线 | has_service_accounts=1 / has_users_user_type=1 / has_roles_role_code=1;roles 有 platform_admin/tenant_admin/agent | 同 |
| §2 W20 状态 | w20_cols_present=**0** / w20_tables_present=**0** / uk_account_cols=**含 account_nickname** | w20_cols=**4** / w20_tables=**3** / uk_account_cols=**去 account_nickname** |
| §3 重复检查 | **空(无行)** | 空 |
| §4 数据量 | 记录 service_accounts/conversations/messages/esa 行数 | **与 apply 前完全一致**(无丢失) |

实测样例(模拟库):pre §2 = `0 / 0 / tenant_id,platform_id,page_id,account_biz_id,account_nickname`;post §2 = `4 / 3 / tenant_id,platform_id,page_id,account_biz_id`。

### 1.1.5 E1 预检实测(dev 库 `chatsift` @ 127.0.0.1:3306,2026-06-08,只读)
> dev 库拓扑确认:主库 `~/vscode/chatsift/server/.env` → DB_HOST=127.0.0.1 / DB_PORT=3306 / DB_NAME=chatsift(无 docker 容器、3307 关闭),即 dev server(3100)所用库。MySQL 9.6.0。
- §0:target_db=**chatsift**(确认非 test/prod)。
- §1:W19 基线在位;roles=platform_admin/tenant_admin/agent;users 4 个(admin internal / 18651359635 租户1超管 / tenant 租户1客服 / 15376985994 租户2超管)。
- §2:W20 **未 apply**(w20_cols=0 / w20_tables=0 / uk 含 account_nickname)→ 干净 pre-apply 态。
- §3:**空 → 无 nickname-split 重复 → uk 迁移安全,无需去重。** ✅
- §4:存量 service_accounts=**1** / conversations=**4** / messages=**79** / esa_rows=**1**。
- **结论**:可安全 apply(无重复阻塞);但存量有 1 个账号 + 4 会话 + 79 消息,**apply 方式需 Chase 拍板(见 1.2.5)**。**已停在 apply/清库前,等 Chase 在场。**

### 1.2.5 ★apply 方式决策(存量数据处理,★Chase 在场)
存量虽小但非空,apply 后行为不同,需 Chase 定:
- **选项A 原地 apply**:1 个存量 service_account → lifecycle='pending'、collector_id/first_seen_by=NULL(新列默认)、无 view 行 → **仅租户超管可见,客服看不到**,需管理员 confirm 并指派采集人后才进正常流。存量 4 会话/79 消息保留。
- **选项B 清库重采(推荐)**:dev 是测试数据(非真实用户),清库后真机重采走 W20 完整链路(首见→pending→临时采集权→view→confirm),试点最干净、最能验收 E2 全流程。**会丢 79 条测试消息。**
- 两者都需:**先备份(1.3)+ Chase 在场**。推荐 B(测试数据、量小、验收更完整);若要保留现有数据则 A。

### 1.2 ★nickname-split 重复(uk 迁移前提)
- §3 命中(非空)即存在同 `(tenant,platform,page,account_biz_id)` 多昵称行 → `W20.0 ADD UNIQUE KEY uk_account` 会因重复键**失败**。
- 命中样例:`account_biz_id=biz_demo, dup_rows=2, sa_ids=2,1, nicknames=坐席乙 | 坐席甲`。
- **处置(★Chase 决策)**:
  - 选项A:保留最新/合并到一个 sa_id(改 conversations/messages/leads/workorders/analysis_jobs 的 service_account_id 指向保留行),删多余行——**改数据,需备份 + Chase 在场**。
  - 选项B:dev 库本就脏数据 → 清库重采(同 W17/W19 清库纪律,备份在先,★Chase 拍板)。
  - 选项C:无重复(§3 空)→ 直接进 1.3。
- 推荐:先看 §3 结果;若 dev 无真实用户、§3 命中也只是测试脏数据 → 选 B 清库最干净。

### 1.3 备份(apply / 去重 / 清库前强制)
- 触发任一**写操作**(apply schema / 去重改数据 / 清库重采)前**必须**先备份;只读预检不需要。
- `mysqldump -uroot <dev库名> > /离机路径/chatsift_dev_<日期>.sql`
- **下载离机 + 验证可解压**(`gzip -t` 或试 `head`/`mysql --force` 导入到临时库),不是 dump 完就算(prod-safety §8)。

### 1.4 apply(★Chase 在场)
- 命令:`mysql -uroot <dev库名> < deploy/w20_account_governance.sql`
- 该文件含:W20.0 uk DROP/ADD + 四列 + 三表(IF NOT EXISTS)+ esa 注释。**幂等性**:四列 ALTER ADD 非幂等(仅跑一次);三表 IF NOT EXISTS 幂等;W20.0 DROP INDEX 在旧 uk 上跑一次。
- 风险:dev server(3100)正用该库;ALTER 期间短暂元数据锁(表小、瞬时)。回退:从 1.3 备份恢复。

### 1.5 apply 后核对
- 重跑预检 → §2 = 4/3/去昵称、§4 行数不变。
- `SELECT lifecycle, COUNT(*) FROM service_accounts GROUP BY lifecycle;` → 存量行应为 `pending`(Q2 拍板:存量默认 pending)。
- `SHOW CREATE TABLE service_accounts\G` 核对四列 + idx_lifecycle + 2 FK;三表存在;`SELECT TABLE_COMMENT ... employee_service_account` = W20 废弃注释。
- 只读 smoke:dev server 关键只读接口返回 200(如 GET /api/v1/home、/api/v1/conversations),无 500。

---

## 二、E2 — 真机重点观察清单

> 环境:加载 unpacked 插件(content.js)→ 真机抖音私信;需 ≥2 个采集实例(两个 tab/浏览器 profile/设备)、租户管理员 + 两个客服账号。
> 心跳间隔 15s;阻断窗口(server)60s。每项记:触发方式 / 实测行为 / 是否符合期望。

| # | 观察项 | 期望行为 | 触发方式 | 记录点 |
|---|---|---|---|---|
| O1 | session-block 是否真停采 | 实例B 收到 block 后 `collectMessageSession` 入口拦截、**不再入队/上报**;`RpaLegacyCollector.isBlocked()===true` | 两实例打开**同一账号同一会话**,等 ≥1 个心跳周期 | 实例B 是否还有新消息入库;isBlocked() 值;Logger `blocked by session-level instance conflict` |
| O2 | 冲突解除是否恢复采集 | 关掉实例A(或切走)后,实例B 下次心跳无冲突 → `isBlocked()===false`,恢复入队/上报 | 解除冲突后等 ≤1 心跳周期(≤15s) | 实例B 是否恢复采集;Logger `conflict cleared, collection resumed` |
| O3 | warn 是否只提醒不停采 | 两实例同账号**不同会话** → 实例收 warn:派发 `chatsift:collect-conflict` 事件 + Logger.warn,**采集照常不停** | 两实例同账号、各开不同客户会话 | 是否仍正常入库;isBlocked() 应为 false;事件 detail.action='warn' |
| O4 | 两实例同会话 conversation_id 是否一致 | 同一真实会话两实例算出**相同 conversation_id**,server 才判 session-block | O1 同时,比对两实例上报的 conversation_id | conversation_id 是否逐字相同;★依赖客户昵称 DOM 读一致(见 P3-1) |
| O5 | block 后切到无会话/无 bizId 页 | **当前实现:_blocked 不自动清**(心跳取不到 context 提前返回)→ 仍 blocked,直到回到可心跳会话拿到无冲突响应、或 stop/restart | block 中切到抖音非会话页 / 无 accountId 页 | isBlocked() 是否仍 true;回到会话后是否解除;记录该行为(P3-2 候选小修) |
| O6 | 心跳失败不误停 | 断网/无 token 时 sendHeartbeat 返回 null → **fail-open,采集不受影响、_blocked 不被置位** | block 前后制造网络失败 | 失败期间采集是否照常 |

### E2 配套:三角色×三态 SQL 可见性断言
- E2 真机产生数据后(或 dev 受控数据),跑 E3 脚本逐项断言 9 组合(internal/tenant_admin/agent × pending/active/disabled)在 conv/leads/wo/analytics/home 的可见性,对齐技术方案 §7(已在 Stage C 自测覆盖逻辑,E2 用真机数据复核)。

---

## 三、已知限制 / 技术债(记录,非本轮修)

### P3-1 conversation_id 依赖客户昵称 DOM 读一致
- session-block 判定要求两实例对同一会话算出相同 `conversation_id`(= `douyin_<page>_<bizId>_hash(page|bizId|nickname)`)。其中 `nickname`(客户昵称)来自 DOM。
- 若两实例因渲染/时机读到的客户昵称不一致 → conversation_id 不同 → 只触发 account-warn 而非 session-block。
- E2(O4)真机观察;若高频不一致,考虑 conversation_id 改用更稳的会话键(不含易变 nickname)——属采集口径,需另立方案。优先级 P3。

### P3-2 block 后切无会话页 _blocked 不自动清(Chase 指出)
- 现状(E0 实现):`_heartbeatTick` 在 `_currentHeartbeatContext()` 为 null(无会话/无 bizId)时提前返回,**不清 _blocked**。
- 影响:block 中切到无会话页会"卡 blocked",需回到可心跳会话拿无冲突响应、或 stop/restart 才解除。
- 候选小修:context 为 null 时也清 _blocked(无活跃采集目标=无冲突);改一行,放 E2 观察(O5)后定是否采纳。优先级 P3。

### P3-3 server 冲突检测未含 platform/platform_page(Chase 指出)
- 现状:heartbeat 冲突查询 `WHERE tenant_id=? AND account_biz_id=? AND collector_instance_id<>?`,未纳入 platform/platform_page。
- 抖音私信试点:account_biz_id(=URL accountId)足够唯一,可接受。
- 风险:多平台/多页面扩展后,同一 account_biz_id 跨页面可能误判冲突。
- 建议:多页面扩展前,把 platform/platform_page 纳入冲突条件(查询 + collect_instances 已有这两列)。优先级 P3(扩展前修)。

---

## 四、本轮边界声明
- 本轮仅准备 E1/E2 材料 + 预检 SQL(`deploy/w20_preflight_check.sql`),并在**本地模拟库**验证。
- **未对 dev 库 `chatsift` 做任何操作**;未 apply dev/test/prod;未清库;未 merge/push/deploy;未碰主库。
- E1(备份/去重/apply)、E2(真机)均停在执行前,等 Chase 在场。
