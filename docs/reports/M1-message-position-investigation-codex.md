---
文档: M1 消息稳定位置标识 P 调研
状态: 只调研不实现
日期: 2026-06-04
范围: plugin 采集、server events/messages 入库、admin 消息展示、既有 M1 草稿与 W12.6/dom-collector 报告
---

# M1 消息稳定位置标识 P 调研

## 0. 任务文档状态

仓库内未找到 `M1_position_investigation_tasks.md` 原文,只找到两份未跟踪草稿:

- `docs/reports/M1-message-position-investigation-cc.md`
- `docs/reports/M1-message-position-investigation-cc2.md`

本报告按用户消息里的 Dx1-4 目标重建调研结构,并以当前代码为准复核。

## 1. 结论先行

当前**不能诚实拍 Y**。

原因:现有 DOM/代码证据还没有证明存在“任何采集者都能对同一条消息算出相同值”的逐条稳定位置标识 P。锚点窗口对齐在“单客户端 + 连续观测区段”内可用,但它依赖本地历史状态,跨标签/跨设备/观测间隙时不能保证同一条消息得到同一个 P。

推荐决策:

| 条件 | 结论 | 说明 |
|---|---|---|
| 真机 DOM 发现逐条稳定 token,如 message data-id / data-index / React key 可读 | 推荐 Y | P=DOM token 或由 token 派生;outbound `occurred_at` 可存 NULL;排序和去重都按 P |
| 无逐条 token,但 outbound 也稳定存在真实精确时间且同秒碰撞可控 | 可评估 Y-time | P 可由真实时间+方向+会话内同秒序构成;但仍需验证“两个在吗”同秒连发边界 |
| 无逐条 token,且 outbound 无真实精确时间 | 退 X | 锚点窗口只能做本地连续区段位置,不应宣称全局稳定 P;时间锚点仅用于排序,不要把估算时间当真实时间 |

## 2. Dx1:现有去重与排序机制

### 去重

服务端当前去重只看 `messages.platform_message_id`:

- `eventsController.batch`:读取 `event.message_id || event.platform_message_id` 作为 `platformMessageId`。
- 入库前查 `SELECT id FROM messages WHERE tenant_id=? AND platform_message_id=? LIMIT 1`,存在则 `duplicated++`。
- DB 唯一键是 `UNIQUE KEY uk_tenant_msg (tenant_id, platform_message_id)`。

结论:现有系统里,真正承担去重的 P 就是 `platform_message_id`。

### 排序

消息展示接口按 `occurred_at, id` 排序:

- 普通列表:`ORDER BY occurred_at ASC, id ASC`
- latest 模式:先按 `occurred_at DESC, id DESC` 取最新 N 条,再 reverse。

DB schema 中 `occurred_at DATETIME NOT NULL`,且 `idx_conv_time(conversation_id, occurred_at)` 直接服务排序。

结论:当前排序依赖 `occurred_at`,不是依赖 message_id。M1 要解决的是把“去重 P”和“排序 P”统一成同一个会话内位置标识。

关联文件:

- `server/src/controllers/v1/eventsController.js:18`
- `server/src/controllers/v1/eventsController.js:30`
- `server/sql/v1-schema.sql:53`
- `server/sql/v1-schema.sql:64`
- `server/src/controllers/v1/conversationsController.js:135`

## 3. Dx2:现有 P 为什么不满足 a/b/c

现状 P 生成分两层:

1. adapter `toConversationEvent` 先用 `conversationId + direction + text + occurredAt` 调 `synthMessageId`。
2. `legacy-collector` 随后覆盖 message_id,改用 `conversationId + direction + content_text + seq`。

其中 `seq` 是**单次采集 pass 内**,同一 `(conversation_id, direction, content_text)` 的出现序号。

### 对 a/b/c 的评估

| 要求 | 现状评估 | 原因 |
|---|---|---|
| (a) 幂等:同消息跨采集同 P | 不稳定 | seq 依赖本次 DOM 中同内容消息集合。向上加载历史、窗口变化、同内容旧消息出现在前面时,后面同一条消息 seq 会偏移 |
| (b) 可区分相同内容 | 部分满足 | 同一 pass 内两个“在吗”可得 seq 0/1;但若两个“在吗”分属不同采集窗口且从未同屏,可能都得 seq 0 |
| (c) 可排序 | 不满足 | seq 不用于排序;排序仍靠 `occurred_at`,而 outbound 可能是继承上一条 +1s 的估算时间 |

旧方案 `conversationId + direction + content + 时间到分钟` 已被否定是正确的:同一分钟内两个“在吗”会碰撞,违反“有几条存几条”。当前 seq 版修了一部分同屏重复内容问题,但仍不是稳定位置 P。

关联文件:

- `plugin/shared/dom-utils.js:76`
- `plugin/runtime/legacy-collector.js:91`
- `plugin/adapters/douyin/private-message.adapter.js:442`

## 4. Dx3:当前 DOM/采集里已有的位置线索

### 已有可用线索

| 线索 | 当前用途 | 能否直接做 P |
|---|---|---|
| DOM 顺序 | adapter 扫 `div.my-4`,按 DOM 顺序 push list | 只能表示本次 pass 内顺序,不能跨采集幂等 |
| inbound 隐藏精确时间 | `p.invisible.whitespace-nowrap.absolute`,精确到秒,写入 `raw_snapshot.time_source=precise-invisible` | 可辅助排序,但不能区分同秒相同内容;且 outbound 不一定有 |
| 时间分隔条 anchor | 无逐条时间时继承 anchor + offset | 是估算排序线索,不是稳定身份 |
| raw_snapshot.rect | 只审计用 | 屏幕位置会变,不能做 P |
| direction + content_type + text | 现用于合成 id | 可做锚点匹配特征,但不能作为最终 P |

### 未发现的关键线索

当前代码没有读取消息行级别的稳定属性:

- 未读取消息节点 `data-*`
- 未读取消息节点 `id`
- 未读取 React key
- 未读取平台原生 msg_id

`data-conversation-id/data-session-id/data-id/data-qa-id` 只在会话列表项 `_parseContact` 中尝试读取,不是消息级。

`tools/dom-collector/dom-snapshots/` 当前只有 `.gitkeep`,没有可用于确认 Q1/Q2 的真实快照。也就是说,目前无法从仓库证据证明“逐条消息稳定 token 存在”。

关联文件:

- `plugin/adapters/douyin/private-message.adapter.js:109`
- `plugin/adapters/douyin/private-message.adapter.js:165`
- `plugin/adapters/douyin/private-message.adapter.js:219`
- `plugin/adapters/douyin/private-message.adapter.js:315`
- `tools/dom-collector/dom-snapshots/.gitkeep`

## 5. Dx4:锚点窗口对齐可行性

### 算法设想

把每条 DOM 消息先归一成用于匹配的特征,例如:

```text
F = direction + content_type + normalized_text + precise_time_if_true + divider_context
```

持久化每个 conversation 的已采序列:

```text
[{ position, F, message_id, confidence }]
```

本次采集时:

1. 从本次 DOM 消息序列中取连续 3-5 条作为窗口。
2. 在已采序列中找唯一匹配窗口。
3. 命中后,窗口之后的新消息按 `anchor_position + offset` 接续编号。
4. 最终 `P = hash(conversation_id + position)` 或直接 `conversation_id + position`。

### 对 a/b/c 的理论评估

| 要求 | 在单端连续观测区段内 | 说明 |
|---|---|---|
| (a) 幂等 | 可以 | 锚点命中后,已见消息不重新编号,新消息只向后接续 |
| (b) 可区分相同内容 | 可以 | 两个“在吗”占不同 position,不靠内容去重 |
| (c) 可排序 | 可以 | position 是会话内全序,天然可排序 |

### 失败模式

| 失败模式 | 影响 | 降级 |
|---|---|---|
| 无重叠窗口 | 无法知道新 DOM 片段接在已知序列哪里 | 不上传低置信新增;或开新 segment,但不能宣称全局 position |
| 锚点窗口重复 | 多段连续 3-5 条完全相同,匹配歧义 | 加宽窗口、引入 direction/time/divider、仍歧义则跳过 |
| 撤回/删除/编辑 | 已采锚点消失或文本变更 | 做容错匹配,但会降低置信度 |
| 半渲染/滚动中采集 | DOM 序列不完整 | 利用现有 debounce,低置信时跳过 |
| 多标签/多设备同时采同一会话 | 本地 position 历史不同,同消息可能得到不同 P | 锚点窗口本身不能解决;需要 DOM token 或服务端序列归并 |
| 未观测间隙 | 两段都真实存在,但中间消息从未被任何 pass 看到 | 绝对 position 不可恢复,只能分段或退回时间排序 |

### 关键判断

锚点窗口是“局部序列对齐算法”,不是“全局稳定身份来源”。它能降低重复和误删,但不能凭空创造跨客户端一致的 P。

所以:

- 如果业务承诺只有单客户端/单标签持续采集同一个会话,锚点窗口可作为工程上可用的 Y-lite。
- 如果要满足严格 a/b/c,尤其跨采集者幂等,必须有 DOM 可观测稳定 token,或服务端有足够强的归并逻辑。

## 6. Y / X 方案判断

### Y 成立条件

Y 的必要条件是能造出真正稳定 P:

```text
同一条消息在任意采集 pass、任意采集客户端中,P 都一致;
两条相同内容消息 P 不同;
P 能表达稳定顺序。
```

当前仓库证据不足以证明这一点。要拍 Y,需要先真机补证据:

1. 抓一段含 inbound/outbound、连续重复文本、滚动前后重采的 DOM。
2. 检查每条消息行或其祖先是否有稳定 token。
3. 检查 outbound 是否也有隐藏精确时间。
4. 刷新/重新加载/重复采集后,同一条消息 token 是否不变。

若 Y 成立,推荐数据契约:

- 新增 `messages.position_key` 或 `message_position`
- `occurred_at` 允许 NULL,至少 outbound 不写估算时间
- 排序按 `message_position ASC, id ASC`
- `platform_message_id` 改为基于 P,不再包含 content

这会改 events API、schema、server 查询、前端展示和 analyzer 上下文排序,属于 B/C 类数据契约变更。

### 当前更诚实的结论

在未证明逐条稳定 token 前,我建议**不要拍 Y**。

默认应退 X:

- 保留真实 inbound 时间用于排序。
- outbound / 缺时间消息继续用时间锚点仅作排序辅助,但在 `raw_snapshot.time_estimated=true` 明确标记,不要对外宣称是真实发生时间。
- 去重不要再回到“内容+分钟”;若要优化,可以先做锚点窗口的本地 position 去重,但要把它标成“单端连续观测区段内可靠”,不是全局稳定 P。

## 7. 需要 Chase 配合确认的最小真机实验

请用 dom-collector 或 DevTools 对真实抖音私信做一轮只读采样:

1. 选一段包含连续 outbound、连续 inbound、至少两条相同内容的会话。
2. 对每条消息行输出:
   - 消息文本
   - direction
   - 消息行元素及 3 层祖先的所有 attributes
   - 隐藏时间节点文本与所在祖先路径
   - DOM index
3. 刷新页面或重新打开会话后再采一次同一段。
4. 比较同一条消息是否存在稳定 token。

判定:

- 若发现稳定 token:走 Y。
- 若没 token但 outbound 有真实精确时间:再评估 Y-time。
- 若都没有:退 X,不要硬造 Y。

## 8. 本次未做

- 未修改 plugin/server/admin 代码。
- 未改 schema。
- 未清理旧 M1 草稿或 `tools/` 未跟踪文件。
- 未做真实浏览器 DOM 采样。
