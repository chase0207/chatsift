# RPA DOM 采集器

这是一个独立的 Chrome 插件，用于可视化采集任意客服/直播平台页面的关键 DOM 选择器，并导出给 RPA 主插件迁移使用的 JSON。

## 加载方式

1. 打开 Chrome 或 Edge。
2. 访问 `chrome://extensions/`。
3. 打开右上角“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择目录：`/Users/caihongyang/vscode/chat_rpa/dom-collector/`。

## 使用方式

1. 打开目标客服或直播后台页面。
2. 点击浏览器右上角 “RPA DOM 采集器” 插件，采集面板会在浏览器右侧侧边栏打开。
3. 点击右上角“登录”，使用管理后台账号登录后，在“选择平台”和“选择页面”下拉框中选择目标页面。URL 核对框会自动展示当前页面的 URL 特征，仅用于确认，不支持手工修改。
4. 点击“开始采集”。
5. 在“采集进度”里点选当前要采集的元素类型。
6. 回到页面，点击对应 DOM。右侧采集面板会保持打开，页面右下角也会显示当前采集类型。
7. 重复第 5-6 步，依次采集下方“采集进度”中的点位。M0/V1.9.x 默认清单包含会话列表、会话身份、会话校验、消息区、发送区、异常态六类点位；分组默认收起，右侧会显示“已采 a/b”。
8. 点击“验证选择器”，采集器会在当前页面按已采集的选择器重新查找 DOM，并高亮命中的元素。
9. 验证通过后，点击“保存并导出JSON”。抖音私信和抖音客服消息建议分别导出 JSON，不要混用。

## 验证选择器

“验证选择器”用于确认采集结果是否能在当前页面重新命中，避免导出的 JSON 只有样本、不能复用。

验证时会按以下顺序尝试：

1. `primary`
2. `css_list`
3. `xpath`
4. `text_xpath`

验证后不再单独展示重复的验证结果列表，而是直接回写到采集进度卡片：

- 命中：页面临时高亮，采集卡保持绿色。
- 可选项无样本：不标红。
- 必采项未命中：采集卡变为红色并显示“校验失败”。
- 未采集：保持灰色。

点击“保存并导出JSON”时会自动执行一次验证。若 `会话列表容器 / 单个会话条目 / 消息列表容器 / 用户消息气泡 / 输入框 / 发送按钮` 中有未命中的核心项，会先弹窗确认是否仍然导出。

## 导出 JSON 格式

导出的文件名为：

```text
{platform_key}-{page_key}.selectors.json
```

固定导出目录：

```text
dom-collector/dom-snapshots/
```

首次导出时浏览器会弹出目录授权框，请选择本仓库下的 `dom-collector/dom-snapshots/`。浏览器不允许扩展静默写入本地仓库目录；授权后文件会写入该目录。若浏览器不支持目录授权，会退回普通下载。

核心字段：

```json
{
  "platform_name": "美团经营宝",
  "platform_key": "meituan_jyb",
  "url_pattern": "g.dianping.com",
  "captured_at": "2026-05-17T18:30:00.000Z",
  "selectors": {
    "contactList": {
      "primary": "div[class*=\"chat-list\"]",
      "css_list": [],
      "xpath": "//div[contains(@class,\"chat-list\")]",
      "tag": "div",
      "sample_html": ""
    }
  }
}
```

## 如何用于 RPA 主插件

把导出的 JSON 作为平台 DOM 调研证据，优先使用：

1. `selectors.{type}.primary`
2. `selectors.{type}.css_list`
3. `selectors.{type}.xpath`
4. `selectors.{type}.text_xpath`

迁移到主插件时，通常对应：

- `contactList`：会话列表容器
- `contactItem`：单个会话条目
- `unreadBadge`：未读消息或倒计时触发点
- `activeContactItem`：当前选中会话，用于 `verifySession`
- `sessionTitle`：会话标题/昵称，用于校验是否切到目标会话
- `messageList`：消息列表容器，用于限定消息扫描范围
- `messageText`：最新用户消息
- `selfMessageText`：自己消息，用于判断消息方向，避免把自己回复当成用户消息
- `inputBox`：回复输入框
- `sendButton`：发送按钮
- `closedHint`：会话关闭/超时提示，用于给出“发送失败，对话已关闭/未找到”的准确原因

## 抖音 adapter 合约映射

抖音私信和抖音客服消息的主插件适配应按以下链路验证：

```text
detect -> findTrigger -> switchSession -> verifySession -> collectMessages -> sendReply -> verifySent
```

点位对应关系：

| 合约步骤 | 主要点位 | 说明 |
|---------|----------|------|
| `detect` | URL 特征、会话列表容器 | 判断当前页面是否属于目标平台和页面 |
| `findTrigger` | 未读消息角标、单个会话条目 | 优先用小红点/数字角标定位目标会话，没有未读时再处理当前选中会话 |
| `switchSession` | 单个会话条目 | 点击目标会话，并等待消息列表稳定 |
| `verifySession` | 当前选中会话、会话标题/昵称 | 防止会话没有切换成功或切到其他人 |
| `collectMessages` | 消息列表容器、用户消息气泡、自己消息气泡 | 只提取用户侧新消息，明确排除自己回复和系统提示 |
| `sendReply` | 输入框、发送按钮、会话关闭提示 | 找不到输入框时结合关闭提示给出准确失败原因 |
| `verifySent` | 自己消息气泡、输入框 | 判断回复是否实际发送成功 |

## M0 / V1.9.x 点位清单

同一个“平台-页面”的全部点位必须导出到同一个 JSON。导出文件会包含：

```json
{
  "schema_version": "dom-collector.v1.9",
  "platform_key": "douyin",
  "page_key": "private-message",
  "capture_points": {
    "required_total": 12,
    "required_implemented": 12,
    "points": []
  },
  "selectors": {}
}
```

建议抖音 M0 采集两个页面：

```text
douyin-private-message.selectors.json
douyin-laike-customer-service.selectors.json
```

必采点位：

| key | 标签 | 用途 |
|---|---|---|
| contactList | 会话列表容器 | detect 和 observer 绑定 |
| contactItem | 单个会话条目 | 点击切换目标会话 |
| sessionPreviewText | 会话末条消息预览 | DiffEngine 四信号之一 |
| activeContactItem | 当前选中会话 | verifySession 防串号 |
| activeSessionMarker | 选中态标识 | 判断会话是否真的切换 |
| sessionTitle | 会话标题/昵称 | 确认目标会话 |
| messageList | 消息列表容器 | 限定消息扫描范围 |
| messageItem | 单条消息容器 | 消息方向、时间、内容的父容器 |
| messageText | 用户消息气泡 | 用户侧文本消息 |
| selfMessageText | 自己消息气泡 | 避免自己消息误判 |
| inputBox | 输入框 | 回复输入目标 |
| sendButton | 发送按钮 | 回复发送动作 |

可选但建议采集点位：

| key | 标签 | 用途 |
|---|---|---|
| sessionTimestamp | 会话时间戳 | DiffEngine 时间信号 |
| sessionUnreadCount | 未读数字文本 | 未读数量 |
| unreadBadge | 未读消息角标 | 未读红点/数字触发点 |
| sessionAvatar | 会话头像 | 辅助生成会话签名 |
| sessionUserIdNode | 用户ID/主页节点 | 稳定用户标识 |
| loadingIndicator | 会话加载中标识 | 等待切换稳定 |
| messageTimestamp | 消息时间 | 消息级时间戳 |
| messageSenderName | 消息发送人/昵称 | 复杂页面辅助识别 |
| messageSystemText | 系统提示消息 | 排除系统提示/时间分割 |
| messageProductCard | 商品/咨询卡片 | 识别商品卡片上下文 |
| messageImage | 图片消息 | 识别图片消息 |
| sendButtonDisabledState | 发送按钮禁用态 | 判断发送不可用原因 |
| inputDisabledHint | 输入不可用提示 | 禁言/关闭/不可回复原因 |
| closedHint | 会话关闭提示 | 会话关闭或超时 |
| loginDialog | 登录失效弹窗 | LoginMonitor 掉线判断 |
| historyLoadTrigger | 加载历史入口 | 加载更多历史消息 |

## 注意事项

- 采集器会尽量过滤动态 hash class，例如 `contactCard-NdfsWo` 会生成 `[class*="contactCard"]`。
- 如果目标页面在 iframe 或 shadowRoot 中，导出的 `page_url`、`root_type` 可帮助判断后续是否需要特殊处理。
- 真实可用性仍要在主插件里用目标平台页面验证一次，尤其是发送按钮和输入框。
