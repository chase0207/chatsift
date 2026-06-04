---
文档: W16 调研 — 权限模型 + 前端结构(为"平台/租户双入口拆分"铺路)
版本: v1.0.0
状态: Active(阶段一:调研,只看不改)
---

## 变更日志

| 版本 | 日期 | 变更摘要 | 触发来源 |
|---|---|---|---|
| v1.0.0 | 2026-06-02 | 阶段一调研:现有权限模型 + 数据查询是否按身份过滤 + 前端结构 | Chase 决定拆分平台/租户双入口 |

---

# W16 阶段一调研:权限模型 + 前端结构

> **背景**:当前"平台视角和用户视角混乱"——根因是缺"租户"隔离层,且超级管理员能看全部用户的全部业务数据。Chase 决定:
> - **admin.kongyuekeji.com** = 平台/超管入口(平台运营视角,**不看任何租户客户业务数据**)
> - **mychat.kongyuekeji.com**(新域名)= 租户/员工入口(管自己的客户/会话/线索/工单)
> - 当前只有员工甲(以用户身份用),租户概念未实现,先归一个默认租户,未来在 mychat 基础上演变多租户。
> **本阶段只调研,不改任何代码/权限/UI。** 改造方案(阶段二)据调研出。
> **定性**:这是**数据安全/权限架构**改动,风险最高一类。调研要格外较真"数据有没有按身份过滤"(安全底线)。

---

## 0. 已定的产品决策(调研围绕这些展开)

1. **超级管理员不能看租户的客户业务数据**(聊天/会话/线索/工单/客户)。admin 入口**根本不提供**这类功能,不是"藏起来"。超管只看平台运营层(租户数、用量、系统健康)。
2. **两个入口物理分离**:admin(平台)、mychat(租户员工)。
3. **数据隔离不能只靠前端走哪个域名,必须后端按登录身份强制过滤**(安全核心)。
4. 当前先归一个默认租户;完整多租户(多租户/租户管理员/业务规则租户化)等第二个租户来了再演变。

---

## 1. 调研任务(只看不改)

### Dx Task 1 — 现有用户/角色/权限模型(安全底线,最重要)

```bash
cd ~/vscode/chatsift
# 用户表结构:有没有角色字段?有没有租户归属字段?
grep -rn "role\|is_admin\|is_super\|tenant\|user_type\|权限\|角色" server/sql/*.sql
# 登录返回什么身份信息(token 里带什么)
grep -rn "jwt\|sign\|token\|role\|payload" server/src/controllers/v1/authController.js server/src/middleware/* 2>/dev/null
# 鉴权中间件怎么做的
ls server/src/middleware/ 2>/dev/null && grep -rn "role\|admin\|permission\|tenant" server/src/middleware/
```

回报:
- 用户表有哪些字段?有没有 role / 是否超管 / tenant_id?
- 登录后 token/session 里带了哪些身份信息?
- 有没有鉴权中间件?它怎么判断"谁能访问什么"?

### Dx Task 2 — 业务数据查询是否按身份过滤(★安全核心★)

这是整个 W16 的安全底线。逐个查 business 数据接口,看查询有没有"按当前登录用户/租户过滤":

```bash
# 会话/线索/工单/客户 的列表查询,WHERE 条件里有没有按 user/tenant 过滤?
grep -rn "WHERE\|tenant_id\|user_id\|created_by\|owner" server/src/controllers/v1/conversationsController.js server/src/controllers/v1/leadsController.js server/src/controllers/v1/workordersController.js
```

逐接口回报(conversations/leads/workorders/analytics):
- 查询的 WHERE 条件是什么?
- **有没有"只返回当前登录身份该看的数据"的过滤?** 还是"任何登录用户都能查全部"?
- **结论判定**:当前数据是"按身份隔离"还是"全员可见全部"?(这决定 W16 安全改动量)

> ★ 如果当前是"任何登录用户都能查全部数据",那这是个**现存的数据越权隐患**——域名拆分前必须先在后端补强制过滤,否则 mychat 员工仍能调接口看全部。这是 W16 最关键的发现。

### Dx Task 3 — admin 前端结构(哪些是平台页、哪些是业务页)

```bash
ls admin/src/views/
grep -rn "router\|path\|component" admin/src/router/index.js
```

回报:把 admin 现有页面分成两类——
- **平台运营页**(该留 admin):系统设置、用户管理、平台/菜单/角色管理、(将来)租户管理、运营健康等
- **租户业务页**(该挪 mychat):会话中心、工单中心、线索中心、运营分析、消息聚合(W13)、控制台业务概览等
- 列出每个 view 归哪类,以及它们的路由/菜单怎么组织的

### Dx Task 4 — 拆分的技术可行性

调研"两个域名/两套界面"怎么实现最省、最稳:
- admin 前端现在是一套 Vue 构建。拆成两个入口,可选:① 两套独立前端构建(admin/ 和 mychat/);② 一套前端按域名或登录身份渲染不同界面/路由。各自改动量?
- 后端是同一个 server 同一套 API 吗?两个入口共用 server 的话,**靠什么区分请求来自平台还是租户**(域名?还是登录身份?)——重申:安全必须靠登录身份,不能只靠域名。
- 部署:加 mychat 域名的 Nginx + 证书改动面(chatsift 刚部署完 admin,参考现有配置)

### Dx Task 5 — tenant 字段预留现状

```bash
# 业务数据表(conversations/leads/workorders/客户)有没有 tenant_id?
grep -rn "tenant" server/sql/*.sql
```

回报:业务表有没有租户归属字段?如果没有,阶段二要加(先归默认租户)。lead 表当初按模型B预留过跨平台,看有没有顺带预留租户维度。

---

## 2. 回报格式

写成 `docs/reports/W16-permission-investigation.md`,含:
1. Dx1:用户/角色/权限模型现状(有没有 role/tenant)
2. Dx2:★业务查询是否按身份过滤★ —— 逐接口结论 + 总判定(隔离 or 全员可见)
3. Dx3:前端页面分类(平台页 / 业务页)
4. Dx4:拆分技术可行性(两套前端 or 一套按身份;后端怎么区分;部署改动)
5. Dx5:tenant 字段预留现状

**回报后停下,等 Claude 据此出 W16 拆分方案。不要自行改权限/UI/查询。**

---

## 3. 重要提示

- **安全底线是 Dx Task 2**:务必查清"业务数据查询现在有没有按身份过滤"。如果"全员可见全部",这是现存越权隐患,拆分前必须先补后端过滤——域名拆分只分界面,后端身份过滤才分数据
- **超管不看客户业务数据**:admin 入口不提供看会话/线索/工单/客户的功能(不是藏,是不提供)
- **只调研不改**:不动权限、不动查询、不动UI。这是数据安全改动,谨慎
- **当前先一个默认租户**:不做完整多租户,只做"双入口 + 后端身份过滤 + tenant字段预留",为未来演变铺路
- **流程**(W12.5重申):调研属诊断,改造方案先报,不自行改+commit
- **不要改 chat_rpa**(只读参考)