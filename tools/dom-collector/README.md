# Chatsift DOM 调研工具

独立 Chrome MV3 工具,用于人工点选客服平台页面上的关键 DOM 元素,生成多策略选择器并导出 `selectors.json`。它是扩平台时给 CC 开发 adapter 的调研辅助工具,不是 Chatsift 运行时采集器。

## 边界

- 只读:不采集消息数据、不上报业务数据、不操作客服回复区。
- 独立:位于 `tools/dom-collector/`,不进入 `plugin/` 构建,不影响 W4-W12.6 采集链路。
- 输出:导出 JSON 后由人工转发给 CC,不自动下发 `dom-adapter-config`。

## 加载方式

1. 打开 Chrome 或 Edge 的 `chrome://extensions/`。
2. 打开“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择 `chatsift/tools/dom-collector/`。

## 使用流程

1. 打开目标平台页面。
2. 打开 “Chatsift DOM 调研工具” 侧边栏。
3. 登录 Chatsift 管理后台接口地址,本地默认 `http://127.0.0.1:3100`。
4. 选择平台和页面。
5. 点击“开始采集”。
6. 按 ABC 点位逐项在页面上点选 DOM。
7. 点击“立即验证”,确认选择器能重新命中。
8. 点击“保存并导出JSON”。

## 点位清单

点位只收集 DOM 上看得见、点得到的元素。逻辑推导字段不列点位。

### A 会话级

| key | 标签 | 必要性 | 说明 |
|---|---|---|---|
| `sessionTitle` | 客户昵称 | 必采 | 会话标题或昵称节点 |
| `agentAccount` | 客服账号 | 必采 | 当前接待客服账号节点 |
| `sessionTab` | 会话Tab | 建议 | 当前咨询、历史咨询等 tab |
| `sourceTag` | 来源标签 | 建议 | 经营源、自然流量等来源 |
| `leadStatusTag` | 留资状态标签 | 建议 | 已留资、未留资等标签 |
| `loginDialog` | 登录态 | 保留 | 登录失效弹窗或状态节点 |
| `closedHint` | 会话关闭态 | 保留 | 会话关闭、超时或不可继续处理状态 |

### B 消息级

| key | 标签 | 必要性 | 说明 |
|---|---|---|---|
| `messageItem` | 消息容器 | 必采 | 单条消息根节点,逐条遍历锚 |
| `messageText` | 用户消息文本 | 必采 | 用户侧文本气泡节点 |
| `selfMessageText` | 自己消息文本 | 必采 | 客服侧文本气泡节点 |
| `messageTypeAnchor` | 消息类型判别锚 | 建议 | 图片、卡片、系统消息等区分节点 |
| `messageSenderName` | 发送者名 | 建议 | 消息上方发送者名节点 |
| `historyLoadTrigger` | 加载历史触发器 | 保留 | 加载更多历史消息入口 |

### C 段落级

| key | 标签 | 必要性 | 说明 |
|---|---|---|---|
| `timeSeparator` | 时间分隔条 | 必采 | 居中的时间节点,作为段落锚点 |

## 给 CC 的逻辑推导说明

以下字段不是点位,不要在工具中点选,由 adapter 运行时推导:

| 字段 | 实现逻辑 |
|---|---|
| 方向 | 命中 `messageText` 视为 inbound,命中 `selfMessageText` 视为 outbound;必要时结合消息容器左右 class |
| 消息顺序 | 按 `messageItem` DOM 从上到下排序,结合时间做单调保序 |
| inbound 精确时间 | 从消息文本节点向上爬到 `flex-1 flex-col` 列容器,查找 `p.invisible.whitespace-nowrap.absolute` 隐藏兄弟时间节点 |
| outbound 精确时间 | 采不到常驻精确时间,继承最近 `timeSeparator` 锚点并按 DOM 顺序保序 |
| 消息唯一标识 | DOM 无原生 msg_id,用会话 + 方向 + 内容 + DOM seq 合成 |
| accountId | DOM 不暴露,若平台 URL 有稳定参数则由 adapter 读 URL;拿不到时用 pageKey + nickname 等合成会话标识 |

## 导出 JSON

导出结构:

```json
{
  "schema_version": "chatsift-dom-collector.v1",
  "platform_key": "douyin",
  "page_key": "private-message",
  "url_pattern": "life.douyin.com/cs/web/clue_private_message",
  "capture_points": {
    "required_total": 6,
    "required_implemented": 6,
    "points": []
  },
  "validation_summary": {},
  "selectors": {}
}
```

每个 selector 包含 `primary/css_list/xpath/text_xpath/dom_path/sample_html` 等多策略结果。导出前会自动验证已采点位,核心必采点未命中时会要求确认。

## 红线核查

工具内不保留旧 RPA 发送区四类点位。全局也不应存在操作客服回复区的执行逻辑。
