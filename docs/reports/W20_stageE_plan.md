---
文档: W20 阶段E 本地落地计划 + 执行清单(活文档)
版本: v1.0.0
周次: W20
落位: docs/reports/
状态: Plan(只输出计划,未执行;执行需 Chase 拍板)
身份: DEV(CC4) / 环境: 本地 worktree chatsift-w20 / 分支: w20-account-governance(未 merge/未 push)
---

# W20 阶段E — 验收 + 试点回归:本地落地计划

> 本文件是计划,不是执行记录。**本轮不清库、不 apply dev/test/prod、不 merge/push/deploy。**
> 决策已拍板:Q1 独立 03_w20 / Q2 存量默认 pending / Q3 internal 可 confirm / Q4 disabled 业务冻结 /
> Q5 /assignments 别名保留(操作 view) / Q6 disable·enable 注释已补 / Q7 仅 session-block 审计 /
> Q8 heartbeat 60s hardcode / Q9 并发首见放 E 压测 / Q10 D1 周期 heartbeat·block 接线放 E。

## 变更日志
| 版本 | 日期 | 变更 |
|---|---|---|
| v1.0.0 | 2026-06-08 | 初版:E 验收项清单 + 执行计划 + Chase 在场拍板点 + P2 已知问题 |
| v1.1.0 | 2026-06-08 | **E0 插件接线完成(代码)**:legacy-collector 加周期 heartbeat(15s)+ block/warn 执行;session-block 暂停本 tab 采集、account-warn 仅强提醒、无冲突恢复、心跳失败 fail-open;content.js 重建(语法过、diff 仅 legacy-collector 段 +77 行)。真机行为验证仍待 E2。commit 见报告。 |

---

## 0. Stage E 包含两类工作
- **E0 剩余实现(本地代码,无破坏性)**:D1 插件周期 heartbeat 调度 + block/warn 执行接线(Q10 推迟项)。可本地做,但行为要真机验。
- **E1-E4 验证(部分需 Chase 在场)**:dev 库 apply + 真机抖音私信全链路回归 + 三角色×三态 SQL 断言 + 红线复核 + 写 acceptance。

---

## 1. Stage E 验收项清单
| # | 验收项 | 验证方式 | 通过标准 | 依赖 |
|---|---|---|---|---|
| E-A | dev 库 apply | 备份 dev 库 → 查 service_accounts 无 (tenant,platform,page,biz_id) 重复 → apply deploy/w20 → desc/uk 核对 | W20 四列+三表建好;uk_account 去昵称;无报错;只读 smoke 通过 | dev 库备份;Chase 在场 |
| E-B | 真机抖音私信采集 | 加载插件 content.js,真机登录抖音私信采集上报 | 消息入库;链路通(采集→server→DB→admin 展示) | E-A;真机+插件;operator |
| E-C | 首见 → pending | 真机采未录入账号 | service_accounts 建 pending + 临时采集权(采集人)+ 首见人/时间 + view + audit first_seen/temp_grant | E-B |
| E-D | confirm | admin/mychat 后台确认该账号 | pending→active;正式采集负责人(默认临时人,可改)+ 查看人;audit confirm;插件可继续采 | E-C;后台账号 |
| E-E | 采集权拦截 | 非负责人/旧负责人插件采该账号 | 该 event rejected(HTTP 200,批不 requeue);不入库;reject_reason(not_collector/pending_grab/account_disabled);audit | E-D;第二采集人 |
| E-F | 查看权隔离 | 三角色(internal/tenant_admin/agent)× 三态(pending/active/disabled)看业务页 | 客服只见 view 集+自采;无 view 看不到;租户超管看本租户(disabled 业务隐藏);平台方默认不看。**SQL 断言脚本逐项过** | E-D |
| E-G | disabled 冻结 | 停用账号后采集 + 看业务页 | 采集拒(account_disabled);业务列表隐藏;管理/审计页可查;历史数据未删 | E-D |
| E-H | 实例冲突 | 同账号同会话双实例 / 同账号不同会话双实例 | 会话级 → block 停采 + audit instance_conflict;账号级 → warn 强提醒;插件按 action 响应 | E0 接线 + E-B;两实例 |
| E-I | 红线复核 | 代码 + 数据核对 | W17 position/message_id/段时间未动;W19 资产模型未破坏;后台无发送入口 | 全部 |
| E-J | acceptance 报告 | 写 docs/reports/W20_stageE_acceptance.md | E-A~E-I 结果 + 截图/SQL 证据 + 红线复核 | 全部 |

---

## 2. 执行计划(顺序 + 责任 + 是否需 Chase 在场)
> 每步标注:【自主】可本地做 / 【★Chase 在场】高风险或需真机/真实账号。

### 步骤 E0 — D1 插件接线(【自主】本地代码,无破坏性)— ✅ 代码完成(待 E2 真机验)
落点:`plugin/runtime/legacy-collector.js`(tab 采集驱动,有当前会话上下文与 start/stop 生命周期)。
- 周期 heartbeat:`start()` 起 15s 定时 `_heartbeatTick`,从 `_buildSessionInfo` 取当前会话 `account_biz_id`/`conversation_id`(与采集事件同源,server 可对齐),调 `RpaInstanceIdentity.sendHeartbeat(context)`;`stop()` 停心跳。无打开会话/无 bizId(laike/feige)→ 跳过。
- block/warn 执行:`conflict='session' && action='block'` → `_blocked=true`,`collectMessageSession` 入口拦截、暂停本 tab 采集;`action='warn'` → 仅 `_notifyConflict`(Logger.warn + 派发 `chatsift:collect-conflict` 事件)**不停采**。
- 恢复:下次 heartbeat 无冲突 → `_blocked=false` 恢复采集。
- ★保守:`Identity` 缺失或 `sendHeartbeat` 返回 null(网络/无 token)→ **fail-open,不改采集态,绝不误停合法采集**;`_hbInflight` 防重入;`isBlocked()` 供观测。
- 验证:`npm run build:plugin -- --check` 通过;content.js diff 仅 legacy-collector 段 +77 行、无散落改动。
- ⚠️ **真机行为(停采/恢复/双实例触发)在 E-H/E2 验**——停采是副作用动作,代码已就位但需真机确认。

### 步骤 E1 — dev 库 apply(【★Chase 在场】)
1. 环境三确认:`pwd`(本地 worktree)、目标 = dev 库 `chatsift`(非 test/prod)、`git status`。
2. **备份 dev 库**:`mysqldump chatsift` → 下载离机 → 验证可解压(不是 dump 完就算)。
3. **uk 迁移前提检查**:`SELECT tenant_id,platform_id,page_id,account_biz_id,COUNT(*) FROM service_accounts GROUP BY 1,2,3,4 HAVING COUNT(*)>1` —— 有重复则 W20.0 的 ADD UNIQUE 会失败,需先去重(★Chase 定如何去重/是否清)。
3.5 **是否清 dev 库重采**:若 dev 有 nickname-split 脏数据或想干净试点 → 清库重采(★Chase 拍板;同 W17/W19 清库纪律,备份在先)。
4. apply `deploy/w20_account_governance.sql` 到 dev 库(含 W20.0 uk 迁移 + 四列 + 三表 + esa 注释)。
5. 验证:`desc service_accounts`(四列)、uk_account 列组成、三表存在、check 只读接口 200。
- 风险:dev server 正在用 chatsift 库;ALTER 期间短暂锁;additive 改动低风险,uk DROP/ADD 需空/无冲突。
- 回退:从步骤2 备份恢复。

### 步骤 E2 — 真机抖音私信全链路回归(【★Chase/operator 在场】)
- 加载插件(unpacked content.js)→ 真机抖音私信。
- 跑:首见(E-C)→ 后台 confirm(E-D)→ 采集权拦截(E-E:换第二采集人)→ 查看权(E-F)→ disabled(E-G)→ 实例冲突(E-H:开两个 tab/设备)。
- 需:真实抖音客服账号、两个采集员工账号、一个租户管理员账号。

### 步骤 E3 — 三角色×三态 SQL 可见性断言(【自主】本地脚本)
- 基于 E2 真机数据(或 dev 受控数据),脚本逐项断言 conversations/leads/workorders/analytics/home 在 9 组合(3 角色×3 态)下的可见性,对齐技术方案 §7。

### 步骤 E4 — 红线复核 + 写 acceptance(【自主】)
- 核对 W17/W19 红线;写 `W20_stageE_acceptance.md`(证据齐)。

---

## 3. 需 Chase 在场拍板的步骤(汇总)
| 步骤 | 为何需在场 |
|---|---|
| E1.2 dev 库备份 + E1.4 apply | 改运行中 dev 库 schema(破坏性三问:环境/备份/最坏后果);uk DROP/ADD |
| E1.3 / E1.3.5 dev 去重 / 清库重采 | 删/清数据,不可逆,需备份确认 + Chase 在场 apply |
| E2 真机回归 | 需真实抖音账号 + operator 操作真机 |
| (E 之后,**不在本计划**)merge / push / 部署 test·prod | 硬关卡,Chase 亲自;本计划全程不碰 |

---

## 4. 已知问题
### P2 — 并发首见撞 uk 后昵称不刷新(放 Stage E 并发压测观察)
- 现象:`resolveServiceAccount` 首见 INSERT 撞 uk(并发)→ catch 分支 `selectServiceAccount(...FOR UPDATE)` 返回命中行,但**不会用"后到事件的非空昵称"刷新展示名**。
- 范围:仅**极端并发首见**且后到事件昵称更优时,展示名滞后一拍。普通昵称变化路径(非并发)已通过 UK-S2(命中后更新昵称)。
- 影响:展示昵称偶尔非最新;**不影响身份/采集权/查看权/lifecycle/数据正确性**。
- 处置:Stage E 并发压测(E0/E2)观察是否真实发生;若发生,catch 命中分支补一次"非空昵称且不同则 UPDATE"(与命中主路径一致),小修。
- 优先级:P2(低,非阻塞)。

---

## 5. 本轮边界声明
- 本轮**只产出本计划**,未执行任何 E 步骤;未清库、未 apply dev/test/prod、未 merge/push/deploy。
- E0(插件接线)是本地代码可自主执行项,但按"先出计划"约定,待 Chase 认可计划后再开工。
- E1/E2 等需 Chase 在场的步骤,严格停在执行前。
