---
文档: W20 阶段C 验收(采集权/查看权分离)— 草稿,待 Chase 审
版本: v1.0.0
周次: W20
落位: docs/reports/
状态: Draft(夜间无人值守产出)
身份: DEV(CC4) / 环境: 本地 worktree / 分支: w20-account-governance
---

# W20 阶段C 验收 — 采集权 / 查看权分离

> 依据:技术方案 v1.3 §3/§4/§5/§7/§8 / W20_tasks 阶段C。★本阶段是 Chase 第二个重点审项(C4 lifecycle 过滤是否漏某个查询)。

## 1. 做了什么
| 子项 | 落点 |
|---|---|
| **C1 采集权判定闸门**(★event 级 rejected,HTTP 仍 200) | `eventsController.batch` + `collectGate`/`wasFormerCollector` |
| 删 `autoBindAgent` + `boundCache`(esa 双写摘除,首见绑定已在 B 并入 resolve) | `eventsController` |
| batch 返回加 `reject_reasons:[{platform_message_id,reason}]` | `eventsController` |
| **C2 查看权过滤** `assignedAccountIds` 改读 `service_account_view`(★带 tenant_id) | `_shared.js` |
| **C3 admin** 查看权 views(GET/POST/DELETE)+ 采集权重分配 collector(PUT)+ disable/enable(PUT)+ conflicts(GET)+ list 扩字段 | `serviceAccountController.js` + 路由 |
| **C4 业务查询 lifecycle 过滤**:scope() 统一加"隐藏 disabled 账号(NULL=未治理放行)" | `_shared.scope()`(一处覆盖 conv/leads/wo/analytics/home/facets) |

### C1 判定逻辑(技术方案 §3)
```
sa==null:private-message 缺 biz_id → reject(missing_account_biz_id);laike/feige → 放行 NULL
sa.created → accept(首见已建临时采集权)
sa.lifecycle=disabled → reject(account_disabled)+ audit reject_collect
本员工==collector_id → accept
本员工!=collector_id → reject: pending→pending_grab / active→not_collector
   audit: pending_grab / 旧采集人(reassign before=本人)→old_collector_blocked / 否则 reject_collect
HTTP 始终 200;internal/token/异常才 401/403/500(保留)。batch 内 memoize 同账号判一次、audit 一次。
```

### C4 口径(技术方案 §7)落地方式
- 统一在 `scope()`:有 saCol 且有访问权时追加 `AND (saCol IS NULL OR saCol NOT IN (lifecycle='disabled'))`。
- pending=临时采集人(首见即有 view 行)+ 租户管理员(看全租户)可见;active=查看权;disabled=业务列表隐藏(管理/审计页 serviceAccountController 不走 scope,仍可查)。
- **覆盖面**:conversations(list/detail/messages/facets)、leads(list/detail/recent/update/convert)、workorders(list/detail/update/assign)、analytics(funnel/intent/leadLevel/byPage/trend)、home —— **全部经 `scope()`**,一处改全覆盖,无遗漏(逐一核对见 §3)。

## 2. 本地自测(直连 batch/controller × fresh 库,34/34 PASS)
| 组 | 关键断言 |
|---|---|
| C1 首见 | agent1 首见 acc_A → accepted、pending、collector=agent1、消息入库 |
| C1 pending_grab | agent2 采 pending acc_A → rejected pending_grab + audit;数据未入库 |
| C1 not_collector | confirm 后 agent2 采 active → rejected not_collector |
| C1 collector accept | agent1 采 active acc_A → accepted |
| C1 缺 biz_id | private-message 缺→reject missing_account_biz_id;laike 缺→放行 saId=NULL(同批) |
| C1 混批隔离 | agent2 同批:acc_B 首见 accepted + acc_A 被拒,互不影响(**非整批失败**) |
| C1 disabled | disable acc_A → agent1 采 reject account_disabled + audit |
| C4 隐藏 disabled | disabled acc_A 会话从 agent1 列表消失;enable 后恢复 |
| C2 查看权隔离 | agent2 无 acc_A view 看不到;看得到自采 acc_B |
| C3 views | ta 加 agent2 view→可见 + audit view_add;删→audit view_remove |
| C3 采集权重分配 | agent1→agent2;旧 agent1 采 reject not_collector + audit old_collector_blocked;新 agent2 可采;audit reassign before=agent1 |
| C2 esa 废弃 | employee_service_account 全程零写入 |

复跑:`cd server && NODE_PATH=<root>/node_modules node /tmp/w20_stageC_test.js`(harness 在 /tmp,未入库)。

## 3. 契约 diff(对外可见变化)
- `POST /api/v1/events/batch` 响应加 `reject_reasons`;**采集权非负责人/disabled/pending抢占 → 该 event rejected(HTTP 仍 200)**。插件收 200=该批已处理不 requeue,按 reject_reasons 提示。
- service-accounts 新端点:`GET/POST /:id/views`、`DELETE /:id/views/:employeeId`、`PUT /:id/collector`、`PUT /:id/disable`、`PUT /:id/enable`、`GET /:id/conflicts`。
- 旧 `/:id/assignments` 系列保留为别名,**内部已改操作 service_account_view**(不再碰 esa)→ 现有 admin UI 的"分配账号"现在管查看权,不破坏。
- service-accounts `GET /` list 扩字段:lifecycle/collector_id/collector_name/collector_kind/first_seen_by(_name)/view_count/last_collect_at。
- 业务页(会话/线索/工单/分析/首页)均隐藏 disabled 账号数据。

## 4. 红线复核
- W17:position/message_id/段时间 **未动**(batch 入库 SQL 的 message 写法、去重键、时间字段一字未改;只在 resolve 后、写库前加 gate)。
- W19:资产模型 **未破坏**;esa 表保留(零读写)。fail-closed 隔离口径保留并增强(scope granted 标志 + disabled 排除)。
- 只读:无发送入口;新端点均为治理元数据读写。

## 5. 待 Chase 决策点(本阶段)
- **Q-C1(disabled 的写操作)**:scope() 的 disabled 排除同样作用于 leads/workorders 的 update/convert/assign —— 即 disabled 账号的业务数据**变只读**(改不动)。符合"停用=冻结"直觉;若 Chase 希望 disabled 仍可改业务数据,需把 disabled 排除限定在"列表/读"而非写。**当前选择:一致冻结(读写都隐藏)**。
- **Q-C2(/assignments 别名去留)**:为不破坏现有 admin UI,旧 `/assignments` 端点保留但已改操作 view 表。待 W20 admin UI(新客服账号管理页)落地后,可下线 `/assignments` 别名。是否现在就废弃由 Chase 定。
- **Q-C3(audit disable/enable 事件类型)**:新增 `disable`/`enable` 两个 audit event_type(03_w20 schema 注释里的枚举为示例性,VARCHAR(40) 接受;未改 schema 文件以免回头 churn Stage A)。如需进 schema 注释枚举,提示我补。
- **Q-C4(混批 + 非负责人 duplicated 口径)**:去重(duplicated)在 resolve/gate 之前,故非负责人若上报"已被正确采集过的重复消息"会计 duplicated 而非 rejected(数据本就在库、不会重复入库,安全)。仅"新消息"被 gate 拦截。此口径可接受,记此备查。
