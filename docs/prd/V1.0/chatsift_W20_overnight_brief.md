---
文档: W20 无人值守作业指令(交 CC4)
版本: v1.0.0
周次: W20
落位: docs/prd/
状态: Active(一次性作业指令)
---

# W20 无人值守作业指令 · 交 CC4

> **模式**:后半夜自主推进 **A→D**,把"待决策"攒起来,天亮 Chase 一次性审,**不中途打断**。
> **阶段 E + 所有"出本地"动作 = 硬闸门,绝不碰**。
> 依据:W20_tasks v1.0 + 技术方案 v1.3.0(DDL/判定/调用点以它为准)+ AGENTS + prod-safety。

身份:DEV(CC4)。工作区:`~/vscode/chatsift-w20`(独立 worktree,分支 `w20-account-governance`)。**不碰主仓 `~/vscode/chatsift`**。

---

## 开工前置
1. 确认 `pwd=~/vscode/chatsift-w20`、分支=`w20-account-governance`、基点=最新 main、`git status` 干净。
2. 读全:`docs/prd/V1.0/chatsift_W20_tasks.md`、`docs/research/2026-06-07_W20技术方案.md`(v1.3)、`docs/prd/V1.0/chatsift_W20_design.md`(PRD)、`PROJECT_STATUS.md`、`AGENTS.md`、`docs/ops/prod-safety.md`。
3. 红线自检贯穿:不动 W17 position/message_id/段时间;不破 W19 资产模型;后台无发送入口(只读)。

## ✅ 自主可做(可逆、纯本地)
- 阶段 **A→D** 的 server + 插件代码全部实现(按技术方案 v1.3)。
- schema **只 apply 到本地开发库**自测(可重建,绝非 test/prod)。
- 每阶段:本地自测过 → **commit 到 w20 分支(本地)** → 写 `docs/reports/W20_stageX_acceptance.md` 草稿 + 列该阶段 schema/契约 diff。
- 设计歧义 / B 类口径不明 → 记进**【待 Chase 决策清单】**,继续做能做的,**不擅自拍、不卡死**。

## ⛔ 绝对禁止(留 Chase 醒后;不确定就归这里)
- **阶段 E 全部**(清库 / 发版 / 部署),一步都不做。
- **merge main、git push、打 tag**。
- 碰 **test / prod**、改任何环境 schema、清任何库数据、把 migration apply 到 test/prod。
- 任何"出本地"或不可逆动作 —— 拿不准是否越界,**一律不做、记待决策**。

---

## 阶段 A — 数据模型(地基,★Chase 醒来第一个审)
**做**:
- `service_accounts` 加 `lifecycle`(默认 pending)/`first_seen_by`/`collector_id`/`collector_kind` + `idx_lifecycle` + 两个 FK。
- 新建 `service_account_view`(`uk_view(sa_id,employee_id)` + `idx_tenant_emp(tenant_id,employee_id)` + 3 FK)。
- 新建 `service_account_audit`;新建 `collect_instances`(`collector_instance_id` NOT NULL + `uk_instance(tenant_id,collector_instance_id)`,不含 nullable)。
- `employee_service_account` 加"W20 废弃不读写"注释(**不 DROP**)。
- schema 落:并入 `server/sql/02_w19` 增量 + `deploy/w20_*.sql` + prod/test compose 挂载 + dev 副本同步(防 M22)。

**本地验收清单**:
- [ ] 本地库 apply 成功;`desc` 四表字段/索引/外键正确。
- [ ] status 与 lifecycle 双字段,业务只读 lifecycle(注释写明);lifecycle 默认 pending。
- [ ] 若新增 sql 文件:check-version 文件数==挂载数。
- [ ] ★把"A 的完整 schema diff"**单独显著标出**(Chase 第一个审,A 错则 B-D 白做)。

## 阶段 B — 首见 + 确认
**做**:
- `resolveServiceAccount`(替 `resolveServiceAccountId`)返回 `{id,lifecycle,collector_id,collector_kind,created}`;
  首见 → 事务内建 pending + collector_id=上报员工(kind=temp) + `service_account_view` 一行 + audit `first_seen`/`temp_grant`;
  并发首见撞 `uk_account` → 捕获改查命中行返回(created=false),不重复建。
- `serviceAccountController`:`POST /:id/confirm`(pending→active,collector formal,校验同租户 external+agent,确保 collector 有 view 行,audit confirm)。
- `homeController`:`lifecycle='pending'` 计数 + 待确认列表(first_seen_by/首见时间/建议采集人)。

**本地验收清单**:
- [ ] 造带新 account_biz_id 的 event → service_accounts 出 pending 行 + collector(temp) + view 一行 + audit。
- [ ] confirm → active + kind=formal + collector 有 view 行 + audit confirm。
- [ ] 并发首见不重复建。

## 阶段 C — 采集权 / 查看权分离(改动面最大,审慎)
**做**:
- `eventsController` 采集权闸门(★**event 级 rejected,HTTP 仍 200,严禁整批 403**):
  private-message 缺 account_biz_id → rejected(reason=missing_account_biz_id);laike/feige 缺 → 放行 NULL;
  disabled → rejected;非 collector → rejected(pending_grab/not_collector)+ audit;**删 autoBindAgent**。
  返回 `{accepted,duplicated,rejected,reject_reasons:[{platform_message_id,reason}]}`。
- `_shared.assignedAccountIds` 改读 `service_account_view`,带 `WHERE tenant_id=? AND employee_id=?`。
- `serviceAccountController`:views 增删 / collector 重分配 / disable·enable / list 扩字段 / `GET /:id/conflicts`。
- ★**C4 全业务查询按 lifecycle+查看权过滤**,逐个核:`conversationsController`(list/detail/messages/facets)、
  `leadsController`(list/detail/recent)、`workordersController`(list/detail)、`analyticsController`、`homeController`。

**本地验收清单**:
- [ ] 非 collector 上报 → HTTP 200 + 该 event rejected + reason;**同批其他合法 event 正常入库**(不整批失败)。
- [ ] 私信缺 biz_id → rejected;laike/feige 缺 → 放行。
- [ ] 客服 scope 只见 view 集(带 tenant_id)。
- [ ] 采集权重分配 → 旧负责人拒、新通过;disabled 拒采、历史可查。
- [ ] 三角色(internal/tenant_admin/agent)×三态(pending/active/disabled)数据可见性 **SQL 断言全过**。

## 阶段 D — 采集实例冲突
**做**:
- 插件生成 `device_id`(chrome.storage 持久)/`browser_profile_id`(持久,可=install id)/`tab_id`(sessionStorage)/
  `collector_instance_id`=hash(三者);heartbeat 与 batch 均带。
- server `heartbeat`(现空壳):upsert `collect_instances`(uk=tenant+collector_instance_id);
  查同租户活跃实例(窗口 60s,排除自身):会话级命中 → `{conflict:session,action:block}`+audit;账号级 → `{conflict:account,action:warn}`。

**本地验收清单**:
- [ ] 两实例(不同 collector_instance_id)同 account_biz_id+conversation_id → heartbeat 返回 block + audit instance_conflict。
- [ ] 同 account_biz_id 不同会话 → warn。
- [ ] uk_instance 不含 nullable,upsert 幂等可靠。

---

## 天亮交付(给 Chase 一次性审)
一份总报告 `docs/reports/W20_overnight_report.md`:
- A→D 各阶段:做了什么 + 本地验收清单勾选结果 + commit 列表(w20 分支)。
- ★**完整 schema diff**(待 Chase 审,**A 单列最前**)。
- **【待 Chase 决策清单】**(歧义 / B 类口径)。
- **卡在闸门的清单**:E(清库/发版/部署)、merge/push/tag —— 全部"待 Chase 在场放行"。
- 红线复核:W17/W19 未动、无发送入口。

**不要 merge、不要 push、不要碰 E。做完停下等天亮。**

---

> ★Chase 醒来重点验:① A 的 schema diff(地基)② C4 的"全业务查询按 lifecycle 过滤"是否漏改(漏一个 → pending/disabled 数据可能串到不该看的人)。
