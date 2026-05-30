---
文档: W4 验收报告
版本: v1.0.0
周次: W4
状态: Pending Manual Acceptance
---

## 变更范围

- 文档已按协作协议落盘并提交: `docs/COLLABORATION.md`, `docs/architecture/W4_design.md`, `docs/architecture/W4_tasks.md`
- 插件新增只读采集链路: `event-queue.js`, `event-collector.js`, `event-uploader.js`, `legacy-collector.js`
- 抖音三个 adapter 保留发送方法,新增 `toConversationEvent`
- `collector_v1_enabled` 默认 false,支持 `chrome.storage.local.set({ collector_v1_enabled: true })`
- `queue-manager.js` 未修改

## A 类调整

- 仓库没有旧的 `processMessageSession` 入口文件,因此 W4 新链路用 `legacy-collector.js` 自带只读 `MutationObserver` 启动器;flag 关闭时不启动,不影响旧路径。
- `manifest.json` 引用了缺失的 `background.js`,这会导致 Chrome 无法加载插件;本次补了最小 service worker,只处理登录态和日志消息。
- `build.js` 原清单引用了不存在的 `adapters/base/*`,实际仓库里是 `plugin/shared/dom-utils.js` 和 `plugin/shared/adapter-helpers.js`;本次把真实文件加入清单,旧缺失项仍按原构建逻辑跳过。
- `event-uploader.js` 兼容读取 `token/authToken/accessToken` 与 `cfg.serverUrl/serverUrl`,避免改登录流程。

## 自动化验证

```bash
node --check plugin/shared/dom-utils.js
node --check plugin/runtime/event-queue.js
node --check plugin/runtime/event-collector.js
node --check plugin/runtime/event-uploader.js
node --check plugin/runtime/legacy-collector.js
node --check plugin/adapters/douyin/private-message.adapter.js
node --check plugin/adapters/douyin/laike-message.adapter.js
node --check plugin/adapters/douyin/feige.adapter.js
node --check plugin/background.js
node --check plugin/content.js
cd plugin && node build.js --check
```

结果:全部通过。`node build.js --check` 仍提示若干迁移期缺失文件被跳过,这是 build.js 既有行为;W4 新增文件已进入 `content.js`。

## 真实页面验收

尚未执行。该步骤需要用户在已登录抖音来客页面制造真实客户消息,不使用截图。

待执行步骤:

```javascript
chrome.storage.local.set({ collector_v1_enabled: true })
```

刷新抖音页面后,观察控制台应出现:

- `LegacyCollector started`
- `collectMessageSession`
- `EventCollector collect`
- `EventUploader uploaded`

数据库验收 SQL:

```sql
SELECT id, platform, customer_nickname, intent_label, current_stage, completeness_score
FROM conversations WHERE platform='douyin' ORDER BY created_at DESC LIMIT 5;

SELECT id, direction, content_text, occurred_at
FROM messages ORDER BY uploaded_at DESC LIMIT 10;

SELECT id, workorder_type, title, completeness_score, priority, status
FROM workorders ORDER BY created_at DESC LIMIT 5;

SELECT platform_message_id, COUNT(*)
FROM messages GROUP BY platform_message_id HAVING COUNT(*) > 1;
```

期望:前三条能看到真实抖音会话/消息/工单;最后一条为空。

## Git Log

```bash
736a389 docs: collaboration protocol v1.0.0 + W4 docs v2.1.0
1f6cde1 feat(W3): goal/completeness/workorder engines
ff479b9 feat(W2): analyzer worker + rule-based intent engine
1a5cb0d feat(W1): server skeleton - 8 tables, 8 v1 route groups, events batch with dedup
```
