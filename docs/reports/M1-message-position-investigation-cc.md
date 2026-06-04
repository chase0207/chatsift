# M1 调研报告：消息稳定位置标识 P（排序 + 去重）

> 只读调研，不实现、不改代码。调研时所在分支 `w16-platform-tenant-split`。
> 结论待 Chase 定方案（Y / X），本报告不含实现。

## 0. 范围与一处偏差
- 任务文档 `M1_position_investigation_tasks.md` 在 `main` 与 `w16` 均不存在（git 全分支未找到）。本报告依据任务消息里的纲要展开（P 的 a/b/c、锚点窗口对齐、去重硬原则、Y/X 框架）；其中 Dx1–4 按纲要重建为下列四个调研问题，若原文 Dx1–4 子项有出入，请提供原文再对齐。

## 1. 等价性确认：排序 == 去重 == 同一个 P
两者都要"消息在对话内的稳定位置标识 P"，满足 (a) 幂等 / (b) 可区分同内容 / (c) 可排序。代码实证两者确实同源：
- **去重**完全靠 `messages.platform_message_id` 唯一键 `uk_tenant_msg`（eventsController.js:30-37 先查重，存在即 `duplicated++` 跳过）。→ P 即 `platform_message_id`。
- **排序**完全靠 `occurred_at`（schema `idx_conv_time(conversation_id, occurred_at)`；messages 查询 `ORDER BY occurred_at, id`）。→ P 若自带顺序即可替代 occurred_at 排序。

## 2. 现状机制（代码实证）
**P 现状 = `syn_ + simpleHash(conversationId | direction | content_text | "seq:"+seq)`**
- `seq` = `_seqMap[conv|dir|text]`，在**单次采集 pass** 内对"同会话+同方向+同文本"的出现序号（legacy-collector.js:93-104 / 构建后 content.js:4383）。
- adapter `toConversationEvent` 先用 `occurredAt` 算一版 id（private-message.adapter.js:457），随后被 collector 用 **seq 版覆盖**，最终入库是 seq 版。
- 无 seq 时 `synthMessageId` 退化到"时间到分钟"（dom-utils.js:84-88）——旧口径，已被否定。
- `occurred_at`：inbound 读每条**隐藏精确时间**（class 含 `invisible`+`whitespace-nowrap`+`absolute`、正则到**秒**，adapter:315-326，`time_source=precise-invisible`）；读不到时（客服 outbound，或读不到隐藏时间的客户消息）→ **继承上一条 +1s**（source `inherited`，:405-408）→ 分隔条锚点 → 采集当刻。**即 outbound 时间是合成的（+1s），非真实**——这正是 Y 想消除的"假时间入库"。
- **DOM 无任何逐条消息稳定 id**：adapter 仅在**会话（列表项）级**读 `data-conversation-id/...`（:117）；**消息行**（`div.my-4`）只读到 文本/时间/方向/客服名/rect，未读任何 `data-*` / `id` / `key`。

## 3. 现状 P 对 a/b/c 评估
- **(a) 幂等 — 不稳**。seq 仅在"当前 DOM 窗口内同内容相对序"稳定。抖音私信是**虚拟滚动**，窗口随滚动增删。某次 pass 看到的同内容集合比上次多/少一条，同一条"在吗"的 seq 偏移 → 新 id → **同消息重复入库**。
- **(b) 可区分 — 部分**。同一 pass 内 2 条"在吗"得 seq 0/1 → 不同 id ✓；但两条若从不在同一 DOM 窗口共存（一条已滚出、另一条才载入），各自 pass 都得 seq 0 → 同 id → 第二条被误判 `duplicated` **丢弃**，违反"有几条存几条"。
- **(c) 可排序 —** seq 不参与排序；排序仍靠 occurred_at，而 outbound 的 occurred_at 是 +1s 合成、精度到秒还可能并列 → 合成段/同秒顺序不可靠。

结论：现状把幂等与可区分耦合进"内容+窗口内序号"，在虚拟滚动边界处**既可能重复又可能丢失**，且排序依赖被合成的时间。

## 4. 锚点窗口对齐 评估（核心）
思路：弃"当前 pass 内出现序"，给每条消息**会话内全局位置序号 gIdx**。持久化每会话已采序列（或尾部 3–5 条 direction+text 作锚点 + 高水位 gIdx）；每 pass 在当前 DOM 有序消息中定位锚点窗口（连续子序列），其后为新消息、gIdx 续编；`P = f(conversationId, gIdx)`，**纯位置、与内容无关**。
- (a) 幂等 ✓：锚点命中则不重编其及之前、只向后编；无新消息→锚点落末尾→零新增。
- (b) 可区分 ✓：两条"在吗"位置不同→gIdx 不同→不同 P，靠位置不靠内容，满足硬原则。
- (c) 可排序 ✓：gIdx 本身即会话内全序，server 可直接按它排，**不再依赖 occurred_at**（相对 X 的最大收益）。

逻辑上 a/b/c 可成立，但有**硬失败模式 + 根本边界**，诚实列出：
- **F1 无重叠/冷启动**：两 pass 的 DOM 窗口无共同消息（跳顶长历史、刷新只载最新 20、久未采）→ 锚点定位失败。降级：(i) 持久化**全量已采序列**（文本量小，可行）对齐任意重叠窗口；(ii) 真存在"未观测间隙"（两段之间消息从未被任何 pass 看到）时，gIdx 在间隙处**不可知**（新段是第 50 还是第 80 位无法判定）。→ **根本边界：位置只在"连续观测区段"内良定义；跨观测间隙的绝对位置不可恢复。**
- **F2 锚点歧义**：短锚点子序列（连续多条"在吗"）可能多处匹配。缓解：窗口 3–5、含 direction 模式、取最末/最长唯一匹配；仍多处则加宽或降级。
- **F3 撤回/删除/编辑**：抖音可撤回，已采锚点在 DOM 消失 → 子序列错位。缓解：允许 K 处容错失配或重锚。
- **F4 滚动中半渲染**：虚拟列表快滚捕获残缺/乱序窗口。缓解：已有 MutationObserver+debounce，仅列表稳定后提交；低置信匹配跳过。
- **F5 跨客户端不确定（致命点）**：若 gIdx 是**客户端私有自增计数器**，多标签/多设备/换机对同一条算出不同 gIdx → server 出现重复。**真正的幂等(a) 要求 P 是"任何观测者对同一 DOM 都算出相同值"的纯函数**，客户端私有计数器不满足。→ 要么 server 另立依据归并（退回识别问题），要么 P 必须由 DOM 可观测内容**确定性导出**，而非客户端历史。

## 5. 关键空缺（决定 Y/X 的唯一经验事实）
F5 把问题逼到两个**经验性 DOM 事实**，代码读不出、必须真机抓 DOM 才能定（`tools/dom-collector` 的 `dom-snapshots/` 现为空，无样本）：
- **Q1**：抖音私信**逐条消息行**是否带任一稳定且观测者一致的 token（隐藏 id / data-index / React key / 其它 data-*）？代码现在一个都没读。**若存在 → P=该 token，a/b/c 立即满足，无需锚点窗口，Y 直接成立。**
- **Q2**：隐藏精确时间（到秒）是否对 **outbound 客服消息**也稳定存在？代码注释与 W12.6 现状是"outbound 常无"。**若 outbound 也有 → P=f(conv, preciseTime, dir, text) 是纯 DOM 函数，a/c 皆真，仅同秒同内容连发碰撞（叠 pass 内序兜底），Y 基本成立。**

现有证据：① 消息行无逐条 id（代码实证，但无样本反证 Q1 隐藏 token）；② 精确时间到秒、inbound 稳定 / outbound 不稳定（代码+注释）；③ 持久化基建已有（plugin 多处用 `chrome.storage`），锚点窗口持久化技术可行。

## 6. 结论（条件式，诚实）
- **Q1 成立**（逐条稳定 token）→ **Y**，且比锚点窗口更干净：P=DOM token，outbound `occurred_at` 存 NULL，排序按 token/位置，库里不存合成时间。
- **Q1 否、Q2 成立**（outbound 也有到秒精确时间）→ **Y（时间版）**：P 与排序用真实精确时间，occurred_at 全真；同秒同内容连发用 pass 内序兜底区分。
- **Q1/Q2 皆否** → 锚点窗口能在"**单客户端、连续观测区段**"内做出满足 a/b/c 的位置 P，但受 **F1（观测间隙绝对位置不可知）+ F5（跨客户端不确定）** 两条根本边界限制。此时退 **X**：occurred_at 继续借时间**仅供排序**（承认 outbound +1s 为合成、非真实，不对外当真实），去重改为"位置 P（单端 gIdx）+ 现唯一键"。**不建议宣称"已造出全局稳定 P"**——它只在单端连续区段成立，跨端/跨间隙不成立，硬说 Y 不诚实。

**当前不足以拍 Y**：Q1/Q2 是唯一卡点，必须真机抓一段含连续 outbound 的私信 DOM 验证后才能定。

## 7. 建议下一步（待 Chase 定方案，本步不实现）
1. 用 `tools/dom-collector` 抓真实私信 DOM（**必须含连续 outbound**），验 Q1（逐条 token）/Q2（outbound 精确时间）。
2. 据结果二选一：Y（有 token 或 outbound 真时间）/ X（借时间排序 + 单端位置去重）。
3. 若走 Y 且选位置序：schema 需放开 `messages.occurred_at NOT NULL`（改 nullable）、加 `position` 列与 `(conversation_id, position)` 排序索引/唯一键——属 **B 类（数据契约）**变更，定方案时一并确认。

## 验证（本调研无代码，故无运行验证；下一步的验证方式）
- 抓 DOM 后：`grep` 消息行全部属性，确认有无逐条稳定 token；统计 outbound 行命中 `invisible+whitespace-nowrap+absolute` 到秒时间的比例（≥某阈值才视 Q2 成立）。
