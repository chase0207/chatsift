# W19 阶段B 验收报告 — 采集侧账号识别 + 自动归属 + conversation_id 改造

> 版本: v1.0.0　日期: 2026-06-06　身份: DEV(CC1 执行)　分支: w19-tenant-asset-model
> 依据: `docs/research/2026-06-06_W19阶段B技术方案.md`(CC2 出, Chase 审过) + Q1-Q5 决策。性质: C 类(数据契约/归属/插件字段)。
> 结论待 Chase 确认 = 阶段B 代码闭环(真机采集 + 清库重采 = 阶段E)。

## 0. 范围
B1 插件抓 account_biz_id + 坐席昵称独立上报;B2 server upsert service_account + 注入 sa_id + 自动归属 + 继承;
B3 conversation_id 纳入 account_biz_id;B4 position key 隔离(走方案A)。
**不做(留阶段E)**:真机采集验证 + 清库重采 + 客服隔离最终验收。

## 1. 验收逐项结果

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| 1 | B1 插件抓 account_biz_id(URL accountId)+ 坐席昵称独立上报 | ✅ | `_readAccountBizId` 抓 query accountId(真机 URL 已证 query 非 path);event 加独立 account_biz_id/account_nickname;content.js 重建 |
| 2 | B2 upsert service_account + conv/msg/job/lead/wo 挂对 sa_id | ✅ | 集成测试:sa upsert(tenant1+private-message page)、conversation/2条message/job 全挂 sa_id |
| 3 | B2 客服上报自动建 employee_service_account | ✅ | 集成测试:agent 上报 → esa(employee=4, assigned_by=NULL 系统来源);超管不绑 |
| 4 | 缺 account_biz_id 处理(Q1 改:放行留 NULL) | ✅ | laike(无 bizid)accepted=1、service_account_id=NULL、无脏 unknown 账号;非拒绝 |
| 5 | B3 conversation_id 含 account_biz_id、跨账号同名客户不误并 | ✅ | 口径校验:含 bizid、跨账号同名→不同 id、同账号同客户→同 id(幂等)、坐席不进、laike 退旧口径 |
| 6 | Q5 拒 internal 上报 | ✅ | 集成测试:internal 上报 → 403 |
| 7 | ★隔离闭环(B 归属数据喂 A4 helper) | ✅ | 集成测试:客服上报后,其 scope 看到自己账号会话(n=1)、未分配客服看不到(n=0) |
| 8 | B4-A position key 跨租户不串号 | ✅(分析) | key=w17_pos_+conversationId,B3 后含 account_biz_id=租户专属 → 天然不串号(方案A,不另加前缀) |

## 2. 关键口径(对齐 Q1-Q5)

- **Q1 范围**:只做 private-message。laike/feige 照常采,但 **service_account_id 留 NULL**(不拒、不写 unknown),以后做。
- **Q2 page 映射**:`platform_page` 串 → `platform_pages.page_key`(laike-message/feige/private-message)→ page_id。
- **Q3 多坐席**:conversation.service_account_id = 最近坐席(COALESCE 更新)/ message 级精确 / lead·workorder 继承 conversation。
  **已知局限**:多坐席接待时 lead/wo 按"最近坐席"归属,业绩可能不精确;现可接受,未来精确化再细化。
- **Q4 position key**:走方案A(account_biz_id 已在 conv_id,租户边界天然成立,不为拿不到的 tenant_id 加 plugin 耦合)。
- **Q5 internal**:显式拒绝上报(403)。

## 3. 数据契约连锁(★清库重采=阶段E)

B3 改 conversation_id ⇒ message_id = `syn_hash(conversationId|position)` 全变 ⇒ 旧库 conv/message 全对不上。
**不可在线迁移,只能清库重采**(与 W17 position 一次清,design §8 已定)。B3 代码本阶段落,**清库 + 真机重采留阶段E**。
B4 清本地清单(阶段E 执行):重载插件 + 清 chrome.storage `w17_pos_*` + EventQueue/seen cache。

## 4. 顺延阶段E(B 不做)

- **真机采集验证**:真实私信页抓 account_biz_id(本阶段按 W6.5 旧实现 + 真机 URL 已证 query accountId;阶段E 清库重采时端到端再核一次)。
- **清库重采**:B3 conversation_id 变更需清库(不可逆,Chase 拍板)。
- **客服隔离最终验收**:B 只保证归属数据正确写入;客服按账号看数据的最终验收 = 阶段E(有真实采集数据后)。

## 5. 阶段B 提交

- `d389101` B1 插件抓 account_biz_id(URL accountId)+ 坐席昵称独立上报
- `3e5f14e` B2 server upsert service_account + 注入 sa_id + 自动归属 + 继承
- `b04631d` B3 conversation_id 纳入 account_biz_id + B4-A position key 隔离说明

**阶段B 代码闭环、集成测试全过(测试数据已清,未污染库)。待 Chase 确认 → 阶段C(admin 租户管理)/ 阶段E(清库重采+发版)。**
