-----

## 文档: W4 实施任务清单(给执行端 cc / codex)
版本: v2.1.0
周次: W4
状态: Active

## 变更日志

|版本    |日期        |变更摘要                                                                                         |触发来源       |
|------|----------|---------------------------------------------------------------------------------------------|-----------|
|v2.1.0|2026-05-30|Task3 改为保留发送方法+新增 selector 校准;Task5 改为新建独立 event-queue.js;构建清单/commit 文案/重要提示同步;Task 重排为 1-10|执行端 B 类反馈  |
|v2.0.0|2026-05-30|删除原 Task0(调研原生 message_id);新增 Task2(合成 ID + XPath 工具);路线改为纯 DOM + 合成 ID                      |用户决策(竞品调研后)|
|v1.0.0|2026-05-30|初版,含 Task0 先确认 DOM 原生 message_id                                                             |Claude 设计  |

-----

# Chatsift W4 实施任务清单(给执行端 cc / codex)

> **周次**:W4
> **目标**:插件采集链路 Round 1 —— 真实抖音消息流入服务端分析流水线
> **验收标准**:抖音页面收到真实客户消息,无需 curl,几秒后数据库自动出现该消息 + 意图分类 + 工单
> **关联文档**:W4_design.md(先读)、runtime-disposition.md 第 2/3 节、v1-api-spec.md 第 1 节
> **策略**:新链路与 legacy 并存,feature flag 切换,只增不删
> **本周不做**:不删 legacy(W5)、不做 DOM scope(W10)、只抖音

-----

## 前置:阅读设计

先读 `W4_design.md`,理解四件事:Round 1 只增不删的策略、ConversationEvent 数据契约、采集只读不主动切换会话的原则、message_id 用合成 ID(3.1 节)。

**技术路线已定,不需要再调研抖音原生 message_id**。经调研确认抖音 DOM 不暴露平台消息 ID,且本项目明确不走 chrome.debugger 网络拦截(竞品调研佐证:成熟商业竞品也是纯 DOM 采集)。message_id 用合成 ID,DOM 提取吸收竞品的 XPath 方案。直接按下面的 Task 开始实施。

-----

## Task 1 — 放入 W4 设计文档

把 v2.1.0 版的 W4_design.md 覆盖到 docs/architecture/(如已有旧版则替换)。本次设计文档已含变更日志,记录了从 v1.0.0(原生 ID 假设)→ v2.0.0(改合成 ID)→ v2.1.0(采纳保留发送方法等反馈)的演进。

```bash
cd ~/vscode/chatsift
cp <W4_design.md v2.1.0> docs/architecture/W4_design.md
git add docs/architecture/W4_design.md
git commit -m "docs(W4): plugin collector design v2.1.0 (synthetic id + keep-send)"
```

-----

## Task 2 — 写共享工具:合成 ID + XPath 提取

新建/补充 `plugin/shared/dom-utils.js`,加两个工具函数(W4_design 3.1 + 4.5):

1. **合成 message_id**:

```javascript
// 把会话+方向+内容+分钟级时间拼接后做稳定 hash
function synthMessageId({ conversationId, direction, text, occurredAt }) {
  const minute = new Date(occurredAt).toISOString().slice(0, 16); // 到分钟 YYYY-MM-DDTHH:mm
  const raw = [conversationId, direction, text, minute].join('|');
  return 'syn_' + simpleHash(raw);   // simpleHash 自己实现,如 djb2 或取 SHA-1 前16位
}
```

simpleHash 用一个稳定的字符串 hash 即可(djb2/FNV 都行),保证同样输入得同样输出。

1. **XPath 文本提取**(吸收竞品方案,代码自己写不 copy):

```javascript
function getTextByXpath(contextNode, xpath) {
  const r = document.evaluate(
    xpath, contextNode, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  return r.singleNodeValue?.textContent?.trim() || '';
}
```

写完 `node --check`(注意 document.evaluate 在 node 里没有,只做语法检查不做运行)。

-----

## Task 3 — 改造抖音 adapter:加 toConversationEvent(发送方法保留不删)

对 `plugin/adapters/douyin/` 下三个文件(laike-message / feige / private-message):

1. **不删任何方法**。prepareReply / sendReply / buildBatch 全部原样保留,只是新的 collector 路径不调用它们,删除留到 W5。(原因:self-check.js 的 sendlock 自检依赖 sendReply 存在,删了自检会失效;且旧链路在 flag 关闭时仍需可用)
1. 新增 `toConversationEvent(rawMsg, sessionInfo)` 方法(见 W4_design 4.3),message_id 调用 Task 2 的 synthMessageId 合成
1. getMessages 里凡是用随机 class(如 vgonMAXk 这种)选择的地方,改用 Task 2 的 getTextByXpath 按结构定位;已验证的语义 class(contactCard- 前缀、message-wrapper left-message 等)保留 querySelector(原则:随机 class 用 XPath,语义 class 用 querySelector)
1. **校准页面匹配和 selector**:迁移过来的三个 adapter 是 chat_rpa 时代的,matchPage 的页面匹配规则和 selector 可能过时。对照真实的 life.douyin.com 来客页面逐一校准,确保 matchPage 能正确命中当前页面、getMessages 能抽到真实消息。这一步在真实页面验收(Task 9)时一并验证
1. 文件头 TODO 注释:把”删除 prepareReply/sendReply”那条删掉(因为不删了),保留其他改造说明

每个 adapter 改完做 `node --check`。

-----

## Task 4 — 写 EventCollector

新建 `plugin/runtime/event-collector.js`。

```
collect(events):
  for event of events:
    if 已见过 event.message_id(查 dedup/fingerprint 模块)→ skip
    else 标记已见 + EventQueue.enqueue(event)
  返回 { collected: N, skipped: M }
```

复用迁移过来的 dedup.js / fingerprint.js 做本地去重。如果这两个模块还没从 content_legacy 抽出来,W4 先在 event-collector 内部用一个 Set + chrome.storage 实现简单去重,标 TODO 留给 W10 统一。

-----

## Task 5 — 新增 EventQueue(独立文件,不改 queue-manager)

**新建 `plugin/runtime/event-queue.js`,不要改 queue-manager.js**。queue-manager.js 是旧链路还在依赖的发送批次调度器,直接改它会让 flag 关闭时的旧链路坏掉、失去回退能力。新链路用全新独立的 event-queue.js:

```
enqueue(event):    内存数组 push + 异步 persist
dequeueBatch(n):   shift 出最多 n 条
requeueFront(arr): 上报失败时退回队列头部
persist():         快照到 chrome.storage.local('chatsift_event_queue')
restore():         启动时从 chrome.storage 恢复
size():            当前队列长度
```

可以参考 queue-manager 的 FIFO + 持久化写法,但 event-queue.js 是独立文件,不共用、不修改 queue-manager.js。

-----

## Task 6 — 写 EventUploader

新建 `plugin/runtime/event-uploader.js`。

```
配置:
  UPLOAD_INTERVAL=5000, UPLOAD_BATCH_MAX=50
  SERVER_BASE: 复用插件现有的服务端地址配置
  
start(): setInterval(tick, UPLOAD_INTERVAL)
stop():  clearInterval

tick():
  if EventQueue.size()==0 → return
  if 正在上报 → return(防重入)
  batch = EventQueue.dequeueBatch(50)
  try:
    token = 读 chrome.storage 现有登录 token
    resp = await fetch(SERVER_BASE + '/api/v1/events/batch', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer '+token },
      body: JSON.stringify({ events: batch })
    })
    if resp.ok:
      EventQueue.persist()  // 已出队,持久化更新
      log上报成功 accepted/duplicated
    else if resp.status==401:
      EventQueue.requeueFront(batch)  // 退回
      提示需要重新登录
    else:
      EventQueue.requeueFront(batch)  // 5xx 退回重试
  catch(网络错误):
    EventQueue.requeueFront(batch)    // 退回重试
```

token 复用插件现有登录态(chat_rpa 插件已有登录,token 在 chrome.storage),W4 不改登录流程。如果不确定 token 存哪个 key,先查现有 legacy 代码怎么读 token,沿用。

-----

## Task 7 — 写 collectMessageSession + feature flag 接线

### 6.1 collectMessageSession

新建采集主入口(放 plugin/runtime/legacy-collector.js 或新文件):

```
collectMessageSession(sessionInfo):
  adapter = 当前页面匹配的 adapter
  rawMessages = adapter.getMessages()         // 读当前激活会话消息
  events = rawMessages.map(m => adapter.toConversationEvent(m, sessionInfo))
  EventCollector.collect(events)
  // 不发送,不切换会话
```

### 6.2 feature flag

在 feature-flags.js 定义 `collector_v1_enabled`(默认 false)。

在 legacy 消息处理入口加分叉(W4_design 第 6 节):

```javascript
if (featureFlags.get('collector_v1_enabled')) {
  await collectMessageSession(sessionInfo);
} else {
  await processMessageSession(sessionInfo);   // 旧链路不动
}
```

### 6.3 启动 uploader

插件初始化时,若 flag 打开,启动 EventUploader 和 EventQueue.restore()。

-----

## Task 8 — 构建插件

```bash
cd plugin
node build.js   # 把模块 concat 成 content.js
# 确认 dist/ 产出,无构建错误
```

如果 build.js 的模块清单需要加入新文件,更新 build.js 的文件列表。W4 新增需要打包的文件:plugin/shared/dom-utils.js(合成 ID + XPath)、plugin/runtime/event-queue.js、plugin/runtime/event-collector.js、plugin/runtime/event-uploader.js。注意 dom-utils 要在 adapter 之前加载(adapter 依赖 synthMessageId/getTextByXpath)。queue-manager.js 保持原样在清单里,不动。

-----

## Task 9 — 真实页面验收(需要你手动配合)

这一步 cc 无法完全自动化,需要 Chase 本地操作。

### 9.1 准备

```
1. 确认服务端在跑(npm run dev,3100 端口,analyzer started)
2. Chrome 加载 plugin/dist
3. 登录抖音来客,确认插件已登录服务端(token 有效)
4. 打开 devtools 控制台,设置 flag:
   chrome.storage.local.set({ collector_v1_enabled: true })
   (或通过 popup 开关,如果做了 UI)
5. 刷新抖音页面让 flag 生效
```

### 9.2 验收步骤

```
1. 在抖音来客点开一个会话(最好用另一个号发一条测试消息,如"多少钱")
2. 观察插件控制台日志:应看到 collectMessageSession → collect → upload 的日志
3. 等 5-10 秒(上报间隔 + 分析)
4. 查库验证:
```

```sql
-- 真实会话进来了
SELECT id, platform, customer_nickname, intent_label, current_stage, completeness_score
FROM conversations WHERE platform='douyin' ORDER BY created_at DESC LIMIT 5;

-- 真实消息进来了
SELECT id, direction, content_text, occurred_at
FROM messages ORDER BY uploaded_at DESC LIMIT 10;

-- 工单生成了
SELECT id, workorder_type, title, completeness_score, priority, status
FROM workorders ORDER BY created_at DESC LIMIT 5;

-- 去重验证:同一条消息只有一行
SELECT platform_message_id, COUNT(*)
FROM messages GROUP BY platform_message_id HAVING COUNT(*) > 1;
-- 期望:空结果(无重复)
```

### 9.3 对比验证 flag 关闭

```
1. 设置 collector_v1_enabled=false,刷新页面
2. 确认插件恢复旧行为(走 processMessageSession)
3. 这一步确保 W4 没破坏 legacy 链路
```

-----

## Task 10 — 提交

```bash
git add plugin/
git commit -m "feat(W4): plugin collector round1 - douyin adapters + event upload pipeline

- douyin adapters: 新增 toConversationEvent(合成ID), 发送方法保留不删(W5删), selector校准
- shared/dom-utils.js: 合成 message_id + XPath 提取工具
- event-queue.js: 新增独立事件上报队列(内存+chrome.storage持久化), 不改 queue-manager
- event-collector.js: 本地去重 + 入队
- event-uploader.js: 批量POST /api/v1/events/batch, 失败退回重试, 401提示重登
- collectMessageSession + feature flag collector_v1_enabled 切换(默认关)
- 验收: 真实抖音消息流入服务端, 自动生成工单, 无重复"
git log --oneline -7
```

-----

## W4 完成标准(验收报告)

> 按协作协议,验收报告写成 `docs/reports/W4_acceptance.md` 落盘 + 进 git,再由用户上传给 Claude(不用截图)。报告含以下各项:

1. 合成 ID 的实现确认(synthMessageId 函数 + 一个去重生效的例子)
1. Task 9.2 的查库结果:真实抖音会话 / 消息 / 工单各贴几行
1. 去重验证 SQL 的结果(必须空,无重复消息)
1. 插件控制台的采集→上报日志片段
1. Task 9.3 flag 关闭后旧链路仍正常的确认
1. **`git log --oneline -7`** —— W0~W4 各 commit 独立(本周硬要求)
1. A 类自主调整说明(若有);B/C 类问题(若有)单独成文 docs/reports/W4_feedback.md,停下等确认
1. 任何偏离记录

-----

## 重要提示

- **合成 ID 已定方案**(Task 2),同分钟同会话同内容会去重掉第二条,这是预期行为不是 bug
- **只增不删**:legacy 的 processMessageSession,以及 adapter 的 prepareReply/sendReply/buildBatch,本周一律保留不删(self-check 的 sendlock 依赖 sendReply,删了自检会坏),W5 才删
- **EventQueue 是新文件**:新建 event-queue.js,不改 queue-manager.js(旧链路依赖它)
- **adapter selector 要校准**:迁移来的三个 adapter 是 chat_rpa 时代的,matchPage/selector 可能过时,对照真实 life.douyin.com 页面校准
- **采集不主动切换会话**:只读当前激活会话,这是 Observe First 原则
- **flag 默认 false**:W4 合并后不影响插件现有行为
- **上报失败不丢事件**:退回队列重试,chrome.storage 持久化
- **token 复用现有登录态**,不改登录流程
- **双重去重**:插件本地 + 服务端,验收专门测无重复
- 真实页面测试依赖 Chase 手动操作,cc 主要负责代码 + 看日志 + 查库
- 遇到 adapter 的 getMessages 现有结构看不懂,或 token 存储位置不确定,先停下问我