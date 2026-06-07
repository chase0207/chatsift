---
文档: W20 实施任务清单 — 客服账号采集权/查看权治理
版本: v1.0.0
周次: W20
落位: docs/prd/
状态: Active
---

## 变更日志
| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.0.0 | 2026-06-07 | 初版:基于 W20_design PRD + 技术方案 v1.3.0,拆 5 阶段(数据模型/首见确认/采集权查看权分离/实例冲突/验收) |

---

# W20 实施任务清单(给 DEV = CC1)

> **先读**:W20_design PRD;技术方案 `docs/research/2026-06-07_W20技术方案.md`(v1.3.0,DDL/调用点/判定逻辑以它为准);AGENTS.md(§3 分类、§4 单 agent 单分支);prod-safety.md。
> **性质**:C 类(改 service_accounts 生命周期 + 采集权契约 + 采集入库判定 + 新表 + 插件字段 + 废弃 esa),最敏感。**分 5 阶段,每阶段独立验收**。
> **地基**:采集权=`service_accounts.collector_id` 单外键;查看权=新建 `service_account_view`;`employee_service_account` 废弃(不 DROP)。pending 数据进正式表;无灰度硬拒绝(event 级 rejected,非整批 403)。
> **红线**:W17 position/message_id 不动;W19 资产模型不破坏;后台无发送入口。

---

## 开工前置(AGENTS §1/§4)
- 从干净 main 切 `w20-account-governance` 分支,单 agent 全程。
- 声明身份 DEV、环境(本地);git status 干净。
- 开发期不发版/不打 tag;不碰生产;清库/发版留到阶段E。
- 每阶段 schema/采集契约/插件字段改前**列 diff 报 Chase**;B/C/D 重改动各自最终 diff 再报。

---

## 阶段 A — 数据模型(地基)
> 【★C 类:schema 改前列 diff 报 Chase 确认再动】先出**阶段A 精确 schema diff**(并入 02_w19 基线 + deploy 升级 migration + compose 挂载/dev 副本同步,防 M22),审过再 apply。

### A1 service_accounts 扩 4 列
- 加 `lifecycle`(VARCHAR16,DEFAULT 'pending')/`first_seen_by`(FK users)/`collector_id`(FK users)/`collector_kind`(temp/formal)+ `idx_lifecycle(tenant_id,lifecycle)`。
- ★`status` 与 `lifecycle` 双字段:status 暂留不扩展,业务判断只看 lifecycle(文档/注释写明)。
- 现有账号无真实数据,默认落 pending、需管理员确认(不做复杂迁移)。

### A2 新建三表
- `service_account_view`(查看权多人:tenant_id/service_account_id/employee_id/granted_by/granted_at;uk_view(sa_id,employee_id);**idx_tenant_emp(tenant_id,employee_id)**)。
- `service_account_audit`(审计:operator/target_employee/sa/event_type/before/after/device/profile/tab/created_at)。
- `collect_instances`(实例:**collector_instance_id VARCHAR64 NOT NULL** + device/profile/tab/platform/page/account_biz_id/conversation_id/last_seen_at/status;**uk_instance(tenant_id,collector_instance_id)** 不含 nullable)。

### A3 employee_service_account 标废弃
- 加注释"W20 废弃,不再读写,DROP 留稳定后单独一步";本阶段不删、不迁移。

### A 验收(报 Chase)
- 四列 + 三表建好,字段/索引/外键正确;migration 只增不改;compose 挂载 + dev 副本同步一致(check-version 计数对)。
- status/lifecycle 双字段口径文档写明。

---

## 阶段 B — 首见 + 确认
> 【B 改采集入库判定 = 重改动,落地前再列最终 diff(AGENTS §4)】

### B1 resolveServiceAccount(替 resolveServiceAccountId)
- 改返回完整对象 `{id, lifecycle, collector_id, collector_kind, created}`(技术方案 §3.1)。
- 首见(uk_account 未命中)→ 事务内建:lifecycle='pending'、first_seen_by=本员工、collector_id=本员工、collector_kind='temp';同步写 service_account_view 一行(granted_by=NULL);audit first_seen+temp_grant;返回 created=true。
- 缺 account_biz_id/映射不到 → 返回 null(放行/拒绝由 §C1 闸门按 page 判)。
- ★并发首见:后到者 INSERT 撞 uk_account → 捕获改查命中行返回(created=false),不重复创建。

### B2 管理员确认接口(serviceAccountController)
- `POST /:id/confirm {collector_id?, viewer_ids?}`:pending→active;设正式 collector(默认=临时人,可改)+ collector_kind='formal';配查看人;★collector 校验同租户 external+agent;★确保 collector 有 view 行;audit confirm。
- 待确认提醒:homeController 加 `lifecycle='pending'` 计数 + 列表(first_seen_by/首见时间/建议采集人);mychat/admin 前端待办入口(PRD §7.2)。

### B 验收(报 Chase)
- 插件首见未知账号 → server 建 pending + 临时采集权 + view + audit;当前员工可继续采。
- 管理员看到待确认账号,确认后转 active、设正式采集负责人 + 查看人;audit 完整。

---

## 阶段 C — 采集权 / 查看权分离
> 【C1 采集入库判定 = 重改动,落地前列最终 diff】

### C1 采集权判定闸门(eventsController.batch,★event 级 rejected)
- 在 resolveServiceAccount 后、写库前加判定(技术方案 §3):
  - sa==null + `platform_page='private-message'` 且缺 account_biz_id → **rejected++**,reason='missing_account_biz_id'(私信不放行)。laike/feige → 维持 NULL 放行。
  - sa.created → accepted(首见已建临时采集权)。
  - sa.lifecycle='disabled' → rejected, reason='account_disabled'。
  - 本员工==collector_id → accepted。
  - 本员工!=collector_id → **rejected**(不抛 HTTP),reason=pending?'pending_grab':'not_collector';audit。
- **HTTP 仍 200**,返回 `{accepted,duplicated,rejected,reject_reasons:[{platform_message_id,reason}]}`;internal/token/异常才 401/403/500。
- **删除 autoBindAgent**(并入 B1)。batch 内 memoize 同账号只判一次。

### C2 查看权过滤(scope helper)
- `_shared.assignedAccountIds` 改读 `service_account_view`,★带 `WHERE tenant_id=? AND employee_id=?`。
- 客服/internal/tenant_admin/fail-closed 分支逻辑不变。

### C3 admin 采集权/查看权管理(serviceAccountController)
- 查看权:`GET/POST /:id/views`、`DELETE /:id/views/:employeeId`(替 assignments/assign/unassign,操作 service_account_view + audit view_add/view_remove)。
- 采集权重分配:`PUT /:id/collector {employee_id}`(校验同租户 agent;记 old/new;新 collector 自动加 view 行;audit reassign_collector)。
- `PUT /:id/disable`·`/enable`(lifecycle 切;disabled 历史不删)。
- list 扩字段(lifecycle/collector/collector_kind/first_seen_by/view_count/last_collect_at);`GET /:id/conflicts`(查 audit)。

### C4 ★业务查询按 lifecycle + 查看权过滤(全面)
- 不只 serviceAccountController。**逐个核**:conversationsController(list/detail/messages/facets)、leadsController(list/detail/recent)、workordersController(list/detail)、analyticsController、homeController。
- 口径(技术方案 §7):pending=管理员+临时采集人可见 / active=查看权 / disabled=业务列表隐藏(管理·审计页可查)。

### C 验收(报 Chase)
- 非采集负责人采集 → event 级 rejected(HTTP 200,批不 requeue);私信缺 biz_id 被拒;laike/feige 仍放行。
- 查看权多人:加/删 view 生效;客服只见 view 集 + 自己采集的账号。
- 采集权重分配后旧负责人被拒、新负责人可采;disabled 拒采、历史可查。
- 业务页按 lifecycle 过滤正确(三类角色 + 三态 SQL 断言)。

---

## 阶段 D — 采集实例冲突检测
> 【D 改插件上报字段 + heartbeat = 重改动,落地前列最终 diff】

### D1 插件生成实例标识
- `device_id`(chrome.storage 持久,首次随机)/`browser_profile_id`(chrome.storage 持久,可等同 extension install id)/`tab_id`(sessionStorage 每页签)/`collector_instance_id`=hash(三者)。
- heartbeat 与 batch 上报均带(上报链路通用透传)。

### D2 server heartbeat 冲突检测(eventsController.heartbeat,现空壳)
- upsert collect_instances(uk=tenant+collector_instance_id,刷新 last_seen_at + 当前 account_biz_id/conversation_id)。
- 查同租户其他活跃实例(last_seen_at 在窗口内,排除自身):
  - 会话级命中(同 account_biz_id+conversation_id)→ `{conflict:'session',action:'block'}` + audit instance_conflict。
  - 账号级命中(同 account_biz_id 不同会话)→ `{conflict:'account',action:'warn'}`。
- 插件按 action 停采(block)/强提醒(warn)(PRD §7.3 文案)。

### D 验收(报 Chase)
- 同账号同会话多实例 → 阻止;同账号不同会话/多实例 → 强提醒;冲突进 audit。
- 登录多设备不被踢(PRD §6.1 第一阶段)。

---

## 阶段 E — 验收 + 试点回归
### E1 全流程真机回归
- 抖音私信账号跑:首见→pending→管理员确认→active→采集权重分配→查看权增删→多实例冲突,全链路。
- 三类角色(internal/tenant_admin/agent)× 三态(pending/active/disabled)数据可见性 SQL 断言。

### E2 验收报告
- 写 docs/reports/W20_stage{A,B,C,D,E}_acceptance.md。
- 关联技术债关闭(若有);W17/W19 红线复核(position/message_id 未动、资产模型未破坏、无发送入口)。

---

## 完成标准
- A 数据模型 ✓ / B 首见确认 ✓ / C 采集权查看权分离 ✓ / D 实例冲突 ✓ / E 验收试点 ✓
- 采集权单人硬拒绝(event 级);查看权多人;pending 生命周期;实例冲突阻止/提醒;审计完整。

## 重要提示
- **C 类最敏感**:每阶段 schema/采集契约/插件字段改前列 diff 报 Chase。
- **采集拒绝 event 级**(HTTP 200),严禁整批 403(会 requeue 卡死合法事件)。
- **单 agent 单分支**:w20 分支只 CC1 写。
- **部署口径=rsync**;新增 SQL 同步 compose 挂载 + dev 副本(防 M22)。
- 写代码前先出**阶段A 精确 schema diff** 报 Chase,审过再 apply。
