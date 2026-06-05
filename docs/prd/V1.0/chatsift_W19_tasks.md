---
文档: W19 实施任务清单 — 租户资产模型
版本: v1.2.0
周次: W19(发版 v0.5.0,与 W17 阶段一一起发)
落位: docs/prd/
状态: Active
---

## 变更日志
| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.2.0 | 2026-06-05 | 吸收codex:唯一键加page_id/messages+jobs加sa_id/缺account_biz_id拒绝/自动绑限角色/batch粒度upsert/RBAC分两步/清库含插件本地状态 |
| v1.1.0 | 2026-06-05 | 引入方案层(AGENTS §4):阶段A、B3(conversation_id)先出技术方案审了再写 |
| v1.0.0 | 2026-06-05 | 初版:5 阶段拆分(数据模型/采集/admin/mychat/隔离收口+清库发版) |

---

# W19 实施任务清单(给 DEV = CC1)

> **先读**:W19_design.md(v1.1.0);AGENTS.md(§3 变更分类、§4 单 agent 单分支、编号约定);docs/ops/prod-safety.md;tech-debt-master-plan(M16/M21/M24)。
> **性质**:C 类(动租户实体 + RBAC + 数据归属 + conversation_id),最敏感。**分 5 阶段,每阶段独立验收**,不一口气做完。
> **地基决策**:客服账号 = `account_biz_id`(URL accountId,商家账号稳定键)+ `account_nickname`(坐席,人工校正)。内部用户在平台层 tenant_id=NULL。
> **数据策略**:W17阶段一 + W19 一起清一次库重采、一起发版 v0.5.0(见阶段E)。

---

## 开工前置(AGENTS §1/§4)
- 从干净 main(6230668,含 W17 阶段一)切 `w19-tenant-asset-model` 分支,单 agent 全程。
- 声明身份 DEV、环境(本地);git status 干净。
- 开发期不发版/不打 tag;不碰生产;清库重采留到阶段E。
- ★W19 改 messages/conversation_id,W17 已合并 main、W17 阶段二排在 W19 之后 → 现在 W19 独占,不冲突。

---

## 阶段 A — 数据模型 + 角色清洗(地基,先做扎实)

> 【★C 类:本阶段所有 schema/角色变更,改前列 diff 报 Chase 确认再动】
> 【★先出技术方案再写代码(AGENTS §4)】阶段A 是地基,动手前先出技术方案 + 执行计划,报 Chase + Claude 审、确认后再写代码:
> - 三张表精确 DDL(字段类型/约束/索引/外键,对照真实 schema)
> - users/业务表加字段的 ALTER 具体写法
> - 角色清洗具体:roles 表数据怎么改、role_id 统一要改哪些代码点(查出全部)、Dashboard role===9 怎么修
> - ★tenantId(req) 单点改造:列出它的**全部调用点**(查真实代码)+ 内部用户 NULL 分支怎么处理
> - migration SQL + compose init 挂载怎么同步
> 方案落 docs/research/ 或 docs/prd/,审了再进 A1-A4。

### A1 新建三张表(schema diff 先确认)
- `tenants`(企业主体:name/contact/status/expire_at/remark)
- `service_accounts`(资产原点:tenant_id/platform_id/page_id/account_biz_id/account_nickname/status/...;唯一键 uk_account(tenant_id,platform_id,account_biz_id,account_nickname))
- `employee_service_account`(员工↔账号多对多:tenant_id/employee_id/service_account_id/assigned_by/assigned_at;唯一键 uk_assign(employee_id,service_account_id))

### A2 现有表加字段
- users 加 `tenant_id`(FK tenants,NULL;内部用户=NULL/租户员工=租户id)
- conversations/leads/workorders 加 `service_account_id`(FK,NULL;采集时归属)+ 索引 (tenant_id, service_account_id)

### A3 角色清洗 + 统一 role/role_id(解决 M16)
- roles 扩为三类:内部用户(is_super=1)/ 租户管理员(is_super=0)/ 客服(is_super=0)
- ★分两步(codex #8):W19 先做到代码只读 role_id、users.role 保留不用;稳定一版后再物理删字段(不一上来删)
- 修 Dashboard.vue:137 的 role===9
- 配 role_has_permissions(各角色权限点)

### A4 tenantId(req) 单点改造
- `_shared.js`:`req.user.id` → `req.user.tenant_id`
- ★内部用户 tenant_id=NULL 特殊处理:内部用户不按租户过滤业务数据(别让其误查/查空)
- 登录 payload 带 tenant_id;auth 中间件补全旧 token 的 tenant_id(照现有 is_super/permissions 补全范式)

### A 验收(报 Chase)
- 三表建好、字段/索引正确;migration SQL 只增不改、同步 prod/test compose init 挂载
- 角色清洗后登录/鉴权正常(内部用户、租户管理员、客服各登录验证)
- role_id 统一、Dashboard role===9 已修
- tenantId(req) 改 tenant_id 后,业务查询隔离正确(内部用户 NULL 分支不查空/不越权)

---

## 阶段 B — 采集侧账号识别 + 自动归属(与 W17 采集层协调)

> 【★B3 conversation_id 改造 = 重改动,先出技术方案审了再写(AGENTS §4)】:
> conversation_id 新合成方式、受影响的采集/入库/查询点、与 W17 message_id/position 怎么共存、清库影响——先写方案审,再改。
> B1/B2/B4 属常规实现,可直接做、验收说明。

### B1 插件抓 account_biz_id + 昵称,独立上报
- 从 URL(location.href)抓 `accountId`(=account_biz_id);从 DOM 抓登录坐席昵称(accountNickname,已有)
- event 新增字段:account_biz_id、account_nickname(独立维度,不再只混 sender_nickname)

### B2 server upsert service_account + 挂归属
- batch 入库:按 (tenant_id,platform_id,page_id,account_biz_id,account_nickname) upsert service_accounts,拿 service_account_id
- ★按 batch/conversation 粒度 upsert(codex),不逐条消息做(避免高频写+并发重复)
- conversation/lead/workorder/messages/analysis_jobs 写入带 service_account_id
- ★缺 account_biz_id 的事件:拒绝 + 返回明确错误,不兜底 unknown(codex #5);插件最低版本提示
- 默认谁采集归谁(codex #6):★只对"客服角色"自动建 employee_service_account;租户管理员默认看全租户、不自动绑;自动绑定标 assigned_by 来源,可人工调整

### B3 conversation_id 纳入 account_biz_id(解决跨账号误并)
- 现:douyin_+pageKey+hash(pageKey|客户昵称)
- 改:douyin_+pageKey+account_biz_id+hash(...|客户昵称)
- ★坐席不进 conversation_id(换坐席不分裂同客户会话);坐席体现在 service_account_id 字段
- ★与 W17 协调:这是改会话标识 = 需清库重采(留阶段E一起清)

### B4 解决 M24(position-tracker 存储键隔离)
- position-tracker 的 chrome.storage key 加 tenant/account_biz_id 隔离(用 B 阶段定的账号标识)
- 换账号不再串号(消除调研时 conv#4 残片问题)

### B 验收(报 Chase)
- 插件抓到 account_biz_id + 昵称并上报;server upsert service_account 正确
- 对话/线索/工单挂到正确 service_account_id;自动归属建立
- conversation_id 含 account_biz_id;跨账号同名客户不再误并
- M24:换账号 storage 不串号

---

## 阶段 C — admin 新增"租户管理"

### C1 租户管理页(admin 平台入口)
- 与"用户管理/平台管理"平级;内部用户手工录入/编辑租户主体(企业名/联系人/状态/到期),无需接口认证
- 创建租户后可在该租户下建/分配租户管理员账号(users.tenant_id 指向该租户)

### C 验收
- 内部用户能录入/编辑租户;能为租户建管理员账号;权限正确(只有内部用户可访问)

---

## 阶段 D — mychat 首页(= W15 控制台重做,解决 M21)

### D1 mychat 专属首页
- 新增 mychat 首页路由,改 entry.js/defaultPath(mychat 默认进首页而非 /conversations)
- 三块:① 主体信息(读 tenants)② 插件下载(复用 getPluginUpdate/downloadPluginZip)③ 看板
  - 企业级(租户管理员看):企业名 + 员工数
  - 员工级(客服看):资产数据按登录员工分到的客服账号(对话/线索/工单数)
- ★移除旧 Dashboard 的 chat_rpa 死指标(关键词命中/转人工/AI调用等)

### D 验收
- mychat 默认进首页;主体信息/插件下载/看板正确;企业级vs员工级按角色区分;死指标已清

---

## 阶段 E — 数据隔离收口 + 清库重采发版(★含不可逆操作)

### E1 数据隔离收口
- 客服(普通员工):tenant_id 过滤 + 按 employee_service_account 分到的 service_account_id 集合过滤
- 租户管理员:看本租户全部(tenant_id 过滤,不限 service_account)
- 内部用户:平台层,不按租户过滤业务数据

### E2 ★清库重采(不可逆,先备份,Chase 在场 apply)
- 走 prod-safety §4 三问 + 先备份(离机+验证可解压)
- 清范围:业务数据(messages/conversations/leads/workorders/analysis_jobs/service_accounts/employee_service_account);保留 RBAC/登录/平台字典/插件授权/tenants
- ★清库也清插件本地状态(codex #7):重载插件、清 position-tracker storage(w17_pos_*)、清 EventQueue/seen cache。否则 DB 新数据 + 插件旧位置编号/旧队列会乱
- ★这次重采同时生效 W17阶段一(position)+ W19(account_biz_id/conversation_id/service_account)——只清一次
- ★清空脚本准备好后停下,Chase 确认"go"才 apply(不可逆硬关卡)

### E3 ★发版 v0.5.0(QA 身份,走 docs/ops/release.md)
- W17阶段一 + W19 一起发;VERSION 0.3.1 → 0.5.0(W19 大功能 minor);sync-version + check-version
- CHANGELOG 加 v0.5.0(变更+复盘);PROJECT_STATUS 发版记录
- 红线卡点;test 先验;生产部署(执行 deploy/w17_message_position.sql + W19 的 migration);★同步生产 VERSION
- 发版/部署是不可逆,Chase/QA 在场

### E 验收
- 三类角色数据范围正确;清库重采后数据干净(W17+W19 都生效);v0.5.0 发版生产、版本同步、健康检查 200

---

## 完成标准(每阶段写 docs/reports/W19_stageX_acceptance.md)
- A 数据模型+角色清洗 ✓
- B 采集账号识别+归属+conversation_id+M24 ✓
- C admin 租户管理 ✓
- D mychat 首页 ✓
- E 隔离收口 + 清库重采 + v0.5.0 发版 ✓
- 关联技术债关闭:M16(role双轨)/M21(W15 UI)/M24(storage隔离)

---

## 重要提示
- **C 类最敏感**:每阶段 schema/RBAC/契约改前列 diff 报 Chase
- **分阶段验收**:A 是地基,先做扎实验收通过再往下;不一口气做完
- **不可逆硬关卡**:阶段E 清库、发版,Chase 在场"go"才执行(约束条件:可逆放权/不可逆人在场)
- **与 W17 协调**:conversation_id 改造 + 清库,和 W17 阶段一一起在阶段E生效(只清一次库);坐席不进 conversation_id;W17 阶段二段标识口径待与此对齐
- **单 agent 单分支**:w19 分支只你(CC1)写
- **每阶段做完报 Chase**,尤其 schema 变更和清库/发版前后
