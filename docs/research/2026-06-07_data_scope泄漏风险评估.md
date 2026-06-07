# data_scope 跨租户泄漏风险评估（还债·第一项·调研)

> 日期: 2026-06-07　身份: DEV(CC1)　性质: 调研(不改代码)　状态: 待 Chase + Claude 审
> 缘起: 阶段A 特意没动 data_scope(怕动了 plugin/logs 跨租户泄漏);E1 只改了 dashboardController 自身。本文评估 data_scope 现状,定"该不该清、怎么清"。

## 0. 结论(先说)
**当前 data_scope 的全部存活用法 = 用户级所有者授权(plugin/logs 按 `user_id=自己` 过滤),不是租户业务隔离。** 唯一一处把 data_scope 当租户用的 dashboardController 已在 E1 移除。**→ 当前无跨租户泄漏点;data_scope 无需为"租户安全"再清理;且不建议删它(删了会破坏平台方"看全部 plugin/logs")。** 建议:维持现状 + 文档定性为"用户级授权维度",技术债清理周只做"文档/命名澄清"(可选),不动逻辑。

## 1. utils/data-scope.js 调用点(全列)
`applyDataScope(req, {ownerColumn='user_id', alias})` → `data_scope==='all' ? {sql:''} : {sql:' AND <alias>.user_id = ?', params:[req.user.id]}`。即:**all=不过滤、self=只看 `user_id=当前用户` 的行**。
| 文件 | 行 | 用法 | 表/owner |
|---|---|---|---|
| pluginController | 11/59/93 | list/update/其它 | `plugins.user_id`(p 别名) |
| logsController | 16/58/128 | 日志查询 | `p.user_id` |
| dashboardController | — | **E1 已移除**(原把 data_scope 当 tenant) | — |

data_scope 另在:roleController(create/update 写 roles.data_scope)、authController/auth.js(读入 JWT)、admin Roles.vue(角色配置 UI 显示/编辑 all/dept/self)。

## 2. 每个调用点实际作用 + 是否租户相关
- **plugins 表结构**:`id, user_id, plugin_key, platform, status, expire_at, max_online, created_at`——**无 tenant_id**。plugin 是"某用户授权的插件/设备",owner = user_id。applyDataScope 按 `user_id=自己` 过滤 = **行级所有者授权**(self 看自己授权的、all 看全部)。**与租户无关**(表里根本没 tenant 维度)。pluginController:63 注释亦写明"行级鉴权:data_scope=self 只能改自己的"。
- **logs**:同样按 `p.user_id` 过滤(用户自己的日志/活动),用户级。
- **结论**:plugin/logs 的 data_scope = 用户级所有者授权,**没有租户隔离语义、也没有 tenant 维度可泄漏**。

## 3. 用户级授权(不该动) vs 租户业务隔离(该对齐 user_type)
| 用法 | 分类 | 处置 |
|---|---|---|
| plugin/logs applyDataScope(user_id) | **用户级授权** | ★不该动(改了会破坏 self/all 语义) |
| dashboardController(原 data_scope 当 tenant) | 曾是租户混用 | **E1 已移除**(改平台级计数) |
| roles.data_scope 列 + Roles.vue + JWT | 角色配置维度(喂上面的用户级授权) | 保留(支撑用户级授权) |

→ **没有"剩余的租户业务隔离"还挂在 data_scope 上**(租户隔离已全归 scope helper:user_type+role_code+tenant_id)。该对齐 user_type 的只有 dashboardController,已对齐。

## 4. 若改动 data_scope 的影响 + 风险
- **现状各角色 data_scope**:platform_admin=all、tenant_admin=self、agent=self。
  - plugin/logs:platform_admin(all)看全部授权/日志(平台运维需要);tenant_admin/agent(self)只看自己 user_id 的。**tenant_admin 看不到本租户其他员工的 plugin/log**——这是用户级(各看各的),非 bug。
- **风险点(为什么阶段A 绕开它)**:若为让 scope helper 工作而把 tenant_admin 的 data_scope 改成 'all' → plugin/logs 的 applyDataScope 会让 tenant_admin **看到全部(跨租户)plugin/logs** = 真泄漏。**A4 用 role_code 判超管/客服(没碰 data_scope),正是为绕开这条**——所以现状安全。
- **若删 data_scope 列/JWT**:applyDataScope 退化(`||'self'`)→ 平台方也只看自己 → 破坏平台运维"看全部"。**故不建议删。**

## 5. 建议
1. **维持现状**:data_scope 作为"用户级所有者授权维度"保留;plugin/logs 用法不动;租户隔离继续全走 scope helper。当前无跨租户泄漏点。
2. (可选·清理周)**澄清而非删除**:给 utils/data-scope.js + roles.data_scope 加注释定性"用户级(self/all),非租户隔离";Roles.vue 文案可注明。纯文档,零风险。
3. ★**红线**:任何人想让 tenant_admin/agent 的 data_scope='all'(或 dept)前,必须意识到会放大 plugin/logs 可见范围(跨租户)——data_scope 不是租户开关。

**评估结论:无需为租户安全清理 data_scope(E1 已闭合唯一隐患);维持现状。待 Chase + Claude 审定是否接受"维持现状",或要做可选的文档澄清。**
