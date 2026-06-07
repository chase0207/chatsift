---
文档: W19 设计 — 租户资产模型(正式启用租户 + 客服账号资产原点)
版本: v1.3.0
周次: W19
落位: docs/prd/
状态: Active(设计;写代码待 W17 阶段一合并 main 后)
---

## 变更日志
| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.3.0 | 2026-06-05 | ★身份改两层模型(基于业界多租户实践):user_type(系统级internal/external,解决M15)+ role(租户级,tenant-scoped)。"内部用户"由user_type表达、不再是roles角色;scope helper先type再role |
| v1.2.0 | 2026-06-05 | 吸收 codex review:唯一键加page_id/messages+analysis_jobs加service_account_id/统一scope helper/旧插件缺字段拒绝不兜底/自动绑定限角色/清库含插件本地状态/RBAC分两步/§10.5 |
| v1.1.0 | 2026-06-05 | 修正层级:内部用户在平台层(tenant_id=NULL)、不挂在某租户下,与tenants平级 |
| v1.0.0 | 2026-06-05 | 初版:基于阶段一调研 + Q1-5 拍板,出资产模型设计 |

---

# W19 设计:租户资产模型

> **解决什么**:正式启用"租户"为独立实体,建立资产层级 `租户 > 平台 > 页面 > 客服账号(原点) > 对话/线索/工单`;员工 ↔ 客服账号多对多;角色清洗;admin 租户管理 + mychat 首页。
> **地基决策(Q1,已实测拍板)**:客服账号无坐席级 URL UID(两次实测:换客户、换坐席,URL 四个 ID 都不变,只到"商家账号"层)。→ **两层标识**:商家账号用 URL 的 `accountId` 做稳定键;客服坐席用 `accountId + 坐席昵称` 标识,昵称改名靠租户管理员人工校正。
> **数据策略**:生产无真实数据,清库重建(不迁移)。
> **性质**:C 类(动租户实体 + RBAC + 数据归属 + conversation_id),最敏感。
> **时序**:写代码等 W17 阶段一合并 main 后,从带 W17 的干净 main 切 `w19-tenant-asset-model` 分支。

---

## 1. 现状回顾(调研结论,设计依据)

- "租户" = `tenant_id = req.user.id`,无独立租户表;所有业务表带 tenant_id、查询走 `tenantId(req)` 单点。
- **客服账号零实体**:只是 `messages.sender_nickname` 文本;对话/线索/工单不挂客服账号;`conversation_id = douyin_+pageKey+hash(pageKey|客户昵称)` 不含账号维度 → 跨账号误并。
- platforms / platform_pages 是全局字典、无 tenant;`conversations.platform(_page)` 是字符串不外键。
- 角色只 is_super 两档(超管/普通),缺租户内分层;role/role_id 双轨(M16);data_scope self/dept/all 不表达"按客服账号"。
- mychat 无首页(直进 /conversations);Dashboard 是 chat_rpa 残留死指标。
- 插件能抓登录客服账号名(accountNickname)+ 现可从 URL 抓 accountId(Q1 实测)。

---

## 2. 资产模型总览

> ★身份分两层(基于业界多租户实践,不可压平成单一角色体系):
> 1. **user_type(系统级)**:internal(平台方)/ external(租户方)——区分"在哪一层"。
> 2. **role(租户级,tenant-scoped)**:租户超级管理员 / 客服 / 未来自定义——区分"在租户里是什么角色",只对 external 用户有意义。
> 内部用户(平台方)由 user_type=internal 表达,**不是 roles 表里的一个租户角色**;它在平台层、与 tenants 平级。

```
chatsift 平台(平台自身)
 ├ 内部用户(平台方/运营;user_type=internal,tenant_id=NULL)
 │     管所有租户 + 平台字典 + 系统;admin 入口;不属任何租户
 │     (平台级角色可选,如"平台管理员";与租户角色不同层级)
 │
 └ tenants(租户:各企业主体,新建)
      └ 每个租户:
          ├ 租户员工(user_type=external,tenant_id=该租户)
          │   ├ 租户超级管理员(role,租户内最高:管本租户员工 + 分配客服账号;mychat)
          │   └ 客服(role,普通员工:只看分到自己的客服账号资产;mychat)
          │   └ …未来租户可自定义角色(tenant-scoped role)
          │
          └ service_accounts(客服账号 = 资产原点,新建)
               ├ 稳定键:tenant_id + platform_id + page_id + account_biz_id(=URL accountId,商家账号)
               ├ 坐席:account_nickname(坐席昵称,如"2号客服";改名靠人工校正)
               ├ 引用:platform_id / page_id(全局字典外键,Q2)
               │
               ├ employee_service_account(员工↔客服账号 多对多分配,新建,Q3)
               │   默认谁采集归谁;租户管理员可重新分配;一账号可分多人
               │
               └ 业务数据(加 service_account_id 外键):
                   conversations / leads / workorders
```

**users 身份字段语义(两层)**:
- `user_type`:internal(平台方)/ external(租户方)——系统级,判"内/外"用它,不用 tenant_id IS NULL 隐含判断。
- `tenant_id`:内部用户=NULL;租户员工=所属租户 id。
- `role_id`:租户级角色(租户超管/客服/未来自定义),只对 external 有意义。
查询隔离走 scope helper:先看 user_type(内/外),external 再看 role(见 §5.3)。

---

## 3. 数据模型设计(★C 类:最终 schema 改前列 diff 报 Chase)

### 3.1 新增表

**tenants(租户主体)**
```
id              PK
name            企业名称(主体信息,admin 手工录入)
contact         联系人 / 电话(可选)
status          enabled/disabled
expire_at       到期(可选)
remark          备注
created_at / updated_at
```

**service_accounts(客服账号 = 资产原点)**
```
id                PK
tenant_id         FK tenants(资产归属租户)
platform_id       FK platforms(全局字典,Q2)
page_id           FK platform_pages(全局字典,可空)
account_biz_id    商家账号稳定ID(= URL accountId,Q1 稳定键)
account_nickname  坐席昵称(如"空月培训教育官方号-2号客服",可改,人工校正)
status            enabled/disabled
first_seen_at     首次采集到
remark
created_at / updated_at
唯一键: uk_account (tenant_id, platform_id, page_id, account_biz_id, account_nickname)
  ↑ 坐席粒度:同商家账号(account_biz_id)下,不同坐席昵称 = 不同客服账号
  ↑ 含 page_id(codex 建议):同账号不同页面也区分
  ★为什么昵称必须在唯一键里:两次实测证明 account_biz_id 是"商家账号"级、不是坐席级
    (换客户、换坐席 URL 都不变)。坐席级无 URL UID,只能靠昵称区分。
    若唯一键去掉昵称(codex 第1条),"2号/3号客服"会被合并成一个账号、失去坐席粒度
    (而坐席粒度是"分配给不同员工"的业务前提)。→ 昵称留唯一键;改名靠人工校正(合并)。
索引: idx_tenant (tenant_id)
```

> **坐席粒度说明**:account_biz_id 是商家账号(整个店铺,稳定),account_nickname 区分坐席。
> 唯一键含 nickname → "2号客服""3号客服"是同一 account_biz_id 下的不同 service_account 行。
> 昵称改了 → 暂时被当新坐席,租户管理员在后台"合并"(把新行的数据归并到旧行 + 停用新行)。

**employee_service_account(员工 ↔ 客服账号 多对多分配,Q3)**
```
id                  PK
tenant_id           FK tenants(冗余,便于隔离查询)
employee_id         FK users(员工)
service_account_id  FK service_accounts(客服账号)
assigned_by         FK users(谁分配的:默认采集者 / 租户管理员)
assigned_at
唯一键: uk_assign (employee_id, service_account_id)
索引: idx_sa (service_account_id)  -- 反查"这账号分给了谁"
```

### 3.2 现有表改动

**users 加 user_type + tenant_id**
```
+ user_type  VARCHAR(20) NOT NULL DEFAULT 'external'  -- internal=平台方/external=租户方
+ tenant_id  FK tenants NULL
  - 内部用户(平台方):user_type=internal,tenant_id=NULL
  - 租户员工(租户超管/客服):user_type=external,tenant_id=所属租户
  ★判"内/外"用 user_type(系统级),不用 tenant_id IS NULL 隐含判断;
    租户内角色靠 role_id;两层正交,各管各的(解决 M15 user_type)
```

**conversations / leads / workorders / messages / analysis_jobs 加 service_account_id**
```
+ service_account_id  FK service_accounts NULL
  - 采集时按"当前登录客服账号"归属(见 §4)
  - 历史无(清库重建,无迁移)
索引: idx_sa (tenant_id, service_account_id)
```

**roles 扩充(角色清洗,见 §5)**

---

## 4. 采集侧:客服账号识别与自动归属

### 4.1 插件采集 account_biz_id + 昵称
- 插件从 URL 抓 `accountId`(= account_biz_id),从 DOM 抓登录坐席昵称(accountNickname,已有)。
- event 新增字段:`account_biz_id`、`account_nickname`(独立维度上报,不再只混在 sender_nickname)。

### 4.2 server 入库:upsert service_account + 挂归属
- batch 入库时:按 (tenant_id, platform_id, account_biz_id, account_nickname) upsert `service_accounts`,拿到 service_account_id。
- conversation / lead / workorder 写入时带上 service_account_id。
- **默认谁采集归谁**:首次见某 service_account 时,自动在 employee_service_account 建一条(employee_id = 当前采集上报的登录员工)。租户管理员后续可改。

### 4.3 ★conversation_id 纳入 account_biz_id(解决跨账号误并)
- 现:`douyin_+pageKey+hash(pageKey|客户昵称)` —— 不含账号,跨账号同名客户会误并。
- 改:`douyin_+pageKey+account_biz_id+hash(...|客户昵称)` —— 纳入商家账号维度。
- **★与 W17 协调**:W17 已重做 message_id(基于 position)。conversation_id 改造会改变会话标识 → 需清库重采。**建议 W19 这次清库重采时,W17 阶段一 + W19 的 conversation_id 改造一起生效**(只清一次库,见 §8)。
- 坐席维度是否进 conversation_id?**不进**——同一商家账号下不同坐席接待同一客户,业务上仍是"同一个客户会话",不该因换坐席分裂。坐席归属体现在 service_account_id 字段(可记多个坐席接待过),不进 conversation_id。

> 待与 W17 阶段二确认:阶段二云端对账的"段标识"也会用账号维度,需与此处 conversation_id 口径一致。

---

## 5. 身份清洗:user_type(系统级)+ role(租户级)(解决 M15 + M16)

> ★两层正交。user_type 判内/外(系统级);role 判租户内角色(租户级)。不压平成单一 roles 体系。

### 5.1 系统级:user_type(解决 M15)
- 加 `users.user_type`:internal(平台方)/ external(租户方)。
- 内部用户 = internal;租户员工(租户超管/客服)= external。
- 判"内/外"统一用 user_type,**不用 tenant_id IS NULL 隐含判断**。

### 5.2 租户级:roles 只装租户角色(去掉"内部用户")
| 现状 | 清洗后 | is_super | 层级 | 说明 |
|---|---|---|---|---|
| 超级管理员(role#1,is_super=1) | **平台管理员**(给 internal) | 1 | 平台级 | 平台方角色;与租户角色不同层级 |
| 普通用户(role#2,is_super=0) | **租户超级管理员** | 0 | 租户级 | 租户内最高:管本租户员工+分配账号;mychat |
| (新增 role#3) | **客服** | 0 | 租户级 | 普通员工:只看分到的客服账号资产;mychat |
| (未来) | 租户自定义角色 | 0 | 租户级 | tenant-scoped,可扩展 |

> ★"内部用户"不再是 roles 里的角色,由 user_type=internal 表达。roles 表收归"租户级 + 平台级"角色,租户角色 tenant-scoped。

### 5.3 统一 role/role_id(M16,分两步,codex 第8条)
- 第一步(W19 阶段A):代码**只读 role_id**,`users.role`(1/9)保留不用(标注弃用)。
- 第二步(稳定一版后另开):物理 DROP `users.role`。阶段A 不删。
- 修 role===9 全部代码点(Dashboard:137 / Users.vue 几处 / authController):判"内/外"用 user_type,判"租户角色"用 role_id。

### 5.4 数据隔离:统一 scope helper(codex 第3条,先 type 再 role)
- ★废弃裸 `tenantId(req)`,改统一 **scope helper**,所有业务查询走它(禁止 controller 自拼 tenant 条件):
  - **先看 user_type**:
    - internal(平台方):★默认不看业务数据(`AND 1=0`),仅显式选定目标租户时才查(防漏判断误查全部)。
    - external(租户方):进租户作用域 ↓
  - **external 再看 role**:
    - 租户超级管理员:看本租户全部(tenant_id 过滤,不限 service_account)。
    - 客服:看分配的 service_account(`tenant_id 过滤 + service_account_id IN 分配集`);无分配=看不到(安全默认,非 bug)。
- 验收加数据隔离 SQL 断言(三类各自能看/不能看)+ grep 静态检查(无 controller 裸用 req.user.id/自拼 tenant_id=)。

---

## 6. admin 新增"租户管理"(Q5)

- 位置:admin(平台入口),与"用户管理/平台管理"平级(系统/平台组)。
- 功能:平台方(内部用户)手工录入/编辑租户主体信息(企业名/联系人/状态/到期),无需接口认证。
- 关联:创建租户后,可在该租户下创建/分配租户管理员账号(users.tenant_id 指向该租户)。

---

## 7. mychat 首页(Q5,= W15 控制台重做,解决 M21)

### 7.1 现状差距
- mychat 无首页(直进 /conversations);Dashboard 是 chat_rpa 残留死指标(关键词命中/转人工等,只读产品无意义)。

### 7.2 新 mychat 首页
- 新增 mychat 专属首页路由,改 entry.js / defaultPath(mychat 默认进首页而非 /conversations)。
- 内容三块:
  1. **主体信息**:展示该租户的企业主体信息(来自 tenants 表,admin 录入的)。
  2. **插件下载**:复用现有插件下载组件(getPluginUpdate/downloadPluginZip)。
  3. **看板**:
     - **企业级**(租户管理员看):企业名 + 员工数统计。
     - **员工级**(客服看):资产数据按登录员工分到的客服账号(对话数/线索数/工单数等)。
- 旧 Dashboard 的 chat_rpa 死指标(关键词/转人工/AI调用)全部移除。

---

## 8. 清库与时序(Q5 + 与 W17 协调)

### 8.1 清库重建(生产无真实数据)
- W19 涉及 conversation_id 改造 + 加 service_account_id → 需清库重采。
- **★只清一次:W19 实施完(schema + 采集 + conversation_id 改造都就绪)后,统一清库重采**——这次重采同时生效 W17 阶段一(position)+ W19(account_biz_id/conversation_id/service_account)。避免 W17 发版清一次、W19 再清一次。
- 清库走 prod-safety §4:先备份(离机+验证可解压)、环境确认、QA/Chase 在场 apply。
- 范围:业务数据(messages/conversations/leads/workorders/analysis_jobs/service_accounts/employee_service_account);保留 RBAC/登录/平台字典/插件授权 + 新建的 tenants。

### 8.2 与 W17 的关系
- W17 阶段一已合并 main(不发版)。
- W19 从带 W17 的 main 切分支,基于 W17 的 messages 结构(position/segment_at)继续加 service_account_id。
- **发版**:W17 阶段一 + W19 一起发版(一次清库、一次部署),版本 v0.5.0(W19 大功能 minor)。
- W17 阶段二(云端对账)排在 W19 之后;其"段标识"用账号维度,与 W19 conversation_id 口径对齐。

---

## 9. 实施阶段划分(给后续 tasks 文档铺路)

> 写代码等 W17 阶段一合并 main 后。建议分阶段、每阶段可验收:

- **阶段A — 数据模型 + 角色清洗**:建 tenants/service_accounts/employee_service_account 表;users 加 tenant_id;业务表加 service_account_id;角色清洗 + 统一 role_id + tenantId(req) 改单点。(C 类,schema diff 先确认)
- **阶段B — 采集侧账号识别 + 归属**:插件抓 account_biz_id + 昵称上报;server upsert service_account + 自动建归属;conversation_id 纳入 account_biz_id。(与 W17 采集层协调)
- **阶段C — admin 租户管理**:租户主体 CRUD;租户下建管理员。
- **阶段D — mychat 首页**:首页路由 + 主体信息 + 插件下载 + 企业级/员工级看板;移除 chat_rpa 死指标。
- **阶段E — 数据隔离收口 + 清库重采发版**:客服按分配账号过滤;租户管理员看本租户全部;统一清库重采(W17+W19)+ 发版 v0.5.0。

---

## 10. 关联技术债
- **M16**(role/role_id 双轨)→ W19 §5.2 解决。
- **M21**(后台 UI/W15)→ W19 §7 mychat 首页解决。
- **M24**(position-tracker 存储键隔离)→ W19 定了客服账号标识(account_biz_id+昵称),阶段B 用它做隔离键解决。
- **M15**(user_type)→ W19 §5.1 解决:加 users.user_type(internal/external),系统级判内外。
- **M17**(data_scope)→ W19 用 employee_service_account 表达"按客服账号"过滤,data_scope 维度部分被替代。

---

## 10.5 codex review 采纳的强化点(2026-06-05)

> 第二视角(codex)独立 review 采纳的工程强化。前2条(去昵称唯一键 / 验证accountId)因两次实测已知 accountId 是商家账号级、坐席无UID 而不适用(见 §2/§3.1);其余采纳:

1. **唯一键加 page_id**(§3.1 已改):uk_account 含 page_id;昵称仍在键内(坐席粒度必需)。
2. **messages / analysis_jobs 也加 service_account_id**(§3.2 已改):消息是最底层事实表,便于按账号追溯采集问题,不只靠 conversation 间接推。
3. **统一 scope helper(替代裸 tenantId)**:不再每个 controller 自拼 tenant 条件。统一解析:
   - 客服(普通员工):只看分配到的 service_account_id 集合
   - 租户管理员:看本租户全部
   - 内部用户(tenant_id=NULL):★默认不看业务数据,仅在明确选定目标租户时才查
   - 禁止裸用 req.user.tenant_id;所有业务查询走 scope helper。
4. **旧插件兼容:缺 account_biz_id 直接拒绝,不兜底 unknown**:server 对缺新字段的事件返回明确错误 + 插件最低版本提示;★绝不悄悄写 unknown 账号(会产生无归属脏数据)。account_biz_id 缺失 → 拒绝或进错误队列。
5. **自动绑定限角色 + 标记来源**:只对"客服员工角色"自动建 employee_service_account;租户管理员默认看全租户、不自动绑;自动绑定标 assigned_by=系统/来源,可人工调整。(防共用电脑/测试/代操作误授权)
6. **清库也清插件本地状态**(阶段E 补):不只清 MySQL,还要重载插件、清 position-tracker storage、清 EventQueue/seen cache。否则 DB 新数据 + 插件旧位置编号/旧队列 = 乱。
7. **RBAC 分两步**:W19 先做到代码只读 role_id、users.role 保留不用;稳定一版后再物理删字段(不一上来删)。
8. **DDL 渐进**:字段先 nullable、schema diff + dry-run,再逐步补约束。
9. **batch upsert service_account 按 batch/conversation 粒度**,不逐条消息做(避免高频写 + 并发重复)。
10. **发布纪律**:W19 改数据契约/conversation_id/权限/插件字段 → 插件与 server 同步发布;mychat 首页(展示层)不与 A/B 核心数据契约混在同一不可回滚提交;W19 若延期不卡 W17(W17 已可独立合并,本就已合 main)。

---

## 11. 待确认 / 风险
- **Q(实施前)**:坐席改名频率?若频繁,人工校正负担重,届时再评估网络层挖坐席ID(现不做)。
- **conversation_id 改造 + W17 协调**:坐席不进 conversation_id(换坐席不分裂会话);与 W17 阶段二段标识口径对齐(§4.3)。
- **内部用户 tenant_id=NULL 的查询处理**:内部用户不按租户过滤,需在 tenantId(req) 单点处理 NULL 分支,别让内部用户误查到/查空业务数据。
- **C 类最敏感**:动租户实体+RBAC+数据归属+conversation_id,每阶段 schema/契约改前报 Chase。
