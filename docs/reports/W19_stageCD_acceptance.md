# W19 阶段C + D 验收报告 — admin 租户管理 + mychat 首页

> 版本: v1.0.0　日期: 2026-06-06　身份: DEV(CC1)　分支: w19-tenant-asset-model
> 依据: `docs/research/2026-06-06_W19阶段CD技术方案.md`(Chase 审过,Q1-Q4 按倾向/Q5 调整)+ W19_design v1.3 §6·§7。
> 性质: 功能开发(可逆)。按提速规则批量落地,本报告汇总验收。

## 0. 范围
C1 租户CRUD;C2 建用户两层身份(user_type/tenant_id);C3 分配客服账号;C4 平台方配置接口403;
D1 mychat首页;D2 删 Dashboard chat_rpa 死指标。**不做(留E)**:清库重采 / 隔离最终验收 / dashboardController data_scope 对齐。

## 1. 验收逐项结果(全部 PASS)

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| C1 | 租户 CRUD(平台入口) | ✅ | GET /api/tenants→200 含空月培训教育;options→200;Tenants.vue 构建通过;菜单"租户管理"入系统设置组 |
| C2 | 建用户两层身份 | ✅ | 建 external→user_type=external/tenant_id=1;建 internal→internal/tenant_id=NULL;external 缺 tenant→400;Users.vue 表单加 user_type(平台入口)/tenant_id |
| C3 | 分配客服账号 | ✅ | 列租户员工→含新建客服;分配→employee_service_account 写入(assigned_by=手工 admin);解绑→记录删除;跨租户(internal)分配→400;ServiceAccounts.vue 构建通过 |
| C4 | 平台方配置接口 403 | ✅ | 平台方 PUT /api/v1/llm-config→**403(非500)**;超管→200 不被误拦;denyInternal 覆盖 intentRules/priceTable/llmConfig 写路径 |
| D1 | mychat 首页 | ✅ | GET /api/v1/home:超管→board.level=tenant+employees;客服→level=agent;全走 scope;Home.vue(主体+看板+插件下载)+ defaultPath(tenant)→/home |
| D2 | 删 chat_rpa 死指标 | ✅ | Dashboard.vue 移除"运行质量监控"块(关键词/转人工/AI调用 + getAdminStats);保留基础平台统计;admin build 通过(1718 模块) |

- 后端 smoke 7/7 + C2/C3 集成 7/7 全过;测试数据均事务/显式清理,未污染库。
- admin `npm run build` 通过(顺修 A3 旧 bug:Users.vue `getRoles`→`getRoleList`,该错此前未 build 未暴露)。

## 2. 关键口径(对齐 Q1-Q5)
- **Q1** C3 分配入口 = admin 平台方(独立 ServiceAccounts.vue,选租户→账号→勾选员工)。租户超管自助留后续。
- **Q2** C3 独立页(非 Tenants 内嵌)。
- **Q3** D1 看板先计数(对话/线索/工单 + 超管看员工数),趋势复用 analytics。
- **Q4** menus 入项:租户管理/客服账号(平台,系统设置组)+ 首页(/home,授 tenant_admin+agent)。
- **Q5(调整)** D2 **只删前端死指标块**(纯前端可逆);**dashboardController 的 data_scope/req.user.id 对齐留阶段E**——它是阶段A 特意没动 data_scope 的同一处(data_scope 还被 dashboard/plugin/logs 活用,动它可能跨租户泄漏),留 E 清库收口时统一处理+验证。

## 3. 权限/入口
- 平台方(is_super)自动放行所有接口;租户管理/客服账号挂 tenant:* / service-account:* 权限点(平台方 is_super 见)。
- `/tenants`·`/service-accounts` 入 PLATFORM_ROUTES(仅 admin 入口);`/home` 入 TENANT_ROUTES(mychat 入口),授 tenant_admin+agent。
- C4:平台方写租户配置 403(不再 NULL 入库 500)。

## 4. 顺延阶段E(C/D 不做)
- **真机/浏览器验证**:3 个新页(租户管理/客服账号/mychat首页)的实际交互、菜单显隐、企业级vs员工级看板按角色区分——清库重采有真实数据后端到端验。
- **清库重采 + 隔离最终验收**(不可逆,Chase 拍板)。
- **dashboardController data_scope 对齐**(Q5,留 E 与隔离收口统一处理 + 验证)。

## 5. 阶段C+D 提交
- `635d820` 后端:租户/客服账号 CRUD + 建用户两层身份 + 配置接口403 + mychat首页 API + menus seed
- `496e369` 前端:Tenants/ServiceAccounts/Home.vue + Users 两层身份 + Dashboard 删死指标 + router/entry

**阶段C+D 代码闭环、smoke/集成全过、admin 构建通过。**

## 6. 验收反馈整改(Chase 第一轮验收后,commit 9a33465)

**反馈1 建用户按端固定身份(不再让用户选 user_type)**:
- admin 入口:固定建 internal,**角色仅平台角色**(platform_admin),无类型选择框。
- mychat 入口:固定建 external(本租户),**角色仅租户角色**(tenant_admin/agent),不能选平台角色。
- 后端 `userController.create` 按**创建者身份**派生身份(不信 body 越权):平台方→internal(或显式 bootstrap 建租户管理员)/ 租户超管→强制 external+本租户;+ 角色层级校验。
- 租户超管管本租户成员:list/update/remove 按 tenant_id 隔离;授 user:* 权限;`/users` 改共享(admin 管内部、mychat 管本租户)。
- **bootstrap**:Tenants.vue 加「建管理员」(平台方为新租户建第一个租户超管)——补 admin Users 不再建 external 后的缺口,合 design §6。

**反馈2 客服账号分配归租户方**:
- 菜单 `/service-accounts` 从平台移到客服管理组(kefu:group),授 tenant_admin;`/service-accounts` 入 TENANT_ROUTES。
- 后端 list/employees/assign 对 external **强制本租户**(不能看/分配其他租户账号);ServiceAccounts.vue 去租户选择框。

整改 smoke 全过:按端固定 / 角色层级拒越权 / 越权 body 被忽略 / 本租户隔离 / 平台方看全部;admin build 通过。

**待 Chase 复验 → 阶段E(清库重采+发版 v0.5.0,单独出方案+发版前 codex review)。**
