---
文档: W20 夜间无人值守总报告(A→D)— 待 Chase 一次性审
版本: v1.0.0
周次: W20
落位: docs/reports/
状态: Draft(夜间产出,天亮交付)
身份: DEV(CC4) / 环境: 本地 worktree chatsift-w20 / 分支: w20-account-governance(未 merge/未 push)
---

# W20 夜间无人值守总报告 · A→D

> 模式:夜间自主推进 A→D,本地自测 + 本地分支 commit,**未 merge / 未 push / 未碰 E / 未碰 test·prod / 未碰主库**。
> 决策歧义就地合理假设 + 记入 §5【待 Chase 决策清单】,不中途停。

## 0. 一句话结论
A→D 四阶段 server + 插件代码全部实现并本地自测通过,独立隔离在 `chatsift-w20` worktree 的 `w20-account-governance` 分支。**等 Chase 审 → 决定是否 apply 到 dev/test、是否进 E、是否 merge。**

> **2026-06-08 追加(Chase 指示)**:已修 **A 闸阻塞项** —— `service_accounts.uk_account` 去除 `account_nickname`,稳定身份 = `tenant_id+platform_id+page_id+account_biz_id`,昵称降为展示字段(昵称变化不拆账号);顺手修 Q6(audit 注释补 disable/enable)。新增独立 commit + 84 项断言全绿(B25/C34/D12 + **uk 修复 13**)。采集侧 `resolveServiceAccount/selectServiceAccount` 改按稳定身份查询、命中后更新展示昵称。详见 §2、§5(Q6 已修)与 `W20_stageA_acceptance §0`。

## 1. 阶段速览
| 阶段 | 内容 | 自测 | commit |
|---|---|---|---|
| A 数据模型 | service_accounts 扩 4 列 + view/audit/collect_instances 三表 + esa 标废弃;独立 `03_w20`(不并 W19)+ dev 副本 + deploy 升级 migration + prod/test compose 挂载 | schema 两路径(fresh-init / 已有库升级)逐表 diff 一致;check-version 4==4 SYNCED | `7ac2497` |
| B 首见+确认 | resolveServiceAccount 首见建 pending+临时采集权+view+audit;confirm 接口;home 待办 | 25/25 | `f44768a` |
| C 采集权/查看权分离 | event 级采集权闸门(HTTP 200+reject_reasons)+删 autoBind;scope 改读 view+lifecycle 过滤;admin views/collector/disable/enable/conflicts/list 扩字段 | 34/34 | `48dbbc6` |
| D 实例冲突 | server heartbeat 冲突检测(session block/account warn);插件实例标识+透传+heartbeat API;content.js 重建 | server 12/12 | `45a6e36` |

各阶段详细见 `W20_stage{A,B,C,D}_acceptance.md`。复跑指引见 §7。

## 2. ★Chase 第一审:完整 schema diff(A 闸,详见 W20_stageA_acceptance §0/§3)
- ★**uk_account 去昵称(A 闸阻塞项已修复)**:`(tenant_id, platform_id, page_id, account_biz_id)`,去掉 account_nickname。三处 02_w19 CREATE 同步 + `03_w20` 加 `W20.0 DROP/ADD uk_account` 兼容已建库。两路径(fresh / 已有库迁移)uk 一致、DROP INDEX 无 FK 阻塞。
- `service_accounts` +lifecycle(NOT NULL DEFAULT 'pending', AFTER status)/+first_seen_by/+collector_id/+collector_kind + idx_lifecycle(tenant_id,lifecycle) + 2 FK→users。**status/既有 FK 不动**。
- `service_account_view`(uk_view(sa_id,emp) + idx_tenant_emp + 3 FK);`service_account_audit`(before/after JSON,无 FK);`collect_instances`(collector_instance_id NOT NULL,uk_instance(tenant,cid),无 FK)。
- `employee_service_account` 仅改表注释为废弃,**不 DROP、不迁移**。
- 双路径验证:`chatsift_w20_base`(已有库 apply deploy/w20)与 `chatsift_w20_fresh`(init 全量)逐表 SHOW CREATE **一致**。

## 3. ★Chase 第二审:C4 lifecycle 过滤是否漏查询
- 落点:统一在 `_shared.scope()` —— 有 saCol+有访问权时追加 `AND (saCol IS NULL OR saCol NOT IN (lifecycle='disabled'))`。
- **全业务查询均经 scope(),一处覆盖、无遗漏**:conversations(list/detail/messages/facets)、leads(list/detail/recent/update/convert)、workorders(list/detail/update/assign)、analytics(funnel/intent/leadLevel/byPage/trend)、home。
- 口径:pending=临时采集人(首见即有 view)+租户管理员可见;active=查看权;disabled=业务隐藏(管理/审计页 serviceAccountController 不走 scope 仍可查)。自测 C4-S9/S10 验证 disabled 隐藏 + 查看权隔离。

## 4. 红线复核
- **W17**:position/message_id/段时间一字未动。采集权闸门只在 resolve 后、写库前 gate,不碰 position-tracker/去重键/时间字段。
- **W19**:资产模型未破坏;esa 表保留零读写;fail-closed 隔离保留并增强。
- **只读**:无任何发送入口;新端点均为治理元数据读写;插件实例标识仅随机指纹+采集维度。

## 5. 【待 Chase 决策清单】(逐条可回,附推荐)
> 夜间均已就地按推荐项实现,Chase 确认或改即可。

- **Q1 结构(已遵夜间指示)**:W20 用独立 `03_w20_account_governance.sql`,**未并入 02_w19**。brief 字面写"并入 02_w19",以 Chase 夜间口头"不与 W19 混"为准。→ 推荐:保持独立。**(已落地)**
- **Q2 存量 lifecycle**:已有库跑升级 migration 后,存量 service_accounts 落 'pending'(DEFAULT)需管理员确认。→ 推荐:无真实用户,接受 pending;如要存量直接 active 我补一条 UPDATE。
- **Q3 confirm 权限**:internal 平台管理员(is_super)目前也能 confirm 租户账号。→ 推荐:允许(平台全权);如要禁止加 denyInternal。
- **Q4 disabled 写操作**:scope 的 disabled 排除同样作用于 leads/workorders 的 update/convert/assign → disabled 账号业务数据变只读(冻结)。→ 推荐:一致冻结(已实现);如要 disabled 仍可改,需把排除限定在读。
- **Q5 /assignments 别名**:旧 `/assignments` 端点保留但已改操作 view 表(不破坏现 admin UI)。→ 推荐:保留别名,待 W20 admin UI 落地后下线。
- **Q6 audit disable/enable 枚举**:**已修复** —— disable/enable 已补进 `service_account_audit.event_type` 的 schema 注释(三处 W20 文件),与代码实现一致。**(已落地)**
- **Q7 warn 是否审计**:仅 session-block 写 audit instance_conflict;account-warn 不审计。→ 推荐:遵 §6 不审计 warn;如要 warn 也入审计我加。
- **Q8 heartbeat 窗口**:活跃窗口硬编码 60s。→ 推荐:够用;如要可配我抽成 env。
- **Q9 并发首见**:FOR UPDATE 回查逻辑就位,未做多进程压测。→ 推荐:Stage E 真机/压测复核。
- **Q10 D1 插件接线归属**:周期心跳调度 + block 停采执行**未接线**,留 Stage E 真机(误接线可能停掉合法采集)。→ 推荐:Stage E 接线验证。

## 6. 卡在硬关卡的清单(全部"待 Chase 在场放行",夜间一步未做)
- **阶段 E 全部**:清库 / 回灌 / 真机全流程回归 / 部署 —— 一步未碰。
- **merge main / git push / 打 tag** —— 未做。w20 分支仅本地。
- **apply 到 test / prod** —— 未碰;未改任何 test/prod schema;未清任何库。
- **apply 到 dev 库 `chatsift`** —— **未做**。为不扰动正在跑的 dev server,夜间自测用独立临时库(见 §7)。是否把 `deploy/w20_account_governance.sql` apply 到 dev 库 `chatsift`,留 Chase 定。
- **admin 前端(Vue)接新端点 / W20 客服账号管理页** —— 不在本次 server+plugin 范围。
- **D1 周期心跳 + block 停采执行接线** —— 留 Stage E(§5 Q10)。

## 7. 复跑 / 验证指引
- 自测库(临时,可随时重建/删除):`chatsift_w20_base`(已有库升级路径)、`chatsift_w20_fresh`(init 全量+种子用户 ta/agent1/agent2)。**均非 dev 库 `chatsift`,未碰 dev 数据。**
- 重建 fresh:`mysql -uroot` 跑 server/sql/ 的 00→v1-schema→02_w19→03_w20 + 种子 3 用户。
- 跑测试:`cd server && NODE_PATH=~/vscode/chatsift/node_modules node /tmp/w20_stage{B,C,D}_test.js`(harness 在 /tmp,未入库,worktree 无 node_modules 故借主库 root node_modules)。
- check-version:`bash scripts/check-version.sh` → SYNCED。
- worktree 隔离确认:主库 `~/vscode/chatsift` 仍在 main、git status 干净,全程未碰。
