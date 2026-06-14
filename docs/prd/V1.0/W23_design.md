---
文档: W23 技术方案(DEV)— position re-align 可恢复采集与重复消息治理
版本: v0.1.0(待 Chase 审)
周次: W23
状态: Draft-技术方案
日期: 2026-06-14
目标版本: v0.6.8
对应 PRD: docs/prd/V1.0/W23_position_realign_recovery.md(Codex/PM, v1.0.0)
负责人: CC(DEV)
---

# W23 技术方案：基于真机 DOM 的根因定位 + 止血 + 分阶段

> **【W23 已废弃 — 2026-06-15 收口】**
> - 本地验收**未通过**。
> - W23 业务代码实现**已废弃**,不合并 main,不作为 W24 实现基础。
> - **未发布** test / prod / github;版本未 bump(0.6.8 bump 已回退)。
> - 业务代码提交 `5465fca` 留在分支 `w23-position-realign`,**不合并、不 cherry-pick**。
> - 本文档仅保留为 position re-align / duplicate guard 的**诊断资料与后续(W24)参考**。

> 本文回答 PRD §10.3 的 7 个 DEV 必答问题，并纳入 2026-06-14 真机 DOM 新证据。
> position 改动属 C 类，**本方案先过审，过审后才写代码**。

## 0. 头号发现（改变范围）：v0.6.7 的 csUI 适配打错了靶子

- 2026-06-14 真机 DOM（空月/1号客服「客服接待模式」，附件 `0614-1号客服-html.txt`，消息时间今天 09:18–09:20，prod）里 **0 处 `csUI-MessageItem / csUI-MsgTimeGap / csUI-Text / csUI-NormalMessage`**。
- 该接待页消息区结构是 **`div.my-4` + `px-3 py-2`**，inbound=`flex-row`/`leftMsg-*`、outbound=`flex-row-reverse self-end`/`rightMsg-*`，时间条=`div.px-4 text-xs text-center text-gray-2 my-4`。**与 life 私信页同构**。
- 即：本租户接待模式走的是 **life/my-4 扫描器**，v0.6.7 新增的 `_scanCsuiMessages` 对它**永不命中、是死代码**（`getMessages` 先判 my-4，命中即返回）。
- v0.6.7 任务文档（done/2026-06-11…）§2.4 自己已警告「接待模式不是单一 DOM，至少有 csUI 与 life/my-4 两变体；未确认真机 csUI 前禁止写 csUI，应优先修 life/my-4 + position」。**实际却写了 csUI**，所以"自从 v0.6.7 问题仍在"——因为真正该修的 life/position 一行没动。
- 结论：W23/v0.6.8 的修复对象是 **position-tracker + life/my-4 接待采集**，不是 csUI。csUI 扫描器对 csUI-变体租户（新手驾到）仍可能有用，**保留不动**（my-4 优先，对本租户无副作用）。

## 1. 四个反馈逐条根因（真机 DOM 实证）

### ① 历史消息重复（内容级重复入库）— 核心
- 链路：`message_id = hash(conversationId|position)`（content.js:444），去重只认 position。
- 根因：position-tracker **本地路径** `computeAssignments` 在 `findOffset` 返回 null 时走 **degrade**：把当前可见消息**全部续编新 position 并 append 进 seq**（position-tracker.js:73-79）→ 新 position → 新 message_id → server `SELECT id` 查不到 → 当新消息 INSERT（eventsController:43-47、124）→ **同内容不同 position 入库**。
- 触发条件：① 自动招呼语等**重复内容**使锚点窗口非唯一 → findOffset null；② 虚拟滚动/半渲染导致当前 DOM 窗口与已采 seq 无法对齐。
- 自我放大：append 后本地 seq 也带重复 → 下次更难锚定 → 更多 degrade。
- 对照：**冷启动 re-align** 路径遇 degrade 是 **skip**（`realign-no-anchor`，assign:176-179，安全但卡住）；**本地**路径遇 degrade 是 **append**（不安全）。两条路径对同一件事处理不一致 = bug 根。

### ② 时间分隔条缺失
- admin 分隔条只认 `raw_snapshot.divider_text`（MessageDrawer.vue:55 等四处）。
- life 扫描器对真机 DOM 的分隔条 `div.px-4 text-xs text-center text-gray-2 my-4`（如 `2026-06-13 09:08`）**能正确解析**（无 `px-3 py-2` 文本节点 → 视为系统行 → `_parseOccurredAt` → 挂到下一条 `divider_text`）。干净一轮里分隔条不丢。
- 真正成因（次要）：(a) ① 的 degrade/重复打乱后，重采副本带的是当轮 pendingDivider 状态（可能空）→ 出现"无分隔条的重复条"；(b) dedup 是"存在即跳过、**不回填**"（eventsController:43-47），**某条先于其分隔条可见时首采，分隔条永不补回**。
- 你的口径（Q1）：每页仅 20 条，第 1 个分隔条猜不到就**别猜**；后续都有。→ 现状本就不伪造（只从真实分隔条取）。**修好 ① 后 ② 基本随之消失**；(b) 仅命中"会话最早一段"，正是你接受可缺的那条。

### ③ 客服自动打招呼很多
- 真机里 outbound「早上好」「很高兴为您服务，有什么可以帮您」各出现 2 次（每次客户来消息系统自动招呼）。
- 你的口径（Q1）：**采、1:1、无需标记**（是对话框真实内容）。→ **不是 bug、不过滤**。life 扫描器对它们方向（outbound）、无逐条精确时间（occurred_at=NULL）判定均正确。
- 但它们正是 ① degrade 的触发内容 → 由 ① 的修复覆盖。

### ④ 其它发现
- **排序**：server 消息排序键是 `segment_at ASC, position ASC, id ASC`（conversationsController.js:139），**不依赖 occurred_at**，故 outbound 的 NULL 时间**不破坏排序**。1:1 排序正确性 = segment_at + position 两值是否稳（① 保证 position 稳）。
- **评价消息卡片**：`[评价消息卡片]` 文本节点是 `p-2`（非 `px-3 py-2`），life 扫描器抽不到文本 → 当系统行丢弃。按你 Q2（降级/模糊宁可丢）**保留丢弃**。副作用：它会把 currentAnchor 重置，但其后即是新分隔条，影响可忽略。
- **方向判定**：真机 my-4 接待 inbound/outbound 判定已验证正确（`flex-row-reverse|self`→outbound；`leftMsg`/`flex-row`→inbound）。
- **bubble 兜底隐患**：`_scanLegacyBubbleMessages` 用 `_extractMessageText(el) || Dom.getText(el)`（adapter:214），对分隔条 my-4 会把 `Dom.getText`=时间文本当消息采。仅当某轮 life 扫描返回空才会落到它（本租户 csuiItems=0、my4 有消息，不触），但属脆弱点，方案内顺手收紧。

## 2. 回答 PRD §10.3 的 7 个 DEV 必答问题

1. **realign-no-anchor 恢复算法**：本地与冷启动**统一**——无唯一锚点一律 **不 append、本轮 skip**，保留旧 state 等待下一轮；恢复手段=① 扩大 server recent 窗口（position-state limit 30→更大/全量 key）②等 DOM 稳定（既有 debounce）后重试。多次失败计数 → 进 `recovering`/`blocked_no_anchor`（状态字段，见 §3 分阶段）。
2. **允许上传 vs 必须 skip**：仅 `cold`（server 确认无历史的首采）与 `aligned`（锚点命中）允许上传；任何 `degrade`（本地或 re-align）**一律 skip，绝不 append 不可信 position**。
3. **区分真实重复 vs 同 DOM 重复命中**：真实重复=`aligned` 下不同 DOM 节点各得不同 position（锚点成立）→ 两条都留（不按内容删）；同 DOM 重复命中=**单轮内**同 `direction+content+rect+time_meta` 候选去重后再分配 position（PRD §6.4 / D1）。my-4 单选择器无双命中，风险在 csUI/bubble。
4. **是否新增诊断表**：v0.6.8 核心**不加 schema**；用结构化日志（`raw_snapshot.position_source/position_origin` + reason + fail_count）。诊断表/后台诊断页=分阶段（PRD Q1 默认：先最小/结构化日志）。
5. **W21 联动**：skip/recovering 的会话**不记自动切换成功**、进冷却（分阶段，先打标记不改 W21 节奏）。
6. **验证不重复入库历史**：node 单测用真机 DOM 做 fixture，多轮回放（cold → 底部+新消息 → 顶部加载历史 → 重复招呼轮）断言稳定消息 position 不被重编、degrade 轮返回 skip、无新增同内容 position。
7. **验证真实重复保留**：fixture 造"连发两条相同内容"（aligned，位置不同）断言两条都在、position 不同。

## 3. 实现方案 + 分阶段（建议）

**阶段一 · 止血（v0.6.8 核心，本方案请求过审项）**
- 改 `position-tracker.js`：`computeAssignments` 本地 degrade 分支由 **append 改为返回 `mode:'degrade'` 且不修改 seq**；`assign()` 本地路径遇 `degrade` → `return {skip:true, reason:'local-degrade-no-anchor'}`（与冷启动 `realign-no-anchor` 一致）。collector 已能消费 skip（content.js:5160）。
- （可选、低风险）`findOffset` 锚点窗口加宽（如 `[8,6,5,4,3]`）减少正常会话的误 skip。
- 收紧 bubble 兜底：`_extractMessageText(el) || Dom.getText(el)` 的 `||` 兜底去掉或加"像时间文本则跳过"，避免分隔条被当消息。
- 重建 content.js（`npm run build:plugin`）+ node 单测（问题 6/7 的 fixture）。
- **效果**：① 内容级重复**停止新增**；② 随之基本消失；③ 按 Q1 原样采。

**阶段二 · 可恢复 + 可见（v0.6.8 或 v0.6.9，按你定）**
- recent 窗口扩大/全量 key 重试；fail_count + `recovering/needs_user_action/blocked_no_anchor` 状态（PRD §5）；插件面板文案（PRD §6.6）；W21 联动冷却（PRD §6.5）。

**阶段三 · 存量 prod 重复清理（C 类，需你在场 go）**
- 先只读统计影响面（同 conv 同 direction+content 多 position 的会话数/行数），再按"保留最小 position、其余归并"清理。**不自动改写历史**（PRD §8.1/D4）。Q4 你已授权我做 prod 只读核验，但 SSH 读生产被安全门拦，需你加一条 Bash 放行或我把只读 SQL 给你跑。

## 4. C 类变更点（先过审）
- **position-tracker 本地 degrade：append → skip**（采集数据契约行为变更）。这是唯一硬 C 类。无 schema 改动。
- 其余（窗口加宽、bubble 兜底收紧、单测）属 A 类实现细节。

## 5. 验证方式
- node 单测（纯函数 `findOffset/computeAssignments` + 真机 DOM fixture 多轮回放）。
- test 环境装插件、打开同一接待会话，对照"重复不再新增 / 分隔条还原 / 招呼语 1:1 / 顺序正确"。
- 不在 prod 直接验证写入；prod 仅只读核验存量（阶段三）。

---

## 6. 实现记录(2026-06-14,Chase 批准全量 W23 + position C 类改动)

分支 `w23-position-realign`(自 main),目标版本 v0.6.8。**未 commit、未上 test/prod**,待 Chase 验。

### 6.1 改动清单
| 文件 | 改动 | 阶段 |
|---|---|---|
| `plugin/runtime/position-tracker.js` | ① `findOffset` 窗口 `[5,4,3]`→`[8,6,5,4,3]`;② `computeAssignments` 本地 degrade **不再续编/不改 seq**;③ `assign` 重写为恢复主线:本地对齐失败→server 再播种(扩窗 200)重试→仍无锚点进恢复态;④ 新增恢复态存储 `w23rec_*`(fail_count + status)、`_recover`、`_finish`、`_statusFor`、阈值常量 | ①② |
| `plugin/adapters/douyin/private-message.adapter.js` | bubble 兜底去掉 `||Dom.getText(el)`,无气泡文本节点跳过(防分隔条被当消息) | ① |
| `plugin/runtime/legacy-collector.js` | skip 分支写结构化诊断日志(reason/status/fail_count/conversation_id)+ 写 `w23_collect_status`;成功写 ok;返回带 status | ②⑧ |
| `plugin/runtime/assisted-collector.js` | W21:`blocked_no_anchor` 会话不记成功 + 5min 冷却 `_convCooldown`;`_planCandidates` 过滤冷却会话 | ⑦ |
| `plugin/popup/popup.{html,js,css}` | 平台面板新增采集状态行 `#collectStatusLine`,读 `w23_collect_status` 映射 §6.6 三态文案 + 配色 | ⑥ |
| `server/src/controllers/v1/conversationsController.js` | position-state limit 上限 100→200(恢复扩窗,只读) | ② |
| `plugin/test/position-tracker*.test.js` | 新增 node 单测(止血 6/6 + 恢复模型 5/5) | — |

### 6.2 5 态映射(PRD §5)
- `first_collect`=本地&server 均无 → 从 0 采;`aligned`=本地或 server 锚点命中 → 采、清恢复态;
- `recovering`(fail_count≤2)/`needs_user_action`(≤5)/`blocked_no_anchor`(>5)=无锚点,**不上传不可信 position**,面板提示,W21 冷却。

### 6.3 验证
- `node plugin/test/position-tracker.test.js` → PASS 6/6(冷启/幂等/底部新增/**degrade 不续编**/真实重复保留/加宽对齐)。
- `node plugin/test/position-tracker.recovery.test.js` → PASS 5/5(首采/幂等/降级→recovering→needs_user_action/成功清零/网络失败 skip)。
- 7 个改动文件 `node --check` 全过;`npm run build:plugin` 重建 content.js 成功。
- **待 Chase**:test 环境真机验(重复不再新增 / 分隔条还原 / 招呼语 1:1 / 顺序正确 / 面板状态)。

### 6.4 §10.3 七问落地对照
1 恢复算法=本地失败转 server 扩窗再播种;2 仅 cold/aligned 上传,任何 degrade skip;3 真实重复=aligned 不同 position 都留,单 DOM 重复=单轮去重(my-4 无双命中);4 不加 schema、用结构化日志 + `w23_collect_status`;5 W21 blocked 冷却;6/7 单测覆盖。

### 6.5 范围边界与未完
- **v0.6.8 目标**(Chase 2026-06-14 确认)= 阻止新增问题 + 可诊断 + 可恢复。**不含历史重复数据清理**。
- **阶段三 存量 prod 重复清理 = 单独立任务,不在 v0.6.8**:涉及生产数据改写,必须另起方案 + 只读核验 + 备份 + 用户在场 go。参考只读核验 SQL(同会话同方向+内容多 position):
  ```sql
  SELECT conversation_id, direction, content_text, COUNT(*) c, GROUP_CONCAT(position ORDER BY position) ps
  FROM messages WHERE tenant_id = ? GROUP BY conversation_id, direction, content_text
  HAVING c > 1 AND COUNT(DISTINCT position) = c ORDER BY c DESC LIMIT 50;
  ```
- 后台诊断页/会话侧栏展示(PRD Q4)= 顺延(本版只到结构化日志 + 插件面板)。
