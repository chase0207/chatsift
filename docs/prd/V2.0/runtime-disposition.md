# V2.0 Runtime Disposition Plan

> **版本**:V2.0 实施依据
> **基准**:本地 V1.9.0,prod 仍跑 V1.8.2(将下线)
> **决策原则**:Observe First,插件只读探针,所有业务逻辑上移服务端
> **执行约束**:不开新仓库,在现有 monorepo 内演进;不一次性 rewrite,逐文件改造

---

## 0. 战略决策已确认

| # | 决策 | 来源 |
|---|---|---|
| 1 | 服务器升配由用户负责 | 用户确认 |
| 2 | V1.8.2 prod 可下线,无真实用户 | 用户确认 |
| 3 | V1.8.2 老表可删除,V2.0 重建 schema | 用户确认 |
| 4 | V2.0 MVP 只跑抖音,其他平台不急 | 用户确认 |
| 5 | LLM 配额耗尽时拒绝服务,提示"请联系平台管理员" | 用户确认 |

---

## 1. plugin/runtime/ 20 个文件去留判定

判定四档:**保留(K)**= 直接拿来用 / **改造(M)**= 语义重定向 / **降级(D)**= 只保留部分功能 / **废弃(X)**= 完全删除。

| # | 文件 | 行数 | 处置 | 理由 |
|---|---|---:|---|---|
| 1 | adapter-registry.js | 169 | **K** | V2.0 仍需注册抖音 3 个 adapter |
| 2 | adapter-runtime.js | 57 | **X** | 无头部注释的 legacy 残留,与 adapter-registry 重复 |
| 3 | batch-manager.js | 397 | **M** | 语义从"对话处理生命周期"改为"消息批次上报生命周期" |
| 4 | bug-dump.js | 229 | **K** | QA 工具,V2.0 仍需要 |
| 5 | chaos-monitor.js | 284 | **K** | 6 条不变量哨兵,V2.0 加 1-2 条"采集"相关不变量 |
| 6 | diff-engine.js | 84 | **K** | 四信号新消息判定,是采集核心 |
| 7 | feature-flags.js | 68 | **M** | 3 个 flag 全部删除(都是 send 相关),改为采集相关 flag |
| 8 | lk-tracer.js | 174 | **K** | LK 日志批量上报,V2.0 仍是核心可观测性 |
| 9 | pre-check.js | 91 | **X** | 4 道发送前门禁,V2.0 不发送 |
| 10 | queue-manager.js | 233 | **M** | batch 调度器语义从"待发送"改为"待上报" |
| 11 | recovery-manager.js | 145 | **K** | reload 后恢复 queue/batch,V2.0 仍需 |
| 12 | rpc-bridge.js | 122 | **K** | DevTools 调试基础设施 |
| 13 | runtime-manager.js | 455 | **M** | 删除 sendInBatch(L313),状态机砍掉 SENDING/CONFIRMING/SYNCING |
| 14 | runtime-state-machine.js | 79 | **M** | 12 状态精简为 6 状态(去掉 send 相关) |
| 15 | self-check.js | 360 | **K** | V1.9 链路验证,V2.0 改 4 个 case 即可复用 |
| 16 | send-confirm.js | 130 | **X** | click 确认 send 成功,V2.0 不发送 |
| 17 | session-detector.js | 110 | **K** | M1 入口,纯检测不回复,V2.0 直接复用 |
| 18 | session-identity-resolver.js | 206 | **K** | ADR-005 session_id 计算,V2.0 仍需 |
| 19 | session-parser.js | 100 | **K** | DOM → SessionSnapshot,纯采集 |
| 20 | watchdog.js | 147 | **M** | 监控对象从"send 卡死"改为"upload 卡死" |

**统计**:保留 11 个 / 改造 6 个 / 废弃 3 个。

**新增文件**(plugin/runtime/ 下):

| 文件 | 行数预估 | 职责 |
|---|---:|---|
| dom-scope.js | 80 | scoped querySelector + ObserverRegistry |
| event-uploader.js | 150 | ConversationEvent 批量 HTTP 上报 + 重试 + 离线缓冲 |
| event-normalizer.js | 100 | adapter rawMessage → ConversationEvent 标准化 |

---

## 2. plugin/content_legacy.js 5904 行拆解

按报告 §2 的 function 清单,逐段判定处置。

### 2.1 保留区(纯采集 + 工具)

| 行号 | 内容 | 处置说明 |
|---|---|---|
| 63-119 | DOM 工具(getNode/getText/simulateInput*/simulateClick*/scrollToBottom) | **K** 保留,采集时需要 scroll 加载历史 |
| 122-130 | runId 生命周期 | **K** |
| 252-346 | 平台/页面识别(loadPlatformDefinitions/getMatchedPlatformPage/getPlatformMeta) | **K** 采集前提 |
| 354-462 | 场景 + frame 路由(getCurrentScene/isTopFrame/shouldRunKefuInCurrentFrame) | **M** 改名 `shouldRunCollectorInCurrentFrame` |
| 488-624 | LK 诊断 + 抖音 trace | **K** 调试基础设施 |
| 645-694 | loadCfg / loadRuntimeConfig | **K**;删除 `requestAIFromServer`(L694) |
| 748-831 | 去重 + 持久化(processed key / wasProcessedRecently / markProcessed) | **K** 采集去重必需 |
| 840-922 | 通用 DOM 查询(querySelector4 / waitForElement / waitForMsgStable) | **K** 改造为 dom-scope 内部用 |
| 922-995 | FSM + 错误处理 | **M** FSM 状态简化(去掉 send 相关) |
| 1000-1106 | 指纹 + 对话历史(buildFingerprintKey / markFingerprintProcessed) | **K** 去重必需 |
| 1340-1454 | 消息收集(collectUnrepliedMessages / normalizeCompactText 等) | **K** 采集核心 |

### 2.2 删除区(Decision + Send)

| 行号 | 内容 | 处置 |
|---|---|---|
| 135-244 | showNewMessageBox + log* 系列 | **X** 浮窗 UI 删除(V2.0 无悬浮窗) |
| 694 | `requestAIFromServer` | **X** 决策上移服务端 |
| 712-740 | 关键词决策(processQaKeywords/getRandomLoopReply 等) | **X** 决策上移服务端 |
| 1125-1194 | 日统计(loadDailyStats/recordStatEvent/renderStatsPanel) | **X** 改由服务端统计 |
| **1251** | **decideReply** | **X** |
| **1454** | **decideReplyMulti** | **X** |
| 1476-1572 | sendReply/countSelfBubbles/verifySent/verifyTarget | **X** 发送链路全删 |
| 1587-1619 | sendContentEditableReply / **processMessageSession** | **X** |
| 1762-1785 | 浮窗 UI(getFloatEntryEnabled/setFloatEntryEnabled/ensureFloatBarStyle) | **X** |
| 1785-5904 | 平台 handler / 浮窗 DOM 构建 / popup 事件 | **大部分 X**,平台 handler 里的采集逻辑迁移到 adapter 文件 |

### 2.3 改造区(消息处理总入口)

`processMessageSession`(L1619 附近)目前是端到端总入口(检测会话 → 收集消息 → decideReply → sendReply)。V2.0 重写为 `collectMessageSession`,只做前两步,然后 push 到 EventUploader。

### 2.4 拆解策略

**不一次性重写 content_legacy.js**,而是分三轮:

- **Round 1**:在 content_legacy 末尾新增 `collectMessageSession`,与 `processMessageSession` 并存,通过 feature flag 切换
- **Round 2**:flag 切到新链路,删除 `decideReply / sendReply / processMessageSession / 浮窗`
- **Round 3**:把保留区代码逐段迁出 content_legacy → `plugin/runtime/legacy-collector.js`,最终删除 content_legacy.js

预计 content_legacy.js 缩到 0 行,plugin 总代码量从 11176 行降到 5000-6000 行。

---

## 3. plugin/adapters/douyin/ 改造

报告 §3 显示 3 个 adapter 已经是七元方法标准结构。改造方案如下。

| 方法 | 处置 |
|---|---|
| `matchPage()` | K 保留 |
| `_parseContact()` | K 保留(内部辅助) |
| `_detectActiveItem()` | K 保留(内部辅助) |
| `detectSessions()` | K 保留 |
| `selectTriggerSession()` | **M** 改名 `selectScanSession`,语义从"选择要回复的"改为"选择要扫描的" |
| `switchSession()` | K 保留(切换会话仍是必要动作) |
| `confirmActiveSession()` | K 保留 |
| `getMessages()` | **M** 输出格式改为 ConversationEvent[] |
| `classifyMessage()` | K 保留(用于判断 inbound/outbound) |
| `buildBatch()` | **M** 语义从"待回复批次"改为"待上报批次" |
| `prepareReply()` | **X** 删除 |
| `sendReply()` | **X** 删除 |

**新增方法**:每个 adapter 加一个 `toConversationEvent(rawMsg)`,把平台原始消息映射为 V2.0 标准 schema。

---

## 4. 数据库重建方案

### 4.1 V1.8.2 prod 18 张表去留

报告 §5 数据量极小(< 500KB,最大表 193 行),无迁移负担。按用途分四档。

**保留并复用**(8 张,V2.0 直接用):

| 表 | 用途 | V2.0 是否改 schema |
|---|---|---|
| users | 账号体系 | 否 |
| plugins | 用户-平台授权 | 否 |
| configs | 用户配置 | 否,但 V2.0 不再存"AI 配置"在这 |
| platforms | 平台元数据 | 否 |
| platform_pages | 页面识别规则 | 否 |
| menus | 后台菜单 | 加 V2.0 新菜单项 |
| roles | 角色 | 否 |
| role_has_permissions | RBAC | 加 V2.0 新权限项 |

**改造重建**(2 张,V2.0 重新设计):

| 表 | 处置 |
|---|---|
| chat_messages(80 行) | **drop**,V2.0 用 `v2_messages` 重建 |
| chat_sessions / chat_batches | 不存在于 prod(V1.9 新表),test 上有但用 v2_conversations 替代 |

**保留观察**(4 张,V2.0 短期不变):

| 表 | 用途 |
|---|---|
| keyword_replies(193 行) | V2.0 移到 `v2_intent_rules`,迁移后 drop |
| knowledge_files / knowledge_chunks | V2.0 服务端 RAG,先保留,V2.1 重做 |
| message_logs(74 行) | 插件运行日志,V2.0 用 runtime_logs 替代后 drop |

**直接删除**(4 张):

| 表 | 删除理由 |
|---|---|
| device_sessions(30 行) | V2.0 用 heartbeat 接口的内存状态 |
| human_transfer_logs(0 行) | V2.0 无"转人工"概念 |
| plugin_stats / plugin_errors | V2.0 用 runtime_logs 统一记录 |
| user_column_prefs(0 行) | V2.0 后台前端用 localStorage 存 |

### 4.2 V2.0 新增 8 张表

```sql
v2_conversations         -- 会话(对应一个客户的一次对话)
v2_messages              -- 消息(每条上报的 ConversationEvent)
v2_leads                 -- 线索(等于潜在客户)
v2_workorders            -- 工单(4 类:inquiry/appointment/complaint/pricing)
v2_intent_rules          -- 意图识别规则(替代 keyword_replies)
v2_price_table           -- 价格表(询价场景使用)
v2_tenant_llm_config     -- 企业 LLM 配置(替代 ai 配置)
v2_analysis_jobs         -- 分析任务队列(setImmediate worker 用,无 MQ 替代)
```

字段定义见 `v2.0-schema.sql`(下一步产出)。

### 4.3 迁移路径

**Phase A**:V2.0 开发期,test 环境 drop database 后用 V2.0 schema 重建。
**Phase B**:V2.0 上线,prod 也 drop database 重建(已确认无真实用户)。
**Phase C**:观察 1-2 周,然后 drop 第四类 4 张表。

---

## 5. server/src/routes/ 21 个 router 处置

报告 §6 完整列了 21 个 router 和端点。V2.0 处置如下。

### 5.1 保留并复用(11 个)

| router | 处置 |
|---|---|
| auth | K |
| users | K |
| roles | K |
| menus | K |
| platforms | K |
| pages | K |
| plugins | K |
| configs | K |
| dashboard | K |
| logs | K(runtime 日志,V2.0 仍用) |
| _chaos | K(dev-only,V2.0 仍用) |

### 5.2 改造(3 个)

| router | 处置 |
|---|---|
| devices | M:删 `/api/plugin` 双挂载(L48),只保留 `/api/devices` |
| stats | M:`/plugin/error-report` 路径冲突修复,迁到 `/api/v2/runtime/error` |
| messages | M:`POST /plugin/messages` 改为 `POST /api/v2/events/batch`,旧路径保留 1 个月兼容 |

### 5.3 V2.0 重做(3 个 V1.9 router)

| router | 处置 |
|---|---|
| runtime | M:`/api/runtime/logs/batch` 保留,新增 `/api/v2/runtime/heartbeat` |
| batches | **X**:V1.9 batch 概念是"对话处理批次",V2.0 不用,删除 |
| sessions | M:语义从"客服会话"改为"上报会话",路径迁移到 `/api/v2/conversations` |

### 5.4 删除(4 个)

| router | 删除理由 |
|---|---|
| ai | V2.0 决策在服务端 engine 内,不暴露 HTTP |
| knowledge | V2.0 重新设计 RAG,新建 `/api/v2/knowledge` |
| keywordReplies | V2.0 用 `v2_intent_rules`,新接口 `/api/v2/intent-rules` |
| (无第 4 个,本节是 3 个) |

### 5.5 新增(7 个 V2.0 专用)

```
/api/v2/events           -- 事件入口
/api/v2/conversations    -- 会话列表与详情
/api/v2/leads            -- 线索 CRUD
/api/v2/workorders       -- 工单 CRUD + 派单
/api/v2/intent-rules     -- 意图规则配置
/api/v2/price-table      -- 价格表配置
/api/v2/llm-config       -- LLM 配置
```

V2.0 接口前缀统一 `/api/v2/*`,V1.x 接口保留 1-2 个月做兼容,然后清理。

---

## 6. 服务端 V2.0 新增模块

| 文件 | 行数预估 | 职责 |
|---|---:|---|
| server/src/v2/events.controller.js | 150 | 事件入库 + 去重 + 投递 analyzer |
| server/src/v2/analyzer.js | 250 | 内存 queue + 串行 worker,串联三个 engine |
| server/src/v2/intent-engine.js | 300 | 规则匹配 + LLM 兜底,输出 intent_label |
| server/src/v2/completeness-engine.js | 200 | 字段抽取(预约/问价场景)+ 完整度评分 |
| server/src/v2/workorder-engine.js | 200 | intent → workorder 生成 + SLA 设定 |
| server/src/v2/llm-client.js | 150 | LLM 调用统一入口 + 配额扣减 + 拒绝服务 |
| server/src/v2/lead-engine.js | 150 | 客户去重 + 标签 + 意向度评分 |

**不引入的依赖**:Redis、消息队列、ORM、WebSocket、向量数据库。所有都用 Node 进程内能力 + MySQL 完成。

---

## 7. admin 后台 V2.0 新增页面

| 路由 | 文件 | 行数预估 |
|---|---|---:|
| /v2/conversations | admin/src/views/v2/Conversations.vue | 300 |
| /v2/conversations/:id | admin/src/views/v2/ConversationDetail.vue | 400 |
| /v2/leads | admin/src/views/v2/Leads.vue | 300 |
| /v2/workorders | admin/src/views/v2/Workorders.vue | 350 |
| /v2/analytics | admin/src/views/v2/Analytics.vue | 400 |
| /v2/settings/intent-rules | admin/src/views/v2/IntentRules.vue | 250 |
| /v2/settings/price-table | admin/src/views/v2/PriceTable.vue | 250 |
| /v2/settings/llm-config | admin/src/views/v2/LlmConfig.vue | 150 |

技术栈不变(Vue 3 + Element Plus),复用现有 layout 和 axios 配置。

---

## 8. 十周实施计划

| 周 | 工作内容 | 交付物 | 验收 |
|---|---|---|---|
| W1 | 服务端 V2.0 schema + 基础路由骨架 | v2-schema.sql / 8 张表 / 4 个 controller stub | curl 能 POST events |
| W2 | events 接口 + analyzer 串行 worker | 完整的 /api/v2/events/batch 链路 | 模拟事件能落库,触发空 analyzer |
| W3 | intent-engine(规则版) + workorder-engine | intent_label 能写入 conversations 表 | 测试数据能生成工单 |
| W4 | 插件 Round 1:新增 collectMessageSession,与 legacy 并存 | content.js 加 flag,EventUploader 跑通 | 真实抖音页面能采集消息 |
| W5 | 插件 Round 2:切 flag,删除 decideReply / sendReply | content_legacy 缩到 ~3000 行 | 旧自动回复确认无残留 |
| W6 | admin 后台:Conversations / Workorders 2 个页面 | 后台能查会话和工单 | 用真实采集数据验证 |
| W7 | completeness-engine + lead-engine | 预约字段抽取 / 问价路由 / 线索创建 | 4 类工单都能生成 |
| W8 | LLM 配额扣减 + 拒绝服务提示 | llm-client.js / 配额监控 | 配额耗尽返回"请联系平台管理员" |
| W9 | admin 后台:Leads / Analytics / Settings 3 个页面 | 完整后台 | 完整业务流走通 |
| W10 | 插件 Round 3:legacy 收尾,DOM scope 落地 | content_legacy.js 删除 / dom-scope 接管 | 6 个 observer 收敛到 1-2 个 |

**关键里程碑**:
- **M1 (W5 末)**:V2.0 端到端采集闭环跑通(只插件 + 服务端,无后台)
- **M2 (W7 末)**:四类工单业务流跑通(有后台,但只有核心 2 页)
- **M3 (W10 末)**:V2.0 MVP 完整交付,V1.x 代码全部清理

---

## 9. 风险与开放问题

### 9.1 已识别风险

- **风险 A**:content_legacy.js 5904 行无章节结构,拆解时易漏。**对策**:Round 1 期间保留旧链路并行跑,新链路 1-2 周观察确认无回归再删。
- **风险 B**:V1.9 chaos 阶段已修过 5 个 bug,V2.0 重构期可能引入新的稳定性问题。**对策**:沿用 V1.9 的 chaos-monitor + verify-freeze 流程。
- **风险 C**:服务器 2 核 3.5G 跑 V2.0 + analyzer 可能内存不足。**对策**:依赖用户升配(已确认负责),analyzer 设单进程内存上限,超限拒绝新事件。

### 9.2 未决问题(需在 W1 内确认)

- **Q1**:V2.0 的 LLM 调用是否需要存调用日志?(便于后续审计和成本归因)倾向"是,简化版,只存 tokens 数和 intent 结果"
- **Q2**:图片消息处理策略?报告 §3 PRD 提到占 1%,本 disposition 默认存档不分析,V2.2 再上 OCR
- **Q3**:V2.0 是否需要"客服直接看后台手动回复"?(类似客服工作台)PRD 没明说。倾向"V2.0 不做,V2.1 做"
- **Q4**:工单 SLA 超时如何提醒?短信 / 邮件 / 后台红点?倾向"V2.0 只做后台红点,后续再加"

---

## 10. 下一步动作

本 disposition 文档确认后,立即产出三份配套实施文件:

1. **`v2.0-schema.sql`** — 8 张 V2.0 新表的完整建表语句 + 索引
2. **`v2.0-api-spec.md`** — 所有 `/api/v2/*` 接口的请求/响应定义
3. **`v2.0-week1-tasks.md`** — W1 给 cc 的逐文件实施清单

合计预估 600-800 行 Markdown + 300 行 SQL,可作为 cc 第一周的工作输入。
