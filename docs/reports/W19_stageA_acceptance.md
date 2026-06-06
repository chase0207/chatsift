# W19 阶段A 验收报告 — 租户资产模型(地基)

> 版本: v1.0.0　日期: 2026-06-06　身份: DEV(CC1)　分支: main(阶段A 逐步提交)
> 依据: `docs/research/2026-06-05_W19阶段A技术方案.md`(已审)+ W19_design v1.2.0。性质: C 类(schema/RBAC/契约)。
> 结论待 Chase 确认 = 阶段A 闭环 = 可进阶段B。

## 0. 范围
**只覆盖阶段A 地基**:三新表 + 加字段 + 角色清洗(两层模型)+ tenantId→scope helper。
采集侧(账号识别 / conversation_id / employee_service_account 自动归属)= **阶段B**;
admin 租户管理页 = 阶段C;mychat 首页 = 阶段D;清库重采 + 发版 = **阶段E**(不可逆,Chase 拍板)。

## 1. 验收逐项结果(全部 PASS)

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| 1 | A1 三表建成(tenants/service_accounts/employee_service_account) | ✅ | 本地库已建;唯一键 `uk_account(tenant,platform,page,biz,nick)`、`uk_assign(employee,sa)`;FK 全约束 |
| 2 | A2 加字段(users.tenant_id + 5 业务表 service_account_id) | ✅ | 都 nullable 先行;`idx_sa(tenant_id, service_account_id)`;FK 指向 service_accounts |
| 3 | A3 角色清洗为**两层模型** | ✅ | user_type(internal/external 系统级)+ role(平台管理员/租户超级管理员/客服 租户级);"内部用户"不再是 role |
| 4 | A3 种子租户 + 用户映射 | ✅ | tenant#1 空月培训教育;admin=internal/NULL、18651359635=external/超管、tenant=external/客服(见 §3) |
| 5 | A3 客服权限=mychat 业务页只读 | ✅ | role_has_permissions:客服=会话/线索/工单/分析/聚合(无 settings) |
| 6 | A4 ★三类角色数据隔离(scope helper) | ✅ | **7/7 断言通过**(见 §4)+ HTTP 全链路 smoke(见 §5) |
| 7 | A4 登录/鉴权带新字段、旧 token 兼容补全 | ✅ | payload+userInfo 带 role_name/user_type/tenant_id;auth.js 旧 token 从 DB 补全(§5 精简 token 验证) |
| 8 | RBAC 第一步:只读 role_id、保留 users.role 不删 | ✅ | 代码判角色全走 role_id/user_type/role_name;users.role(1/9)保留未用(物理删留第二步) |

## 2. A4 设计要点(实现细节,A 类)

**两类隔离路径**(不是 31 处都套同一个 helper —— 见下方理由):

1. **scope() helper(多行业务数据隔离)** — conversations / leads / workorders / analytics(有 `service_account_id` 维度)。
   `scope(req, {tenantCol, saCol?}) → {sql, params}`,拼到 WHERE 之后:
   - internal(平台方): 默认 `AND 1=0`(不看业务数据);显式带 `tenant_id`(query/body)→ `AND <tenantCol>=?`
   - external 租户超管: `AND <tenantCol>=?`(本租户全部,不受账号分配限制)
   - external 客服: `AND <tenantCol>=? AND <saCol> IN (分配集)`;无分配 → `AND 1=0`
   - 客服分配集 = `employee_service_account` 查 employee_id;**单请求内 memoize**(detail 多查询只打一次库)

2. **tenantId(req) 重定义 = `req.user.tenant_id`(自有租户写入/配置)** — intentRules / priceTable / llmConfig / events。
   这 4 个 controller **零代码改动**,`_shared` 重定义后自动生效。理由:
   - INSERT 是给新行戳 owner(写自己租户的值),不是过滤别人数据 → 不能套 scope(返回的是 WHERE 片段)
   - 配置表(intent_rules/price_table/tenant_llm_config)无 `service_account_id` 维度,且**客服无 settings 权限进不来**
   - intent_rules list 用 `tenant_id IN (0, ?)`(全局规则 + 本租户)的语义,套通用 helper 会丢全局规则
   - 隔离仍成立:internal tenant_id=NULL → `WHERE tenant_id=NULL` 零行(看不到);租户用户 → 本租户

**"客服 vs 租户超管"判据 = `role_name==='客服'`**:两者 is_super 都=0、data_scope 都='self',
JWT payload 加 `role_name`(auth.js 补全)。**没有改 data_scope** —— 因为 data_scope 仍被遗留接口
(dashboardController/pluginController/logsController 经 utils/data-scope.js)活用,改 '超管→all' 会在那些
接口造成跨租户泄漏。

## 3. 用户两层映射(本地库实测)

| username | user_type | tenant_id | role_id | role_name | 入口/视野 |
|---|---|---|---|---|---|
| admin | internal | NULL | 1 | 平台管理员 | 平台方,默认不看业务数据 |
| 18651359635 | external | 1 | 2 | 租户超级管理员 | 本租户(空月)全部业务数据 |
| tenant | external | 1 | 3 | 客服 | 本租户 + 仅分配到的客服账号 |

## 4. ★三类角色数据隔离断言(7/7 PASS)

驱动 `scope()` 真实输出(含真查 employee_service_account),断言生成的 `{sql, params}`:

```
[内部用户 internal]
  ✓ 默认不看业务数据            scope → " AND 1=0", []
  ✓ 显式带 tenant_id=7 才查该租户  scope → " AND c.tenant_id = ?", [7]
[租户超级管理员]
  ✓ 本租户全部                  scope → " AND c.tenant_id = ?", [1]
[客服]
  ✓ 无分配 → 看不到            scope → " AND 1=0", []
  ✓ 配置表(无 saCol)→ 仅按租户   scope → " AND tenant_id = ?", [1]
  ✓ 有分配(fixture)→ 账号过滤    scope → " AND c.tenant_id = ? AND c.service_account_id IN (?)", [1, saId]
  ✓ 清理 fixture 后回到无分配     scope → " AND 1=0", []
=== 7 通过 / 0 失败 ===
```

> 客服"有分配"分支用真实 service_account + employee_service_account fixture 验证,跑完即删,不污染库。
> 复跑见 git 历史本轮 commit 的内联 node 脚本(server/src/controllers/v1/_shared.js 的 scope/assignedAccountIds)。

## 5. HTTP 全链路 smoke(精简 token,验证 auth 补全 + scope 串联)

用 JWT_SECRET 签发只含 `{id}` 的精简 token(逼 auth.js 走旧 token 补全路径):

```
GET /api/v1/conversations
  admin(internal)        HTTP 200, total=0   ← 默认不看
  租户超管(tenant1)      HTTP 200, total=0   ← 本租户(空月 tenant_id=1 暂无会话)
  客服(tenant1,无分配)   HTTP 200, total=0   ← 无分配看不到
GET /api/v1/conversations?tenant_id=2  (admin internal 显式选租户)
  admin + tenant_id=2    HTTP 200, total=1   ← 查到 tenant_id=2 的 stale 会话(正向断言)✓
```

证明:精简 token → auth.js 从 DB 补全 user_type/tenant_id/role_name → scope() 生效;
internal 显式选租户分支真实可查;无 500、无回归。

## 6. 已知边界 / 顺延项

- **客服账号数据看不到(预期)**:阶段A 业务行 `service_account_id` 全 NULL(归属由阶段B 采集填),
  且无 employee_service_account 分配 → 客服当前看 0 条。**客服视野的完整验证须等阶段B**(断言已证逻辑正确)。
- **本地库 stale 数据**:仅 1 条会话 tenant_id=2(旧模型 `tenant_id=req.user.id` 残留,非真租户)、0 leads/工单。
  阶段E 清库重采清除,阶段A 不迁移既有业务数据归属。
- **Users.vue 创建用户表单**:现已选 role_id(修了旧 `role`(1/9) 与 controller `role_id` 不一致的 bug);
  但**创建时的 user_type/tenant_id 指派**(建 internal 还是 external、归哪租户)= **阶段C**(admin 租户管理)。
  阶段A 现有 3 用户已映射好,不影响登录/隔离验证。
- **M24(position-tracker 存储键隔离)**:依赖阶段B 的客服账号稳定 ID,见 W17 验收 §2-B。

## 7. 阶段A 提交(本地库已 apply,未发版)

- `559108b` A3 角色清洗(两层模型)+ 种子租户 + 用户映射 + role===9→role_id
- `d55500b` A1+A2 schema(三表 + 加字段)+ compose 挂载(2→3)+ dev 副本
- 本轮 A4 commit:scope helper + 31 处 tenantId 收口 + role_name 入 JWT(见 git)

**阶段A 全部 PASS。待 Chase 确认验收 → 进阶段B(采集账号识别 + 归属)。**
