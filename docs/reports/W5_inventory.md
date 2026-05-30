---
文档: W5 阶段一盘点报告
版本: v1.0.0
周次: W5
状态: Inventory Only
---

## 结论

阶段一只盘点,未删除任何代码,未切换任何 feature flag。

核心结论:

- `processMessageSession`, `decideReply`, `decideReplyMulti` 在当前 chatsift 插件源码中不存在。
- W4 采集链路使用 `RpaEventQueue` (`plugin/runtime/event-queue.js`),不是 `RpaQueueManager` (`plugin/runtime/queue-manager.js`)。
- `queue-manager.js` 当前仍被 `runtime-manager.js`, `recovery-manager.js`, `chaos-monitor.js`, `bug-dump.js`, `rpc-bridge.js`, `self-check.js` 引用,但未被 `event-*` 或 `legacy-collector.js` 引用。它属于旧 V1.9 runtime/自检调试链路,不是 W4 采集链路。
- 三个 Douyin adapter 仍保留 `buildBatch`, `prepareReply`, `sendReply`;采集链路只依赖 `getMessages` + `toConversationEvent`。
- `self-check.js` 有明确 `sendlock` 用例依赖 `adapter.sendReply`;删除 adapter `sendReply` 前必须同步改/删该 self-check case。
- `runtime-manager.js` 仍有 `sendInBatch` 高阶发送入口,但其依赖的 `runtime/pre-check.js` 和 `runtime/send-confirm.js` 文件不存在,因此当前发送链路不完整。

## Inv Task 1:全局搜索发送/回复相关符号

命令:

```bash
grep -rn "sendReply\|prepareReply\|decideReply\|decideReplyMulti\|processMessageSession\|sendInBatch\|send-confirm\|sendConfirm\|pre-check\|preCheck\|autoReply\|自动回复\|话术\|keywordReply" plugin/ --include="*.js" | grep -v "node_modules"
```

原始输出见附录 A。摘要:

- `popup.js` / `background.js`: `autoReply` 配置字段,偏 UI/配置残留。
- `build.js`: 仍列出缺失的 `runtime/send-confirm.js`, `runtime/pre-check.js`,并打包 `runtime-manager.js`。
- `runtime/adapter-registry.js`: 发送方法接口定义和 `SEND_RUNTIME_METHODS` 锁。
- `runtime/runtime-manager.js`: `sendInBatch` 定义和对 `adapter.prepareReply/sendReply` 的调用。
- `runtime/self-check.js`: precheck 伪 adapter 和 sendlock 用例依赖 `sendReply`。
- `shared/constants.js` / `feature-flags.js`: `send_runtime_v19` 等发送 flag。
- 三个 Douyin adapter: `prepareReply`, `sendReply`, `buildBatch` 定义和注册。
- `plugin/content.js`: 以上源码的构建产物副本,不应单独算一份业务源码。

## Inv Task 2:runtime 发送相关模块状态

命令输出:

```text
send-confirm.js 不存在
pre-check.js 不存在
-rw-r--r--@ 1 caihongyang  staff  15416 May 29 19:34 plugin/runtime/batch-manager.js
-rw-r--r--@ 1 caihongyang  staff   7444 May 29 19:34 plugin/runtime/queue-manager.js
=== 谁引用 send-confirm ===
plugin/build.js:61:  'runtime/send-confirm.js',              // M4: lenient confirm
=== 谁引用 pre-check ===
plugin/build.js:56:  // ── Adapter base（被 pre-check 和 adapters/** 共同依赖）──────────
plugin/build.js:62:  'runtime/pre-check.js',                 // M4: 发送门禁（依赖 helpers）
plugin/runtime/runtime-manager.js:279:  // 完整链路：pre-check → adapter.prepareReply → state.SENDING → adapter.sendReply
plugin/runtime/runtime-manager.js:317:    if (!PreCheck || !Confirm) return Promise.resolve({ ok: false, reason: 'pre-check/confirm-not-loaded' })
plugin/content.js:2843:  // 完整链路：pre-check → adapter.prepareReply → state.SENDING → adapter.sendReply
plugin/content.js:2881:    if (!PreCheck || !Confirm) return Promise.resolve({ ok: false, reason: 'pre-check/confirm-not-loaded' })
=== 谁引用 batch-manager ===
plugin/build.js:46:  'runtime/batch-manager.js',             // M2+M4: batch 状态机 + stable_wait
plugin/content.js:1012:// MODULE: runtime/batch-manager.js
=== 谁引用 queue-manager ===
plugin/build.js:47:  'runtime/queue-manager.js',             // M2: 调度队列
plugin/content.js:1415:// MODULE: runtime/queue-manager.js
```

补充 `queue-manager` 符号级引用:

```text
plugin/runtime/recovery-manager.js:19:  var Queue  = window.RpaQueueManager
plugin/runtime/runtime-manager.js:23:  var Queue    = window.RpaQueueManager
plugin/runtime/chaos-monitor.js:113/137: var QM = window.RpaQueueManager
plugin/runtime/bug-dump.js:90: var QM = window.RpaQueueManager
plugin/runtime/rpc-bridge.js:84: queue.snapshot
plugin/runtime/self-check.js:91/307/338: RpaQueueManager
```

采集链路引用:

```text
plugin/runtime/event-collector.js:4:  var Queue = window.RpaEventQueue
plugin/runtime/event-uploader.js:4:  var Queue = window.RpaEventQueue
plugin/runtime/event-queue.js:72:  window.RpaEventQueue = {
```

判断:

- `send-confirm.js` / `pre-check.js`: 文件不存在,只剩 build 清单和 runtime-manager 注释/依赖判断。
- `batch-manager.js`: 旧 V1.9 batch 状态机,未被 W4 event 采集链路引用。
- `queue-manager.js`: 旧 V1.9 queue,未被 W4 event 采集链路引用;但被 runtime/self-check/debug/recovery 模块引用,不能在未处理这些模块前单独删除。

## Inv Task 3:三个抖音 adapter 发送方法

命令输出:

```text
=== laike-message.adapter.js 里的发送方法 ===
1:// TODO V2.0 改造: W4 新增 toConversationEvent；prepareReply / sendReply 保留到 W5。
303:  function toConversationEvent(rawMsg, sessionInfo) {
330:  async function buildBatch(messages, context) {
338:  async function prepareReply(replyText, context) {
345:  async function sendReply(replyText, context) {
414:    toConversationEvent:  toConversationEvent,
415:    buildBatch:           buildBatch,
416:    prepareReply:         prepareReply,
417:    sendReply:            sendReply,
=== feige.adapter.js 里的发送方法 ===
1:// TODO V2.0 改造: W4 新增 toConversationEvent；prepareReply / sendReply 保留到 W5。
199:  async function buildBatch() { return null }
201:  function toConversationEvent(rawMsg, sessionInfo) {
228:  async function prepareReply() {
233:  async function sendReply(replyText) {
275:    toConversationEvent:  toConversationEvent,
276:    buildBatch:           buildBatch,
277:    prepareReply:         prepareReply,
278:    sendReply:            sendReply,
=== private-message.adapter.js 里的发送方法 ===
1:// TODO V2.0 改造: W4 新增 toConversationEvent；prepareReply / sendReply 保留到 W5。
256:  async function buildBatch() { return null }
258:  function toConversationEvent(rawMsg, sessionInfo) {
285:  async function prepareReply() {
290:  async function sendReply(replyText) {
354:    toConversationEvent:  toConversationEvent,
355:    buildBatch:           buildBatch,
356:    prepareReply:         prepareReply,
357:    sendReply:            sendReply,
```

adapter 外部调用:

- `runtime/legacy-collector.js` 调用 `adapter.toConversationEvent`,这是采集链路,必须保留。
- `runtime/runtime-manager.js` 调用 `adapter.prepareReply/sendReply`,属于旧发送入口。
- `runtime/self-check.js` 调用 `adapter.sendReply`,属于 sendlock 自检。
- 未发现 adapter 外部调用 `buildBatch`。

## Inv Task 4:feature flag 当前状态

命令输出:

```text
plugin/background.js:176:        collector_v1_enabled: true,
plugin/background.js:187:        collector_v1_enabled: false,
plugin/runtime/legacy-collector.js:77:      if (!Flags.get('collector_v1_enabled') || _collecting) return
plugin/runtime/legacy-collector.js:106:    if (Flags.get('collector_v1_enabled')) start()
plugin/shared/constants.js:133:    collector_v1_enabled: false,
plugin/content.js:138:    collector_v1_enabled: false,
plugin/content.js:4493:      if (!Flags.get('collector_v1_enabled') || _collecting) return
plugin/content.js:4522:    if (Flags.get('collector_v1_enabled')) start()
```

默认值:

```javascript
var FeatureFlagDefaults = {
  runtime_v19:        false,
  send_runtime_v19:   false,
  batch_protocol_v2:  false,
  adapter_layer_v19:  false,
  send_confirm_v19:   false,
  watchdog_v19:       false,
  collector_v1_enabled: false,
}
```

分叉/启动逻辑:

```javascript
function _scheduleCollect() {
  if (_collecting) return
  clearTimeout(_debounce)
  _debounce = setTimeout(async function () {
    if (!Flags.get('collector_v1_enabled') || _collecting) return
    _collecting = true
    try { await collectMessageSession() } catch (err) {
      Logger.warn && Logger.warn('LegacyCollector', 'collect failed', err && err.message)
    } finally {
      _collecting = false
    }
  }, 800)
}

function _syncFlag() {
  if (Flags.get('collector_v1_enabled')) start()
  else if (_observer) stop()
}
```

说明:

- 当前没有 `processMessageSession` 分叉;实际上是 `collector_v1_enabled=false` 时采集 observer 不启动。
- popup `START_PLATFORM` 会写 `collector_v1_enabled:true`;`STOP_PLATFORM` 会写 false。
- W5 阶段二若要“切 flag”,可选路径包括把默认值改 true,或删掉 flag gate 只保留采集;具体等阶段二方案。

## Inv Task 5:self-check sendlock 依赖

命令输出:

```text
201:      adapter:  { adapterKey: 'fake/test', sendReply: function () {} },
208:      adapter:  { adapterKey: 'fake/test', sendReply: function () {} },
215:      adapter:  { adapterKey: 'fake/test', sendReply: function () {} },
229:      adapter:  { adapterKey: 'fake/test', sendReply: function () {} },
257:    if (!F || !R) return [{ label: 'sendlock.deps', ok: false }]
259:    if (!adapter) return [{ label: 'sendlock.adapter', ok: false }]
262:    // 主动测试 lock/unlock 周期 + 各状态下 sendReply 行为
267:    var blockedAfterLock = await adapter.sendReply('self-check-locked')
271:    var afterUnlock = await adapter.sendReply('self-check-unlocked')
278:      _expect(blockedAfterLock && blockedAfterLock.ok, false, 'adapter.sendReply blocked when flag locked'),
283:              'sendReply enters real flow after unlock'),
```

判断:

- `_checkPreCheck()` 依赖 `window.RpaPreCheck`;当前 `pre-check.js` 文件不存在,因此该 self-check case 本身会失败/跳过。
- `_checkSendLock()` 明确依赖真实 `douyin/laike-message` adapter 的 `sendReply`。
- 删除 adapter `sendReply` 前必须同步处理 `_checkSendLock()` 和 `_checkPreCheck()`。

## 删除候选清单

| 文件 / 符号 | 类型 | 被谁引用 | 建议处置 |
|---|---|---|---|
| `plugin/runtime/send-confirm.js` | 发送模块(缺失文件) | `build.js` 清单残留;`runtime-manager.js` 通过 `window.RpaSendConfirm` 判断 | 文件已不存在;阶段二可从 build 清单/注释依赖中清理 |
| `plugin/runtime/pre-check.js` | 发送门禁(缺失文件) | `build.js` 清单残留;`runtime-manager.js`;`self-check._checkPreCheck` | 文件已不存在;阶段二需同步处理 runtime-manager/self-check 残留 |
| `plugin/runtime/runtime-manager.js::sendInBatch` | 发送链路 | 暴露在 `window.RpaRuntimeManager`;Inv 未发现 W4 采集链路调用 | 可删或改造,但需确认 RuntimeManager 其他非发送能力是否仍要保留 |
| `plugin/runtime/adapter-registry.js::SEND_RUNTIME_METHODS/_wrapSendMethods` | 发送锁/共用注册模块 | adapter 注册都经过 registry;采集链路依赖 registry resolve adapter | 不能整文件删;可删除发送方法锁逻辑前需确保 adapter 注册/resolve 不受影响 |
| `plugin/adapters/douyin/*::sendReply` | 发送方法 | `runtime-manager.sendInBatch`;`self-check._checkSendLock`;registry 包装 | 候选可删,但必须先改 self-check 和 runtime-manager/registry 调用 |
| `plugin/adapters/douyin/*::prepareReply` | 发送方法 | `runtime-manager.sendInBatch`;registry 包装 | 候选可删,同上 |
| `plugin/adapters/douyin/*::buildBatch` | 旧 batch 方法 | Inv 未发现 adapter 外部调用 | 可删或保留空 stub;若删除需确认 AdapterRegistry 接口注释/OPTIONAL_METHODS |
| `plugin/adapters/douyin/*::toConversationEvent` | 采集链路 | `legacy-collector.collectMessageSession` | 必须保留 |
| `plugin/adapters/douyin/*::getMessages` | 采集链路/共用 | `legacy-collector.collectMessageSession`;旧 adapter 接口 | 必须保留 |
| `plugin/runtime/event-queue.js` / `RpaEventQueue` | 采集链路 | `event-collector`, `event-uploader` | 必须保留 |
| `plugin/runtime/queue-manager.js` / `RpaQueueManager` | 旧 V1.9 队列/调试自检 | `runtime-manager`, `recovery-manager`, `self-check`, `chaos-monitor`, `bug-dump`, `rpc-bridge`;未被 event 采集链路引用 | 不会误伤采集链路,但不能单独删;需作为旧 runtime/debug/self-check 组一起评估 |
| `plugin/runtime/batch-manager.js` / `RpaBatchManager` | 旧 V1.9 batch/共用状态机 | `runtime-manager`, `self-check`, `recovery-manager`;未被 event 采集链路引用 | 不会误伤采集链路,但需和 runtime-manager/self-check 一起评估 |
| `plugin/runtime/self-check.js::_checkSendLock` | 发送自检 | 直接调用 `adapter.sendReply` | 删除 sendReply 前必须删除或改造该 case |
| `plugin/runtime/self-check.js::_checkPreCheck` | 发送门禁自检 | 依赖缺失的 `RpaPreCheck` 和伪 `sendReply` | 可删/改造为采集自检 |
| `plugin/shared/constants.js::send_runtime_v19/send_confirm_v19` | 发送 flags | `feature-flags`, registry, self-check | 候选可删,但需同步 registry/self-check |
| `plugin/shared/constants.js::collector_v1_enabled` | 采集 flag | background, legacy-collector | W5 阶段二决定是否默认 true 或移除 gate;不能简单删除 |
| `plugin/popup/popup.js::autoReply` | UI/配置残留 | popup 表单/登录 cfg;未见采集使用 | 可删或后续 UI 清理,不影响采集 |
| `plugin/background.js::DEFAULT_CFG.autoReply` | 配置残留 | 登录/状态 cfg | 可删或保留无害;不影响采集 |
| `plugin/content.js` 中相关命中 | 构建产物 | 由源文件 concat 生成 | 不直接手改;源文件变更后重建 |

## 误伤采集链路风险点

1. `adapter-registry.js` 是共用模块。虽然里面有发送锁逻辑,但采集链路仍依赖 `Registry.resolve(location)` 获取 adapter。阶段二不能直接删除整个 registry。
2. 三个 Douyin adapter 是共用文件。删除 `sendReply/prepareReply/buildBatch` 时必须只删发送方法和注册字段,保留 `matchPage/getMessages/toConversationEvent/classifyMessage/buildRuntimeContext`。
3. `queue-manager.js` 没被采集链路引用,但被 `runtime-manager/recovery/self-check/debug` 旧 runtime 组引用。若阶段二删除旧 runtime 组,要成组处理 build 清单和自检,不能只删 queue-manager。
4. `self-check.js` 当前包含发送用例。若删 adapter `sendReply` 但不改 self-check,自检会报错。
5. `collector_v1_enabled` 目前控制采集 observer 启停。阶段二切默认时需保证 popup/STOP 行为和 content boot 行为一致,避免默认开后 stop 又被定时 `_syncFlag` 拉起。
6. `plugin/content.js` 是构建产物。任何删除必须改源文件后重新 `node build.js --check`,不能手工只改 content.js。

## 附录 A:Inv Task 1 原始输出

```text
plugin/popup/popup.js:358:  $('autoReplySwitch').checked = !!cfg.autoReply
plugin/popup/popup.js:411:    autoReply: $('autoReplySwitch').checked,
plugin/popup/popup.js:694:        cfg: { serverUrl: serverUrl, autoReply: false },
plugin/popup/popup.js:768:  $('autoReplySwitch').checked = false
plugin/background.js:1:const DEFAULT_CFG = { serverUrl: 'http://127.0.0.1:3100', autoReply: false }
plugin/build.js:56:  // ── Adapter base（被 pre-check 和 adapters/** 共同依赖）──────────
plugin/build.js:61:  'runtime/send-confirm.js',              // M4: lenient confirm
plugin/build.js:62:  'runtime/pre-check.js',                 // M4: 发送门禁（依赖 helpers）
plugin/build.js:63:  'runtime/runtime-manager.js',           // M1+M2+M4: sendInBatch
plugin/runtime/session-detector.js:12:  // M1 阶段: 只检测，不自动回复。
plugin/runtime/adapter-registry.js:23:  //     prepareReply(replyText, context): Promise<void>
plugin/runtime/adapter-registry.js:24:  //     sendReply(replyText, context): Promise<SendResult>
plugin/runtime/adapter-registry.js:45:    'prepareReply',
plugin/runtime/adapter-registry.js:46:    'sendReply',
plugin/runtime/adapter-registry.js:54:  var SEND_RUNTIME_METHODS = ['prepareReply', 'sendReply', 'confirmReply']
plugin/runtime/diff-engine.js:15:  //   - unstable session_id（L3 兜底）命中时降低置信度，仅打日志，不自动回复
plugin/runtime/runtime-manager.js:278:  // sendInBatch({ batch, identity, adapter, replyText, decisionSource? })
plugin/runtime/runtime-manager.js:279:  // 完整链路：pre-check → adapter.prepareReply → state.SENDING → adapter.sendReply
plugin/runtime/runtime-manager.js:314:  function sendInBatch(args) {
plugin/runtime/runtime-manager.js:317:    if (!PreCheck || !Confirm) return Promise.resolve({ ok: false, reason: 'pre-check/confirm-not-loaded' })
plugin/runtime/runtime-manager.js:334:        message:    'sendInBatch blocked: send_runtime_v19=false',
plugin/runtime/runtime-manager.js:371:        return typeof adapter.prepareReply === 'function' ? adapter.prepareReply(replyText, lkContext) : null
plugin/runtime/runtime-manager.js:376:        return adapter.sendReply(replyText, lkContext)
plugin/runtime/runtime-manager.js:435:          message: 'sendInBatch threw', detail: { error: (err && err.message) || String(err) },
plugin/runtime/runtime-manager.js:453:    sendInBatch:       sendInBatch,
plugin/runtime/feature-flags.js:9:  //   - send_runtime_v19  二级：发送链路（sendReply / confirmReply / prepareReply / sendInBatch）
plugin/runtime/queue-manager.js:12:  //   4. L3 unstable session 不进入自动回复队列（M4 落地，本模块仅在 enqueue 时拒绝）
plugin/runtime/self-check.js:201:      adapter:  { adapterKey: 'fake/test', sendReply: function () {} },
plugin/runtime/self-check.js:208:      adapter:  { adapterKey: 'fake/test', sendReply: function () {} },
plugin/runtime/self-check.js:215:      adapter:  { adapterKey: 'fake/test', sendReply: function () {} },
plugin/runtime/self-check.js:229:      adapter:  { adapterKey: 'fake/test', sendReply: function () {} },
plugin/runtime/self-check.js:233:      _expect(rUnstable.ok,   false, 'preCheck rejects L3 unstable'),
plugin/runtime/self-check.js:234:      _expect(rInflight.ok,   false, 'preCheck rejects batch in SENDING'),
plugin/runtime/self-check.js:235:      _expect(rDup.ok,        false, 'preCheck rejects duplicate replyText'),
plugin/runtime/self-check.js:236:      _expect(rNoAdapter.ok,  false, 'preCheck rejects null adapter'),
plugin/runtime/self-check.js:237:      _expect(rOk.ok,         true,  'preCheck passes valid'),
plugin/runtime/self-check.js:262:    // 主动测试 lock/unlock 周期 + 各状态下 sendReply 行为
plugin/runtime/self-check.js:267:    var blockedAfterLock = await adapter.sendReply('self-check-locked')
plugin/runtime/self-check.js:271:    var afterUnlock = await adapter.sendReply('self-check-unlocked')
plugin/runtime/self-check.js:278:      _expect(blockedAfterLock && blockedAfterLock.ok, false, 'adapter.sendReply blocked when flag locked'),
plugin/runtime/self-check.js:283:              'sendReply enters real flow after unlock'),
plugin/runtime/session-identity-resolver.js:11:  //       L3  nickname + last message + DOM position（unstable=true，禁止自动回复）
plugin/shared/constants.js:64:    // ── 5. Decision（决策现走 legacy decideReply，runtime 未接管） ──
plugin/shared/constants.js:125:  // 二级 send_runtime_v19 锁住整个发送链路（sendReply / confirmReply / prepareReply / sendInBatch）。
plugin/shared/adapter-helpers.js:87:  // 检查 unstable 是否禁止自动回复（V1.9_技术方案 § 7.2 L3 不允许自动回复）
plugin/adapters/douyin/laike-message.adapter.js:1:// TODO V2.0 改造: W4 新增 toConversationEvent；prepareReply / sendReply 保留到 W5。
plugin/adapters/douyin/laike-message.adapter.js:338:  async function prepareReply(replyText, context) {
plugin/adapters/douyin/laike-message.adapter.js:345:  async function sendReply(replyText, context) {
plugin/adapters/douyin/laike-message.adapter.js:416:    prepareReply:         prepareReply,
plugin/adapters/douyin/laike-message.adapter.js:417:    sendReply:            sendReply,
plugin/adapters/douyin/feige.adapter.js:1:// TODO V2.0 改造: W4 新增 toConversationEvent；prepareReply / sendReply 保留到 W5。
plugin/adapters/douyin/feige.adapter.js:228:  async function prepareReply() {
plugin/adapters/douyin/feige.adapter.js:233:  async function sendReply(replyText) {
plugin/adapters/douyin/feige.adapter.js:277:    prepareReply:         prepareReply,
plugin/adapters/douyin/feige.adapter.js:278:    sendReply:            sendReply,
plugin/adapters/douyin/private-message.adapter.js:1:// TODO V2.0 改造: W4 新增 toConversationEvent；prepareReply / sendReply 保留到 W5。
plugin/adapters/douyin/private-message.adapter.js:285:  async function prepareReply() {
plugin/adapters/douyin/private-message.adapter.js:290:  async function sendReply(replyText) {
plugin/adapters/douyin/private-message.adapter.js:356:    prepareReply:         prepareReply,
plugin/adapters/douyin/private-message.adapter.js:357:    sendReply:            sendReply,
plugin/content.js:69:    // ── 5. Decision（决策现走 legacy decideReply，runtime 未接管） ──
plugin/content.js:130:  // 二级 send_runtime_v19 锁住整个发送链路（sendReply / confirmReply / prepareReply / sendInBatch）。
plugin/content.js:486:  //   - send_runtime_v19  二级：发送链路（sendReply / confirmReply / prepareReply / sendInBatch）
plugin/content.js:863:  //     prepareReply(replyText, context): Promise<void>
plugin/content.js:864:  //     sendReply(replyText, context): Promise<SendResult>
plugin/content.js:885:    'prepareReply',
plugin/content.js:886:    'sendReply',
plugin/content.js:894:  var SEND_RUNTIME_METHODS = ['prepareReply', 'sendReply', 'confirmReply']
plugin/content.js:1429:  //   4. L3 unstable session 不进入自动回复队列（M4 落地，本模块仅在 enqueue 时拒绝）
plugin/content.js:2258:  //       L3  nickname + last message + DOM position（unstable=true，禁止自动回复）
plugin/content.js:2545:  // 检查 unstable 是否禁止自动回复（V1.9_技术方案 § 7.2 L3 不允许自动回复）
plugin/content.js:2842:  // sendInBatch({ batch, identity, adapter, replyText, decisionSource? })
plugin/content.js:2843:  // 完整链路：pre-check → adapter.prepareReply → state.SENDING → adapter.sendReply
plugin/content.js:2878:  function sendInBatch(args) {
plugin/content.js:2881:    if (!PreCheck || !Confirm) return Promise.resolve({ ok: false, reason: 'pre-check/confirm-not-loaded' })
plugin/content.js:2898:        message:    'sendInBatch blocked: send_runtime_v19=false',
plugin/content.js:2935:        return typeof adapter.prepareReply === 'function' ? adapter.prepareReply(replyText, lkContext) : null
plugin/content.js:2940:        return adapter.sendReply(replyText, lkContext)
plugin/content.js:2999:          message: 'sendInBatch threw', detail: { error: (err && err.message) || String(err) },
plugin/content.js:3017:    sendInBatch:       sendInBatch,
plugin/content.js:3142:  // M1 阶段: 只检测，不自动回复。
plugin/content.js:3260:  //   - unstable session_id（L3 兜底）命中时降低置信度，仅打日志，不自动回复
plugin/content.js:3335:// TODO V2.0 改造: W4 新增 toConversationEvent；prepareReply / sendReply 保留到 W5。
plugin/content.js:3672:  async function prepareReply(replyText, context) {
plugin/content.js:3679:  async function sendReply(replyText, context) {
plugin/content.js:3750:    prepareReply:         prepareReply,
plugin/content.js:3751:    sendReply:            sendReply,
plugin/content.js:3762:// TODO V2.0 改造: W4 新增 toConversationEvent；prepareReply / sendReply 保留到 W5。
plugin/content.js:4046:  async function prepareReply() {
plugin/content.js:4051:  async function sendReply(replyText) {
plugin/content.js:4117:    prepareReply:         prepareReply,
plugin/content.js:4118:    sendReply:            sendReply,
plugin/content.js:4129:// TODO V2.0 改造: W4 新增 toConversationEvent；prepareReply / sendReply 保留到 W5。
plugin/content.js:4356:  async function prepareReply() {
plugin/content.js:4361:  async function sendReply(replyText) {
plugin/content.js:4405:    prepareReply:         prepareReply,
plugin/content.js:4406:    sendReply:            sendReply,
plugin/content.js:4760:      adapter:  { adapterKey: 'fake/test', sendReply: function () {} },
plugin/content.js:4767:      adapter:  { adapterKey: 'fake/test', sendReply: function () {} },
plugin/content.js:4774:      adapter:  { adapterKey: 'fake/test', sendReply: function () {} },
plugin/content.js:4788:      adapter:  { adapterKey: 'fake/test', sendReply: function () {} },
plugin/content.js:4792:      _expect(rUnstable.ok,   false, 'preCheck rejects L3 unstable'),
plugin/content.js:4793:      _expect(rInflight.ok,   false, 'preCheck rejects batch in SENDING'),
plugin/content.js:4794:      _expect(rDup.ok,        false, 'preCheck rejects duplicate replyText'),
plugin/content.js:4795:      _expect(rNoAdapter.ok,  false, 'preCheck rejects null adapter'),
plugin/content.js:4796:      _expect(rOk.ok,         true,  'preCheck passes valid'),
plugin/content.js:4821:    // 主动测试 lock/unlock 周期 + 各状态下 sendReply 行为
plugin/content.js:4826:    var blockedAfterLock = await adapter.sendReply('self-check-locked')
plugin/content.js:4830:    var afterUnlock = await adapter.sendReply('self-check-unlocked')
plugin/content.js:4837:      _expect(blockedAfterLock && blockedAfterLock.ok, false, 'adapter.sendReply blocked when flag locked'),
plugin/content.js:4842:              'sendReply enters real flow after unlock'),
```

## 附录 B:Inv Task 2 原始输出

```text
send-confirm.js 不存在
pre-check.js 不存在
-rw-r--r--@ 1 caihongyang  staff  15416 May 29 19:34 plugin/runtime/batch-manager.js
-rw-r--r--@ 1 caihongyang  staff  7444 May 29 19:34 plugin/runtime/queue-manager.js
=== 谁引用 send-confirm ===
plugin/build.js:61:  'runtime/send-confirm.js',              // M4: lenient confirm
=== 谁引用 pre-check ===
plugin/build.js:56:  // ── Adapter base（被 pre-check 和 adapters/** 共同依赖）──────────
plugin/build.js:62:  'runtime/pre-check.js',                 // M4: 发送门禁（依赖 helpers）
plugin/runtime/runtime-manager.js:279:  // 完整链路：pre-check → adapter.prepareReply → state.SENDING → adapter.sendReply
plugin/runtime/runtime-manager.js:317:    if (!PreCheck || !Confirm) return Promise.resolve({ ok: false, reason: 'pre-check/confirm-not-loaded' })
plugin/content.js:2843:  // 完整链路：pre-check → adapter.prepareReply → state.SENDING → adapter.sendReply
plugin/content.js:2881:    if (!PreCheck || !Confirm) return Promise.resolve({ ok: false, reason: 'pre-check/confirm-not-loaded' })
=== 谁引用 batch-manager ===
plugin/build.js:46:  'runtime/batch-manager.js',             // M2+M4: batch 状态机 + stable_wait
plugin/content.js:1012:// MODULE: runtime/batch-manager.js
=== 谁引用 queue-manager ===
plugin/build.js:47:  'runtime/queue-manager.js',             // M2: 调度队列
plugin/content.js:1415:// MODULE: runtime/queue-manager.js
```

## 附录 C:Inv Task 3 原始输出

```text
=== laike-message.adapter.js 里的发送方法 ===
1:// TODO V2.0 改造: W4 新增 toConversationEvent；prepareReply / sendReply 保留到 W5。
303:  function toConversationEvent(rawMsg, sessionInfo) {
330:  async function buildBatch(messages, context) {
338:  async function prepareReply(replyText, context) {
345:  async function sendReply(replyText, context) {
414:    toConversationEvent:  toConversationEvent,
415:    buildBatch:           buildBatch,
416:    prepareReply:         prepareReply,
417:    sendReply:            sendReply,
=== feige.adapter.js 里的发送方法 ===
1:// TODO V2.0 改造: W4 新增 toConversationEvent；prepareReply / sendReply 保留到 W5。
199:  async function buildBatch() { return null }
201:  function toConversationEvent(rawMsg, sessionInfo) {
228:  async function prepareReply() {
233:  async function sendReply(replyText) {
275:    toConversationEvent:  toConversationEvent,
276:    buildBatch:           buildBatch,
277:    prepareReply:         prepareReply,
278:    sendReply:            sendReply,
=== private-message.adapter.js 里的发送方法 ===
1:// TODO V2.0 改造: W4 新增 toConversationEvent；prepareReply / sendReply 保留到 W5。
256:  async function buildBatch() { return null }
258:  function toConversationEvent(rawMsg, sessionInfo) {
285:  async function prepareReply() {
290:  async function sendReply(replyText) {
354:    toConversationEvent:  toConversationEvent,
355:    buildBatch:           buildBatch,
356:    prepareReply:         prepareReply,
357:    sendReply:            sendReply,
### adapter external refs
plugin/runtime/runtime-manager.js:279:  // 完整链路：pre-check → adapter.prepareReply → state.SENDING → adapter.sendReply
plugin/runtime/runtime-manager.js:371:        return typeof adapter.prepareReply === 'function' ? adapter.prepareReply(replyText, lkContext) : null
plugin/runtime/runtime-manager.js:376:        return adapter.sendReply(replyText, lkContext)
plugin/runtime/legacy-collector.js:54:    if (typeof adapter.getMessages !== 'function' || typeof adapter.toConversationEvent !== 'function') {
plugin/runtime/legacy-collector.js:61:      .map(function (m) { return adapter.toConversationEvent(m, info) })
plugin/runtime/self-check.js:267:    var blockedAfterLock = await adapter.sendReply('self-check-locked')
plugin/runtime/self-check.js:271:    var afterUnlock = await adapter.sendReply('self-check-unlocked')
plugin/runtime/self-check.js:278:      _expect(blockedAfterLock && blockedAfterLock.ok, false, 'adapter.sendReply blocked when flag locked'),
plugin/adapters/douyin/laike-message.adapter.js:1:// TODO V2.0 改造: W4 新增 toConversationEvent；prepareReply / sendReply 保留到 W5。
plugin/adapters/douyin/laike-message.adapter.js:303:  function toConversationEvent(rawMsg, sessionInfo) {
plugin/adapters/douyin/laike-message.adapter.js:414:    toConversationEvent:  toConversationEvent,
plugin/adapters/douyin/feige.adapter.js:1:// TODO V2.0 改造: W4 新增 toConversationEvent；prepareReply / sendReply 保留到 W5。
plugin/adapters/douyin/feige.adapter.js:201:  function toConversationEvent(rawMsg, sessionInfo) {
plugin/adapters/douyin/feige.adapter.js:275:    toConversationEvent:  toConversationEvent,
plugin/adapters/douyin/private-message.adapter.js:1:// TODO V2.0 改造: W4 新增 toConversationEvent；prepareReply / sendReply 保留到 W5。
plugin/adapters/douyin/private-message.adapter.js:258:  function toConversationEvent(rawMsg, sessionInfo) {
plugin/adapters/douyin/private-message.adapter.js:354:    toConversationEvent:  toConversationEvent,
plugin/content.js:2843:  // 完整链路：pre-check → adapter.prepareReply → state.SENDING → adapter.sendReply
plugin/content.js:2935:        return typeof adapter.prepareReply === 'function' ? adapter.prepareReply(replyText, lkContext) : null
plugin/content.js:2940:        return adapter.sendReply(replyText, lkContext)
plugin/content.js:3335:// TODO V2.0 改造: W4 新增 toConversationEvent；prepareReply / sendReply 保留到 W5。
plugin/content.js:3637:  function toConversationEvent(rawMsg, sessionInfo) {
plugin/content.js:3748:    toConversationEvent:  toConversationEvent,
plugin/content.js:3762:// TODO V2.0 改造: W4 新增 toConversationEvent；prepareReply / sendReply 保留到 W5。
plugin/content.js:4019:  function toConversationEvent(rawMsg, sessionInfo) {
plugin/content.js:4115:    toConversationEvent:  toConversationEvent,
plugin/content.js:4129:// TODO V2.0 改造: W4 新增 toConversationEvent；prepareReply / sendReply 保留到 W5。
plugin/content.js:4329:  function toConversationEvent(rawMsg, sessionInfo) {
plugin/content.js:4403:    toConversationEvent:  toConversationEvent,
plugin/content.js:4470:    if (typeof adapter.getMessages !== 'function' || typeof adapter.toConversationEvent !== 'function') {
plugin/content.js:4477:      .map(function (m) { return adapter.toConversationEvent(m, info) })
plugin/content.js:4826:    var blockedAfterLock = await adapter.sendReply('self-check-locked')
plugin/content.js:4830:    var afterUnlock = await adapter.sendReply('self-check-unlocked')
plugin/content.js:4837:      _expect(blockedAfterLock && blockedAfterLock.ok, false, 'adapter.sendReply blocked when flag locked'),
```

## 附录 D:Inv Task 4 原始输出

```text
plugin/background.js:176:        collector_v1_enabled: true,
plugin/background.js:187:        collector_v1_enabled: false,
plugin/runtime/legacy-collector.js:77:      if (!Flags.get('collector_v1_enabled') || _collecting) return
plugin/runtime/legacy-collector.js:106:    if (Flags.get('collector_v1_enabled')) start()
plugin/shared/constants.js:133:    collector_v1_enabled: false,
plugin/content.js:138:    collector_v1_enabled: false,
plugin/content.js:4493:      if (!Flags.get('collector_v1_enabled') || _collecting) return
plugin/content.js:4522:    if (Flags.get('collector_v1_enabled')) start()
### processMessageSession / collectMessageSession
plugin/runtime/legacy-collector.js:48:  async function collectMessageSession(sessionInfo) {
plugin/runtime/legacy-collector.js:64:    Logger.info && Logger.info('LegacyCollector', 'collectMessageSession', {
plugin/runtime/legacy-collector.js:79:      try { await collectMessageSession() } catch (err) {
plugin/runtime/legacy-collector.js:134:    collectMessageSession: collectMessageSession,
plugin/content.js:4464:  async function collectMessageSession(sessionInfo) {
plugin/content.js:4480:    Logger.info && Logger.info('LegacyCollector', 'collectMessageSession', {
plugin/content.js:4495:      try { await collectMessageSession() } catch (err) {
plugin/content.js:4550:    collectMessageSession: collectMessageSession,
```

## 附录 E:Inv Task 5 原始输出

```text
201:      adapter:  { adapterKey: 'fake/test', sendReply: function () {} },
208:      adapter:  { adapterKey: 'fake/test', sendReply: function () {} },
215:      adapter:  { adapterKey: 'fake/test', sendReply: function () {} },
229:      adapter:  { adapterKey: 'fake/test', sendReply: function () {} },
257:    if (!F || !R) return [{ label: 'sendlock.deps', ok: false }]
259:    if (!adapter) return [{ label: 'sendlock.adapter', ok: false }]
262:    // 主动测试 lock/unlock 周期 + 各状态下 sendReply 行为
267:    var blockedAfterLock = await adapter.sendReply('self-check-locked')
271:    var afterUnlock = await adapter.sendReply('self-check-unlocked')
278:      _expect(blockedAfterLock && blockedAfterLock.ok, false, 'adapter.sendReply blocked when flag locked'),
283:              'sendReply enters real flow after unlock'),
```
