-----

## 文档: W4 设计说明 — 插件采集链路(Round 1)
版本: v2.1.0
周次: W4
状态: Active

## 变更日志

|版本    |日期        |变更摘要                                                                    |触发来源       |
|------|----------|------------------------------------------------------------------------|-----------|
|v2.1.0|2026-05-30|4.1 发送方法改为保留不删(W5 再删);5.2 改为新增独立 event-queue.js 不碰 queue-manager;数据流图同步 |执行端 B 类反馈  |
|v2.0.0|2026-05-30|技术路线大改:放弃 chrome.debugger 网络拦截,改为纯 DOM + 合成 ID;新增 4.5 节 XPath 提取(吸收竞品方案)|用户决策(竞品调研后)|
|v1.0.0|2026-05-30|初版,基于”优先用平台原生 message_id”的假设                                            |Claude 设计  |

-----

# Chatsift W4 设计说明:插件采集链路(Round 1)

> **周次**:W4
> **范围**:插件从”自动回复客户端”改造为”只读采集探针”,真实抖音消息流入服务端
> **关联**:runtime-disposition.md 第 2/3 节、MIGRATED_FROM_CHAT_RPA.md、v1-api-spec.md 第 1 节
> **策略**:Round 1 —— 新采集链路与 legacy 并存,用 feature flag 切换,不删旧代码
> **本周不做**:不删 legacy(那是 W5)、不做 DOM scope 重构(W10)、只支持抖音

-----

## 1. W4 在整个插件改造里的位置

runtime-disposition 第 2.4 节定了插件改造分三轮:

```
Round 1 (W4):  新增 collectMessageSession,与旧 processMessageSession 并存,flag 切换
Round 2 (W5):  flag 切到新链路,删除 decideReply/sendReply/processMessageSession/浮窗
Round 3 (W10): 把保留的采集代码迁出 content_legacy,DOM scope 落地,删 content_legacy
```

W4 是 Round 1。核心原则是**只增不删**:新写一条采集链路,通过 feature flag 与旧的自动回复链路并存。flag 关闭时插件行为和现在完全一样(自动回复),flag 打开时走新的纯采集链路(不发送)。这样 W4 即使有问题,关掉 flag 就回到已知可用状态,风险可控。

-----

## 2. 采集链路的数据流

```
抖音页面 DOM 变化
  ↓ MutationObserver(已有,来自 legacy)
检测到新消息
  ↓
adapter.getMessages() 读取当前会话消息  ← 改造:输出 ConversationEvent[]
  ↓
adapter.toConversationEvent() 标准化     ← 新增方法
  ↓
EventCollector.collect(events)           ← 新增:去重 + 入队
  ↓
EventQueue(内存 + chrome.storage 持久化) ← 新增 event-queue.js(不改 queue-manager)
  ↓
EventUploader 批量上报                    ← 新增:HTTP POST /api/v1/events/batch
  ↓
服务端 events/batch(W1 已验证)
```

对比旧链路(processMessageSession):旧链路在 getMessages 之后是 decideReply → sendReply(发送),新链路在 getMessages 之后是 toConversationEvent → collect → upload(采集上报)。**分叉点就在 getMessages 之后**。

-----

## 3. ConversationEvent 数据契约

这是插件和服务端之间的标准格式,必须和 v1-api-spec 1.1 节、events/batch 接口完全一致:

```javascript
{
  platform: 'douyin',                    // 固定
  platform_page: 'laike-message',        // adapter key 的页面部分
  conversation_id: '<会话标识>',          // adapter 从 DOM 提取(昵称/会话位置)
  message_id: '<合成ID>',                 // 去重关键,合成:见第 3.1 节
  direction: 'inbound' | 'outbound',     // classifyMessage 判断
  sender_nickname: '<昵称>',
  content_type: 'text' | 'image' | 'card' | 'system',
  content_text: '<文本内容>',
  content_url: null,                     // 图片/卡片 URL,W4 文本为主
  occurred_at: '<ISO8601 时间>'          // 消息时间,取不到用采集时间
}
```

### 3.1 message_id 用合成 ID(已定路线)

**抖音 DOM 不暴露平台消息 ID**。经调研确认:抖音来客的消息气泡 DOM 上没有 data-id / data-msg-id 这类明文属性,class 是动态随机串(如 vgonMAXk)。平台真实的 msg_id 只存在于网络接口响应和前端 JS 内存里,content script 拿不到。

理论上可以用 chrome.debugger 拦截网络响应拿到真实 msg_id,但**本项目明确不走这条路**。原因有三:一是 debugger 权限会让浏览器顶部常驻黄色警告条(“正在调试此浏览器”),对企业客服用户是劝退级体验,且是风控强信号;二是竞品调研发现(见下),一个成熟的商业竞品装了 debugger 却没真正用于消息采集,它的采集是纯 DOM,说明纯 DOM 方案商业可行;三是 chatsift 是 Observe First 静默采集,debugger 完全反方向。

**因此 message_id 采用合成 ID**:

```
message_id = hash(conversation_id + direction + content_text + 时间到分钟)
```

合成规则:把会话标识、方向、消息内容、occurred_at 截断到分钟,拼接后做一个稳定 hash(如简单的字符串 hash 或 SHA-1 取前 16 位)。同一条消息无论被 MutationObserver 触发几次重读,合成出的 ID 都一样,从而实现去重。

合成 ID 的已知局限:用户在同一分钟内发送两条完全相同的内容(如连发两个”在吗”),会被合成为同一 ID 而漏采第二条。这是可接受的取舍——客服场景下同分钟同内容重复消息极少,且漏采一条重复内容不影响意图判断。竞品连去重都不做(靠人工看),我们做到分钟级合成已经更讲究。

> 竞品佐证:wolfRPA(商业付费插件)manifest 申请了 debugger 权限、background.js 用 Network.getResponseBody 拦截响应,但 content.js 没有任何地方消费这些响应,真实的 nickname/content 提取全部走 DOM XPath。即网络拦截是半成品,商业产品实际靠纯 DOM 采集赚钱。

-----

## 4. 改造抖音 adapter

三个 adapter(laike-message / feige / private-message)迁移时已标 TODO。W4 落实:

### 4.1 发送相关方法:保留不删,collector 路径不调用

W4 是 Round 1,**一个方法都不删**。原 chat_rpa 的发送方法(prepareReply / sendReply / buildBatch)全部原样保留,只是新的 collector 采集路径不调用它们。删除动作整个推迟到 W5(Round 2 切 flag 时)。

```
prepareReply()  → 保留(W5 删),collector 路径不调用
sendReply()     → 保留(W5 删),collector 路径不调用
buildBatch()    → 保留(W5 删),collector 路径改用 EventCollector,不调 buildBatch
```

特别注意:self-check.js 里有 sendlock 自检依赖 sendReply 的存在,直接删会让自检失效。这是必须保留到 W5 的具体原因之一。W4 删任何方法都可能踩到旧链路或自检的隐藏依赖,所以 Round 1 的安全做法就是零删除。

### 4.2 保留采集相关方法

```
matchPage()           保留:判断当前页面是否本 adapter 负责
detectSessions()      保留:检测会话列表
getMessages()         改造:返回标准化的消息数组(见 4.3)
classifyMessage()     保留:判断 inbound/outbound
_parseContact()       保留:解析联系人
confirmActiveSession() 保留:确认当前激活会话
switchSession()       保留但 W4 不主动调用(采集只读当前激活会话,不主动切换,避免副作用)
```

### 4.3 新增 toConversationEvent 方法

每个 adapter 加一个方法,把它 getMessages 返回的平台原始消息映射为 ConversationEvent:

```javascript
toConversationEvent(rawMsg, sessionInfo) {
  const occurredAt = rawMsg.time || new Date().toISOString();
  return {
    platform: 'douyin',
    platform_page: 'laike-message',       // 每个 adapter 写自己的
    conversation_id: sessionInfo.conversationId,
    message_id: synthMessageId({          // 合成 ID,见 3.1 节
      conversationId: sessionInfo.conversationId,
      direction: this.classifyMessage(rawMsg),
      text: rawMsg.text,
      occurredAt
    }),
    direction: this.classifyMessage(rawMsg),  // 复用已有方法
    sender_nickname: sessionInfo.nickname,
    content_type: rawMsg.type || 'text',
    content_text: rawMsg.text,
    content_url: rawMsg.url || null,
    occurred_at: occurredAt
  };
}
```

### 4.4 采集只读原则

W4 的采集**不主动切换会话**。旧链路为了逐个回复会主动 switchSession 遍历所有会话,新链路只采集”当前用户正在看的那个激活会话”的消息。原因:主动切换会话是写操作(改变页面状态),违背只读探针原则,且容易和客服的手动操作打架。全量采集靠的是”客服自己会点开各个会话”,插件被动监听 DOM 变化。这是 Observe First 的体现。

### 4.5 DOM 提取用 XPath(吸收竞品方案)

抖音来客的消息 DOM class 是动态随机串(vgonMAXk 这种),用 querySelector 按 class 选择极不稳定——class 一变就失效,这正是 chat_rpa 时代反复踩的坑。竞品 wolfRPA 的做法值得吸收:它用 `document.evaluate`(XPath)按 DOM **结构**定位,而不是按 class。

例如取消息文本不写 `querySelector('.vgonMAXk')`,而是写 XPath 按层级结构定位(如”会话容器下第 N 个 span”),结构比随机 class 稳定得多。

W4 在 `plugin/shared/dom-utils.js` 里加一个 XPath 提取工具(参考竞品 functions.js 的 getTextNodeContent / document.evaluate 封装,但代码自己写,不直接 copy):

```javascript
// 按 XPath 从某节点取文本,取不到返回空串
function getTextByXpath(contextNode, xpath) {
  const result = document.evaluate(
    xpath, contextNode, null,
    XPathResult.FIRST_ORDERED_NODE_TYPE, null
  );
  return result.singleNodeValue?.textContent?.trim() || '';
}
```

抖音三个 adapter 的 getMessages 改造时,凡是用随机 class 选择的地方,优先改用 XPath 按结构定位。已验证稳定的非随机 class(如抖音来客的 `contactCard-` 前缀、`message-wrapper left-message`)可以保留 querySelector,不用强行全改 XPath——原则是”随机 class 用 XPath,语义 class 用 querySelector”。

-----

## 5. EventCollector + EventQueue + EventUploader

### 5.1 EventCollector(新增 plugin/runtime/event-collector.js)

职责:接收 adapter 产出的 ConversationEvent,做插件侧去重,入队。

```
collect(events):
  for event in events:
    key = event.message_id
    if 本地已见过 key(用 fingerprint/dedup 模块)→ 跳过
    else 标记已见 + 入队 EventQueue
```

去重复用迁移过来的 dedup.js / fingerprint.js(content_legacy 抽出的)。插件侧去重是第一道防线,服务端 events/batch 的去重是第二道防线,双保险。

### 5.2 EventQueue(新增 plugin/runtime/event-queue.js)

职责:内存队列 + chrome.storage.local 持久化,支持崩溃恢复。

```
enqueue(event):  推入内存数组 + 异步写 chrome.storage
dequeueBatch(n): 取最多 n 条
persist():       内存队列快照到 chrome.storage
restore():       插件启动时从 chrome.storage 恢复未上报的队列
```

**这是一个全新独立文件,不改迁移过来的 queue-manager.js**。queue-manager.js 是 chat_rpa 旧链路(processMessageSession 那套)还在依赖的”发送批次调度器”,如果直接把它的语义改成”事件上报队列”,flag 关闭时旧链路会坏,失去回退能力。Round 1 的原则是新旧隔离:新链路用新的 event-queue.js,旧链路继续用 queue-manager.js,互不干扰。可以参考 queue-manager 的 FIFO + 持久化写法,但代码独立,不共用文件。

### 5.3 EventUploader(新增 plugin/runtime/event-uploader.js)

职责:定时从 EventQueue 取一批,HTTP POST 到服务端。

```
配置:
  UPLOAD_INTERVAL = 5000ms   每5秒尝试上报
  UPLOAD_BATCH_MAX = 50      单批最多50条(对齐服务端上限)

tick():
  if 队列空 → return
  batch = queue.dequeueBatch(50)
  resp = await POST /api/v1/events/batch { events: batch }
  成功 → 从持久化里清除这批
  失败(网络/5xx)→ 把 batch 退回队列头部,等下次重试
  401 → 触发重新登录(token 失效)
```

token 来源:复用插件现有的登录态(chat_rpa 已有插件登录,token 存 chrome.storage)。W4 不改登录流程,直接读现有 token。

### 5.4 上报失败的处理

网络失败或服务端 5xx 时,事件退回队列,不丢弃。chrome.storage 持久化保证插件重启/页面刷新后队列还在。这是 PRD 8.2 可用性要求的落地。

-----

## 6. Feature Flag 切换

复用迁移过来的 feature-flags.js(已标 TODO 要改 flag)。W4 定义一个新 flag:

```
collector_v1_enabled:
  false(默认)→ 走旧链路 processMessageSession(自动回复)
  true        → 走新链路 collectMessageSession(纯采集上报)
```

切换点在 MutationObserver 检测到新消息后的分发处:

```javascript
// 伪码,在 legacy 的消息处理入口
if (featureFlags.get('collector_v1_enabled')) {
  await collectMessageSession(sessionInfo);   // W4 新链路
} else {
  await processMessageSession(sessionInfo);    // 旧链路,不动
}
```

flag 存 chrome.storage,可以通过 popup 或 devtools 控制台切换,方便 W4 测试时来回对比。

-----

## 7. W4 验收的数据流(端到端)

```
1. 插件加载到抖音来客页面,flag collector_v1_enabled=true
2. 客服点开一个有新消息的会话(或已有会话来了新消息)
3. MutationObserver 触发 → collectMessageSession
4. adapter.getMessages 读取消息 → toConversationEvent 标准化
5. EventCollector 去重入队 → EventUploader 5秒内上报
6. 服务端 events/batch 接收 → 落库 → analysis_jobs
7. analyzer 分析 → 生成工单
8. 查库:conversations 表出现真实抖音会话,workorders 出现真实工单
```

W4 验收成功的标志:**在抖音页面收到一条真实客户消息,不需要任何 curl,几秒后数据库里自动出现这条消息、对应会话的意图分类、以及生成的工单**。

-----

## 8. 风险与注意

第一,**合成 ID 的去重边界**。message_id 路线已定为合成 ID(见 3.1 节),不再调研平台原生 ID。需要注意的边界是:同一分钟同会话同内容的重复消息会被去重掉(漏采第二条),这是已接受的取舍。验收时不要因为”连发两个相同内容只采到一条”判为 bug——这是预期行为。

第二,**采集不能漏消息也不能重复**。MutationObserver 可能因为 DOM 重绘触发多次,同一条消息被 getMessages 读到多次。靠 EventCollector 的本地去重 + 服务端去重双保险。验收要专门测”同一条消息不会上报两次导致库里重复”。

第三,**不主动切换会话**。W4 采集只读当前激活会话。如果客服没点开某个会话,那个会话的消息就采不到——这是 Observe First 的预期行为,不是 bug。全量采集是后续话题(可能需要后台引导客服轮巡,或 V2 再设计)。

第四,**flag 默认关闭**。W4 交付后,flag 默认 false(走旧链路),需要手动打开才走新链路。这样即使 W4 合并了,也不影响插件现有行为,直到 W5 正式切换。

第五,**token 失效处理**。如果插件登录态过期,上报会 401。W4 检测到 401 时,先把事件留在队列(不丢),提示需要重新登录。不要静默丢弃事件。

第六,**真实页面测试需要你本地有抖音来客账号**。这一周的验收 cc 没法完全自动化(需要真实登录抖音、真实会话),所以 W4 验收会比前几周更依赖你手动操作 + cc 看日志/查库。