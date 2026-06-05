---
文档: W19 调研 — 租户资产模型现状(为"正式启用租户 + 资产层级"铺路)
版本: v1.0.0
周次: W19
落位: docs/prd/(调研报告回写 docs/research/)
状态: Active(阶段一:调研,只看不改)
---

## 变更日志
| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.0.0 | 2026-06-04 | 阶段一调研:摸清租户/员工/客服账号/平台页面/对话线索工单的现状表达 |

---

# W19 阶段一调研:租户资产模型现状

> **背景**:W19 要正式启用"租户"概念,建立资产层级:
> ```
> 租户 > 平台 > 页面 > 客服账号(资产原点) > 对话/线索/工单
> 员工(mychat登录) ↔ 客服账号 = 多对多(员工管多个;客服账号可分多人)
> ```
> **本阶段只调研,不改任何代码/表/数据。** 调研结论用于设计 W19 资产模型。
> **定性**:触及租户实体 + RBAC + 数据归属(C 类,最敏感),务必先摸清现状再设计。
> **身份 DEV / 只读。** 报告写 `docs/research/2026-06-04_W19租户资产模型现状.md`。

---

## 0. 已定的产品决策(调研围绕这些)

1. 正式启用"租户"为独立实体(当前"租户"只是 tenant_id=user.id,无独立租户表)。
2. 资产层级:租户 > 平台 > 页面 > 客服账号(原点) > 对话/线索/工单。
3. 员工 ↔ 客服账号 = **多对多**(需分配关系表):默认谁采集归谁,租户管理员可重新分配,一个客服账号可分多人。
4. 角色清洗:管理员→"内部用户";普通用户→"租户管理员";新增"客服"角色(普通员工)。
5. 租户管理在 admin(超管录入主体信息);主体信息在 mychat 首页展示。
6. mychat 首页看板:企业级(企业名+员工数)+ 员工级(资产数据按登录员工的客服账号)。
7. 生产无真实数据,可全部清空(干净建模、不背历史包袱)。

---

## 1. 调研任务(只看不改)

### Dx1 — 现有"租户"表达 + 是否有独立租户实体
```bash
cd ~/vscode/chatsift
grep -rn "tenant" server/sql/*.sql deploy/conf/init/*.sql
grep -rn "tenant_id\|tenantId" server/src/controllers/v1/_shared.js server/src/middleware/*.js
```
回报:
- 现在"租户"是不是就是 `tenant_id = user.id`?有没有独立的"租户表"?
- 业务表(conversations/leads/workorders/messages)的 tenant_id 现在指向什么(user.id)?
- 如果引入独立租户表(租户 ≠ user),现有"tenant_id=user.id"的查询要改多少?(评估改动面)

### Dx2 — 用户/角色/权限现状(为角色清洗)
```bash
grep -rn "role\|is_super\|data_scope" server/sql/*.sql
grep -rn "role" server/src/controllers/v1/authController.js server/src/middleware/permission.js
```
回报:
- 现有 users 表:有哪些用户?角色字段现状(role / role_id / is_super)?
- 现有角色定义(roles 表):有哪些角色?当前"管理员/普通用户"分别是哪条、怎么用?
- 角色清洗(管理员→内部用户、普通用户→租户管理员、新增客服)影响哪些登录/鉴权/权限点?

### Dx3 — 平台 / 页面 / 客服账号的现状表达(资产层级骨架)
```bash
grep -rn "platform\|page\|account\|客服\|agent" server/sql/*.sql | grep -i "table\|key\|column"
grep -rn "platform_page\|platforms\|account" server/src/controllers/v1/
```
回报(★资产层级的关键★):
- 现在有没有 platforms / platform_pages 表?结构如何?(W16 调研提过,核实)
- **"客服账号"现在在数据里怎么存的?** 有没有独立的客服账号表?还是只作为 conversations 的一个字段(如 agent_name)?
- 对话/线索/工单现在怎么关联到"客服账号"?(有没有 account 字段?还是只有 conversation_id?)
- 现有结构离"客服账号作为资产原点、对话/线索/工单挂在它下面"差多少?

### Dx4 — 客服账号名称的来源(插件抓取链路)
```bash
grep -rn "客服\|agent\|account\|nickname\|sender" plugin/adapters/douyin/private-message.adapter.js
```
回报:
- 插件采集时,"客服账号名称"从哪里抓的?(哪个 DOM / 字段)
- 采集上报时,这个客服账号名跟着哪条数据上来?(events 里有没有携带客服账号标识)
- "默认谁采集归谁"——采集时能不能拿到"当前登录的是哪个客服账号"?(决定归属能不能自动建立)

### Dx5 — admin / mychat 现有页面结构(为"租户管理"+"mychat首页")
```bash
ls admin/src/views/
grep -rn "path\|component" admin/src/router/index.js
```
回报:
- admin 现有页面(W16 后)有哪些?加"租户管理"页放哪、和现有"用户管理/平台管理"什么关系?
- mychat 现在首页是什么?(W16 后 mychat 渲染什么)要改成"主体信息+插件下载+看板",现状离目标差多少?
- 控制台 Dashboard 现状(W15 提过是 chat_rpa 残留)——W19 要重做成 mychat 首页,现在长什么样?

---

## 2. 回报格式

写 `docs/research/2026-06-04_W19租户资产模型现状.md`(开头带版本号),含:
1. Dx1:租户表达现状 + 引入独立租户表的改动面评估
2. Dx2:用户/角色/权限现状 + 角色清洗影响面
3. Dx3:★平台/页面/客服账号现状 + 离"资产层级"差多少★
4. Dx4:客服账号名称来源 + 能否自动建立归属
5. Dx5:admin/mychat 页面现状 + 离目标差多少
6. 关键发现汇总 + 待 Chase/Claude 定的点

**回报后停下,等 Claude 据此出 W19 资产模型设计。不要改任何表/角色/数据。**

---

## 3. 重要提示
- **只调研不改**:不动租户/角色/表/数据。这是 C 类最敏感(动租户实体+RBAC),先摸清再设计。
- **重点是 Dx3**(客服账号现在怎么存、对话怎么挂)——这是资产模型能不能落地的关键。
- 生产无真实数据可清空,所以建模可以干净(不用考虑历史迁移),但**调研要看清现有结构**,设计才能复用已有的(platforms/pages 等)。
- 与 W17 边界:W17 动 plugin 采集层(CC1);W19 动 admin/server 的租户/角色/资产(本调研只读)。调研只读不冲突。
- 流程:调研属诊断,结论先报,不自行改。不改 chat_rpa。
