---
文档: dom-collector 改造验收报告
版本: v1.0.0
状态: 已完成
日期: 2026-06-02
---

# dom-collector 改造验收报告

## 1. 原样迁移状态

`tools/dom-collector/` 已在提交 `2b5890b chore: 纳入并行 dom-collector 调研产物(工具 + 文档)` 中纳入 chatsift 仓库。

本次开工前执行:

```text
diff -qr /Users/caihongyang/vscode/chat_rpa/dom-collector /Users/caihongyang/vscode/chatsift/tools/dom-collector
```

结果:无差异。说明 chatsift 内工具目录仍是 chat_rpa 原始版本。

## 2. 只读合约与发送红线

已删除 4 个发送区点位定义:

- `inputBox`
- `sendButton`
- `sendButtonDisabledState`
- `inputDisabledHint`

处理范围:

- `tools/dom-collector/content.js`
- `tools/dom-collector/popup/popup.js`
- `tools/dom-collector/dom-snapshots/*.selectors.json` 已删除旧样本,避免旧 RPA 点位和回复区样本文本误导后续 grep
- `tools/dom-collector/README.md`

`README.md` 已重写为 Chatsift 只读选择器调研工具说明,删除 `sendReply`、`verifySent`、输入框、发送按钮等旧 RPA 合约表述。

红线 grep 结论:

```text
无 inputBox/sendButton/sendButtonDisabledState/inputDisabledHint 点位定义
无旧发送点位 key、无 submit/sendReply/verifySent 等发送执行逻辑。`sendMessageWithInjection`/`chrome.tabs.sendMessage` 是扩展内部消息通信,`a.click()` 是浏览器下载 JSON,不触达客服页面。
```

保留项:

- `closedHint`:会话关闭态
- `loginDialog`:登录态
- `historyLoadTrigger`:加载历史

这些均为只读状态点位,不属于发送能力。

## 3. ABC 点位清单

点位已从旧 RPA 平铺/分组改为 ABC 三层。

### A 会话级

| key | 标签 | 必要性 |
|---|---|---|
| `sessionTitle` | 客户昵称 | 必采 |
| `agentAccount` | 客服账号 | 必采 |
| `sessionTab` | 会话Tab | 建议 |
| `sourceTag` | 来源标签 | 建议 |
| `leadStatusTag` | 留资状态标签 | 建议 |
| `loginDialog` | 登录态 | 保留 |
| `closedHint` | 会话关闭态 | 保留 |

### B 消息级

| key | 标签 | 必要性 |
|---|---|---|
| `messageItem` | 消息容器 | 必采 |
| `messageText` | 用户消息文本 | 必采 |
| `selfMessageText` | 自己消息文本 | 必采 |
| `messageTypeAnchor` | 消息类型判别锚 | 建议 |
| `messageSenderName` | 用户发送者名 | 建议 |
| `selfMessageSenderName` | 自己发送者名 | 建议 |
| `historyLoadTrigger` | 加载历史触发器 | 保留 |

### C 段落级

| key | 标签 | 必要性 |
|---|---|---|
| `timeSeparator` | 时间分隔条 | 必采 |

## 4. 给 CC 的逻辑推导说明

已写入 `tools/dom-collector/README.md`:

| 字段 | 说明 |
|---|---|
| 方向 | 由 `messageText` / `selfMessageText` 命中情况推导 |
| 顺序 | 按 `messageItem` DOM 顺序 + 时间单调保序 |
| inbound 精确时间 | 从文本节点爬到 `flex-1 flex-col` 容器,查找 `p.invisible.whitespace-nowrap.absolute` |
| outbound 精确时间 | 采不到常驻精确时间,继承最近 `timeSeparator` 锚点 |
| 去重 | DOM 无原生 msg_id,运行时合成 message_id |
| accountId | DOM 不暴露,adapter 读 URL 或降级合成 |

这些字段不作为点位导出。

## 5. Chatsift 平台/页面体系

已对接 Chatsift 接口:

- 登录:`/api/auth/login`
- 平台树:`/api/platforms?enabled=1`
- 默认接口地址:`http://127.0.0.1:3100`

页面 key 适配:

- 抖音私信:`private-message`
- 来客私信:`laike-message`
- 飞鸽:`feige`
- 其它页面回退 `page_key/page_code/id/page_name`

导出 schema:

```text
chatsift-dom-collector.v1
```

## 6. 导出结构

导出保持多策略选择器结构:

```json
{
  "schema_version": "chatsift-dom-collector.v1",
  "platform_key": "douyin",
  "page_key": "private-message",
  "url_pattern": "...",
  "capture_points": {},
  "validation_summary": {},
  "selectors": {}
}
```

每个点位仍包含:

- `primary`
- `css_list`
- `xpath`
- `text_xpath`
- `dom_path`
- `sample_html`
- `stable_classes`

导出前仍调用 `validateCollectedSelectors` 验证已采选择器。

## 7. 不影响生产

本次未修改:

- `plugin/`
- `server/`
- `admin/`
- W4-W12.6 采集运行时

`tools/dom-collector/` 是独立工具目录,不进入插件构建、不进入后台构建、不进入服务端运行。

## 8. 验证

已执行:

```text
node -c tools/dom-collector/content.js
node -c tools/dom-collector/popup/popup.js
```

红线检查:

```text
rg "inputBox|sendButton|sendButtonDisabledState|inputDisabledHint|sendReply|verifySent|点击发送|填输入框|submit" tools/dom-collector
```

结果:无命中。

宽泛检查:

```text
rg "send|发送|reply|输入框|\\.click\\(" tools/dom-collector
```

结果只剩:

- `messageSenderName`/`selfMessageSenderName`:消息级只读点位。
- `chrome.runtime.onMessage`、`sendResponse`、`chrome.tabs.sendMessage`:Chrome 扩展内部通信。
- `a.click()`:导出 JSON 的浏览器下载动作。

结论:无客服回复区点位,无填输入框、点发送、提交回复的执行逻辑。

独立性检查:

```text
rg "tools/dom-collector|dom-collector" plugin server admin
```

结果:运行时目录无引用。

## 9. 备注

本次存在无关工作区改动:

- `admin/src/main.js`
- `admin/src/stores/user.js`

这些文件未触碰、未纳入本次提交。
