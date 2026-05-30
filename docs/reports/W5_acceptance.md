# W5 Acceptance Report

Date: 2026-05-31

## Scope

W5 Round 2, scope A:

- `collector_v1_enabled` default switched to `true`.
- Removed pure send/auto-reply code from the W4 collector path.
- Kept old V1.9 runtime modules for future cleanup, except `runtime-manager.sendInBatch`.
- Kept `adapter-registry` resolve/register behavior for collection.

## Fix Task 1: Default Collector On

Changed:

- `plugin/shared/constants.js`: `collector_v1_enabled: true`
- `plugin/content.js`: rebuilt from source

Real page validation:

- User reloaded extension and Douyin private-message page.
- Without manual flag command, collector started on real page.
- Console evidence:
  - `[V19][EventQueue] restored`
  - `[V19][EventUploader] started`
  - `[V19][LegacyCollector] started`
  - `[V19][EventUploader] uploaded {accepted: 1, duplicated: 0, rejected: 0}`
  - `[V19][EventUploader] uploaded {accepted: 3, duplicated: 0, rejected: 0}`

Note:

- During validation, one temporary `401` was caused by local server restart with a mismatched `JWT_SECRET`.
- Server was restarted with the repository `.env` JWT secret while still pointing to local MySQL 3306, then upload succeeded.

## Fix Task 2: Self-check Send Cases Removed

Removed from `plugin/runtime/self-check.js`:

- `_checkSendLock()`
- `_checkPreCheck()`
- `RpaSendConfirm` / `RpaPreCheck` global checks
- sendlock/preCheck calls in `run()`

Verification:

```text
node --check plugin/runtime/self-check.js
```

Result: passed.

## Fix Task 3: runtime-manager.sendInBatch Removed

Removed from `plugin/runtime/runtime-manager.js`:

- `sendInBatch`
- `_walkToDeciding`
- `_walkBatchToDeciding`
- `RpaPreCheck` / `RpaSendConfirm` dependencies
- `sendInBatch` export

Verification:

```text
node --check plugin/runtime/runtime-manager.js
```

Result: passed.

## Fix Task 4: Douyin Adapter Send Methods Removed

Removed from all three Douyin adapters:

- `buildBatch`
- `prepareReply`
- `sendReply`
- `confirmReply`
- corresponding `Registry.register()` fields

Files:

- `plugin/adapters/douyin/laike-message.adapter.js`
- `plugin/adapters/douyin/private-message.adapter.js`
- `plugin/adapters/douyin/feige.adapter.js`

Kept collector methods:

- `matchPage`
- `detectSessions`
- `selectTriggerSession`
- `switchSession`
- `confirmActiveSession`
- `getMessages`
- `classifyMessage`
- `toConversationEvent`
- `buildRuntimeContext`

Verification:

```text
node --check plugin/adapters/douyin/laike-message.adapter.js
node --check plugin/adapters/douyin/private-message.adapter.js
node --check plugin/adapters/douyin/feige.adapter.js
```

Result: passed.

## Fix Task 5: adapter-registry Send Lock Removed

Changed `plugin/runtime/adapter-registry.js`:

- Removed `SEND_RUNTIME_METHODS`.
- Removed `_wrapSendMethods`.
- Removed send method lock behavior.
- Registration validation now requires collector methods:
  - `getMessages`
  - `toConversationEvent`
- Kept `register`, `resolve`, `getByKey`, `getByPage`, `list`, `unregister`.

Verification:

```text
node --check plugin/runtime/adapter-registry.js
```

Result: passed.

## Fix Task 6: build.js Cleaned

Removed build references:

- `runtime/send-confirm.js`
- `runtime/pre-check.js`

Kept:

- `runtime/runtime-manager.js`

Verification:

```text
cd plugin && node build.js
```

Result:

```text
[build] content.js 已生成  模块=29  大小=166.1KB
```

## Fix Task 7: Build Output Verification

Command:

```text
grep -c "function sendReply\|function prepareReply\|sendInBatch" plugin/content.js
```

Result:

```text
0
```

Command:

```text
grep -c "toConversationEvent\|collectMessageSession\|RpaEventQueue" plugin/content.js
```

Result:

```text
23
```

Syntax checks:

```text
node --check plugin/content.js
node --check plugin/build.js
```

Result: passed.

## Real Page Regression After Deletion

Douyin private-message page was tested after deleting send code and rebuilding the extension.

Console evidence:

```text
[V19][AdapterRegistry] registered douyin/laike-message
[V19][AdapterRegistry] registered douyin/private-message
[V19][AdapterRegistry] registered douyin/feige
[V19] RPC bridge ready (21 methods)
[V19][EventQueue] restored {size: 1}
[V19][EventUploader] started
[V19][LegacyCollector] started
[V19][EventUploader] uploaded {accepted: 1, duplicated: 0, rejected: 0}
[V19][LkTracer] LK-MSG-02 success douyin-private life messages scanned
[V19][EventCollector] collect {collected: 3, skipped: 14}
[V19][LegacyCollector] collectMessageSession {adapter: 'douyin/private-message', messages: 17, collected: 3, skipped: 14}
[V19][EventUploader] uploaded {accepted: 3, duplicated: 0, rejected: 0}
```

Database evidence:

```text
conversations latest:
id=14 platform=douyin platform_page=private-message customer_nickname=chase intent_label=simple_inquiry message_count=18 last_message_at=2026-05-31 05:22:52
id=11 platform=douyin platform_page=private-message customer_nickname=chase intent_label=price_inquiry message_count=98 last_message_at=2026-05-31 05:22:59

messages latest:
id=144 conversation_id=11 direction=inbound content_text=早上好啊 occurred_at=2026-05-31 05:18:00 uploaded_at=2026-05-31 05:23:00
id=143 conversation_id=11 direction=inbound content_text=早上好3 occurred_at=2026-05-31 05:06:00 uploaded_at=2026-05-31 05:23:00
id=142 conversation_id=11 direction=outbound content_text=通过我们报名可额外领取200元京东卡补贴，还有一对一选校指导，赶紧行动吧！ occurred_at=2026-05-31 05:22:59 uploaded_at=2026-05-31 05:23:00
id=141 conversation_id=14 direction=outbound content_text=通过我们报名可额外领取200元京东卡补贴，还有一对一选校指导，赶紧行动吧！ occurred_at=2026-05-31 05:22:52 uploaded_at=2026-05-31 05:22:55

duplicate_message_ids=0

workorders latest:
id=8 conversation_id=14 workorder_type=inquiry status=pending priority=5 title=线索跟进:chase created_at=2026-05-31 05:21:42
```

## Git Log

```text
48f72f9 feat(W5): round2 - switch flag default on, remove send/auto-reply code
f996855 fix(W4.5): restore missing platform utils (extractDetectHosts/getPlatformAliases)
7cf17a2 docs(W4): record real douyin acceptance results
f266b35 fix(W4): normalize stale local server url in uploader
386aad4 fix(W4): use chatsift local server port in plugin popup
fb6843e fix(W4): load adapter helpers after identity resolver
469fa75 fix(W4): actively start collector from popup
```
