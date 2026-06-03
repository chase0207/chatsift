---
文档: W16 阶段一调研 — 权限模型 + 前端结构(为"平台/租户双入口拆分"铺路)
版本: v1.0.0
状态: 调研完成,待拆分方案
日期: 2026-06-03
方法: 只读 server 鉴权/控制器/schema + admin 路由/页面,不改任何权限/UI/查询
---

## 变更日志

| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.0.0 | 2026-06-03 | 初版:Dx1-5,重点 Dx2 越权逐接口核查 |

---

## 0. 一句话结论

业务数据查询**已按 `tenant_id`(=登录账号 id) 隔离**(每个接口 auth + 权限点 + `WHERE tenant_id=?`),**不存在"任何登录用户都能查全部"的越权**。

但系统**当前只有 admin 一个账号**(`id=1`,超管):插件只能用它上报 → 数据全部 `tenant_id=1`;admin 后台登录又查 `tenant_id=1` → **admin 现在就是唯一数据 owner、看得到全部业务数据**。这不是越权 bug,是"**单账号身兼平台超管 + 租户数据 owner**"的现状。

→ 域名拆分前**不需要补后端数据过滤**(已有);需要的是 **① 建独立租户账号 ② 把现有 `tenant_id=1` 数据归属迁过去 ③ admin 入口隐藏业务页 ④(可选)接入 data_scope**。

---

## Dx1. 现有权限模型(role / tenant 字段)

**表结构**(`server/sql/00_reused_tables.sql`):
- `roles`:`is_super TINYINT`(1=超管全权)、`data_scope ENUM('self','dept','all') DEFAULT 'self'`、name、status。
- `users`:`role`(旧数字字段,admin=9)+ `role_id`(关联 roles)—— **两套角色字段并存(冗余)**。
- `role_has_permissions`:`role_id ↔ menu_id`(权限点 = 菜单的 `permission_code`)。
- `menus`:`permission_code`(如 `conversation:list`)。

**seed**(`:103-108`):
- roles:`(1,超级管理员,is_super=1,data_scope='all')`、`(2,普通用户,is_super=0,data_scope='self')`。
- users:**仅一个** `(1, 'admin', role=9, role_id=1)`。★ 全系统就这一个账号。

**鉴权链**:
- `middleware/auth.js`:无 `Bearer` → 401;`jwt.verify` → `req.user=decoded`;若缺 `is_super/data_scope` 从 DB 补(`:16-25`)。
- `middleware/permission.js`:`perm(code)` → **超管直接放行**(`:18`);否则看 `req.user.permissions`(来自 JWT)含 code 才放行,否则 403。

**关键事实**:
- **`data_scope` 字段存在但完全未接入** —— permission.js 不读它,业务 controllers 也不读;数据范围只由 `tenant_id=req.user.id` 决定。
- 普通用户的权限点依赖 **JWT 里的 `permissions`**,而 auth.js **只补 is_super/data_scope、不补 permissions** —— 多账号启用时,普通用户 token 若不带 permissions 会全部 403(当前单超管不触发)。

---

## Dx2. ★业务数据查询是否按登录身份过滤(越权核查)

逐接口给鉴权 + 权限点 + 数据 WHERE(`tenant = req.user.id`,见 `_shared.js:tenantId`):

| 接口 | 文件:行 | 鉴权 | 权限点 | 数据 WHERE | 判定 |
|---|---|---|---|---|---|
| events/batch(采集**写入**) | `eventsController.js:9,31,42,77,97,113` | auth | — | 全部 `INSERT ... tenant_id = req.user.id` | 写入归属登录账号 |
| conversations.list | `conversationsController.js:9` | auth | `conversation:list` | `WHERE c.tenant_id=?` | 隔离 |
| conversations.detail | `:98` | auth | `conversation:list` | `WHERE c.tenant_id=? AND c.id=?` | 隔离 |
| conversations.messages | `:127,135` | auth | `conversation:list` | `WHERE tenant_id=? AND conversation_id=?` | 隔离 |
| conversations.facets | `:166,170,176` | auth | `conversation:list` | `WHERE tenant_id=?` | 隔离 |
| leads.list/detail/recent/update/convert | `leadsController.js:10,66,118,221,236` | auth | `lead:*` | `WHERE l.tenant_id=?`(写操作 `tenant_id=? AND id=?`) | 隔离 |
| workorders.list/detail/update/assign | `workordersController.js:8,50,84,101` | auth | `workorder:*` | `WHERE tenant_id=?`(写操作 `AND id=?`) | 隔离 |
| analytics.funnel/by-page/intent/lead-level/trend | `analyticsController.js:13,31` | auth | `conversation:list` | `buildConversationScope/buildLeadScope` 均 `WHERE tenant_id=?` | 隔离 |

**总判定:全部隔离,无"全员可见全部"。** 所有 v1 业务路由 `router.use(auth)`(无 token → 401),数据查询一律 `tenant_id = req.user.id`,**没有 is_super/data_scope 绕过数据 WHERE**。

**但要点 / 隐患**:
1. **隔离粒度 = 登录账号 id**,不是抽象"租户"。schema 注释明说 `user_id 即 tenant_id`。
2. **超管不绕过数据 WHERE**:permission.js 的 `is_super` 放行只针对**权限点**,controllers 里 `tenantId` 永远是 `req.user.id`。→ 超管登录也只看到 `tenant_id=自己id` 的数据。**这天然契合"admin 平台入口不看租户数据"**(前提:数据 tenant_id ≠ admin id)。
3. **当前单账号 → admin 看到全部**:因为只有 admin(id=1),数据全是 tenant_id=1,admin 自查自见。**这是现状,不是越权**。
4. **拆分前不必补过滤**(已有);真正风险是:启用多账号后,① 插件上报账号必须 = 期望的租户账号(否则数据 tenant_id 与登录账号对不上、看不到);② data_scope 没接入,平台超管无法"代入"查某租户(见 Dx4)。

---

## Dx3. 前端页面:平台页 vs 业务页

路由 `admin/src/router/index.js` + 菜单 `menus` seed,可清晰二分:

**平台/系统页(超管管,拆分后留 admin.kongyuekeji.com)**:
| 页面 | 路由 | 权限点 |
|---|---|---|
| 控制台 Dashboard | `/dashboard` | `dashboard` |
| 用户管理 | `/users` | `user:list` |
| 插件授权 | `/plugins` | `plugin:list` |
| 平台管理 | `/platforms` | `platform:list` |
| 角色/菜单 | `/roles` `/menus` | — |
| 日志中心 | `/logs` | `log:list` |

**租户/业务页(员工管,拆分后去 mychat.kongyuekeji.com)**:
| 页面 | 路由 | 主体 |
|---|---|---|
| 会话中心 + 详情 | `/conversations(/:id)` | 会话 |
| 线索中心 + 详情 | `/leads(/:id)` | 客户/线索 |
| 工单中心 | `/workorders` | 工单 |
| 运营分析 | `/analytics` | 平台页面聚合 |
| 消息聚合 | `/aggregate` | 会话/消息 |
| LLM 配置 | `/settings/llm` | 租户(tenant_llm_config) |

- 侧边栏菜单**从 server `menuTree` 拉**(`MainLayout.vue:140`,复用 chat_rpa `menus`+`role_has_permissions`),即"谁看哪些页"已由 DB 角色权限点驱动 → 拆分可借此控制。
- **注意(承接 W15)**:控制台 `Dashboard.vue` 当前是 chat_rpa 残留(用户/插件/设备/转人工/关键词),属"平台页"但内容过时;LLM 配置在系统设置下,但 LLM key 是**按租户**存(`tenant_llm_config`),归属上更偏"租户页"。

---

## Dx4. 拆分技术可行性

**后端**:同一个 server 即可支撑双入口 —— 数据按 `tenant_id` 隔离已就绪,两个域名共用 `/api/v1`,靠**登录账号**区分平台/租户。无需改查询逻辑。

**前端**:单 Vite SPA,菜单 DB 驱动。两条路线:
- (a) **同一份前端**,按登录账号 role/permission 过滤菜单(超管见系统页、租户见业务页),两域名指向同构建;
- (b) **两套构建**分别部署到两个域名,各自只打包对应页面。
- (a) 改动小、与现有 menuTree 机制一致,推荐起步。

**拆分必须做的动作(按依赖排序)**:
1. **建租户账号**(role_id=2 普通用户,或新建"员工"角色)。
2. **数据归属迁移**:把现有 `tenant_id=1`(admin) 的 conversations/messages/leads/workorders/analysis_jobs 改成新租户 id —— ★ 数据安全操作,先备份。
3. **插件上报改用租户账号 token**(否则新数据仍写 tenant_id=1)。
4. **admin 入口隐藏业务页**:从超管角色去掉业务菜单权限点,或前端按域名隐藏 `/conversations` 等;数据迁走后 admin 登录(tenant_id=1)业务接口也将查不到。
5. **(可选) data_scope 接入**:若平台超管需"代入"查某租户做运维,需让 controllers 支持 `is_super + 指定 tenant` 查询(当前完全不支持跨 tenant 查)。

**风险**:① 第 2 步是数据归属变更,误迁会让租户看不到历史;② 第 3 步漏改会导致拆分后新采数据又落回 admin;③ 普通用户 permissions 未由 auth 从 DB 补(Dx1),多账号前要补齐,否则租户员工进业务页被 403。

---

## Dx5. tenant 字段预留现状

`server/sql/v1-schema.sql`:
- **所有业务表 `tenant_id INT UNSIGNED NOT NULL`** + 复合索引/唯一键以 tenant_id 打头:
  - conversations(`uk(tenant_id,platform,platform_conversation_id)` + idx_tenant_intent/stage/lastmsg/uid)
  - messages(`uk(tenant_id,platform_message_id)`)
  - leads / workorders(idx_tenant_status/level/type)
  - price_table(idx_tenant_city)
- `tenant_llm_config.tenant_id PRIMARY KEY`(注释 `=users.id`)。
- `intent_rules.tenant_id DEFAULT 0`(注释 `0=全局规则,>0=企业自定义`)—— 唯一允许 0 的表(全局意图规则种子 tenant_id=0)。
- schema 头注释:`单级租户 (user_id 即 tenant_id)`。

**结论**:数据层**多租户隔离地基完整**(NOT NULL + tenant 打头索引 + 唯一键含 tenant),写入/查询路径都带 tenant_id。**缺的只是**:多个真实账号、数据归属、入口拆分、data_scope 接入。多租户演变时**数据层基本不用动**。

---

## 关键发现汇总

1. **无越权**:会话/线索/工单/分析全部 `WHERE tenant_id=req.user.id` + auth + 权限点。拆分前**不需补数据过滤**。
2. **真问题是单账号**:仅 admin(id=1),身兼平台超管 + 唯一数据 owner,故"现在 admin 看得到全部"。
3. **超管不跨 tenant 查**:这反而让"admin 入口不看租户数据"几乎免费成立(数据迁走后 admin 自然查不到);但也意味着平台运维无法代入查租户(需 data_scope 才行)。
4. **data_scope 预留未接入**;**users 双角色字段冗余**;**auth 不补 permissions**(多账号前要处理)。
5. **数据层多租户地基已就绪**(Dx5)。

## 待 Chase 拍板(回报后停下,不自行改权限/UI/查询)

1. **默认租户账号**:新建一个"员工/租户"账号(role_id=2),还是另设角色?平台超管 admin 与它彻底分开?
2. **现有数据**:`tenant_id=1` 的历史数据,迁给新租户账号 还是 清空重采?(迁移要先备份)
3. **入口隔离方式**:靠"角色去业务权限点 + 菜单 DB 控制",还是"两套前端构建按域名分"?
4. **平台超管要不要能查租户数据**(运维/排障)?要的话需接入 data_scope / 跨 tenant 查询;不要则维持现状最简。
5. **插件上报账号**:拆分后插件用哪个账号的 token 上报(决定新数据落到哪个 tenant)?
