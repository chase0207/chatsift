# W6 Acceptance — Admin 会话中心 + 工单中心

## 范围

- 已完成会话中心: 会话列表、筛选、分页、会话详情、消息流。
- 已完成工单中心: 工单列表、筛选、分页、处理弹窗、状态变更。
- 已完成菜单路由挂载: `/conversations`、`/conversations/:id`、`/workorders`。
- 已完成品牌文案替换: `RPA系统` / `1.9.0` / 旧标题替换为 `Chatsift` / `v1.0.0`。
- 未处理 `dashboard/stats` 500, 按 W6 v1.1.0 挂起到 W9。

## 文件变更

- `admin/src/api/conversations.js`
- `admin/src/api/workorders.js`
- `admin/src/views/Conversations.vue`
- `admin/src/views/ConversationDetail.vue`
- `admin/src/views/Workorders.vue`
- `admin/src/router/index.js`
- `admin/src/layouts/MainLayout.vue`
- `admin/src/views/Login.vue`
- `admin/src/views/Dashboard.vue`
- `admin/index.html`
- `admin/package.json`
- `admin/package-lock.json`

阶段一遗留脚手架修复也随本次提交进入工作区:

- `admin/.env.development`
- `admin/public/logo.png`
- `admin/src/directives/perm.js`
- `admin/src/style.css`

## 验收结果

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 构建 | 通过 | `cd admin && npm run build` 成功, 仅有 Vite/Rolldown 依赖注释 warning 和 chunk size warning |
| 菜单路径 | 通过 | `/api/menus/tree` 已确认 `会话中心=/conversations`, `工单中心=/workorders` |
| 会话列表 | 通过 | 浏览器访问 `/conversations`, 显示真实会话 14 条, 首条 `chase`, `private-message`, `询价`, `消息数 98` |
| 会话筛选接口 | 通过 | `GET /api/v1/conversations?page=1&page_size=2&platform=douyin&intent_label=price_inquiry` 返回 `code=0,total=5` |
| 会话详情 | 通过 | 浏览器访问 `/conversations/11`, 显示 `chase` 会话详情和消息流 |
| 消息流接口 | 通过 | `GET /api/v1/conversations/11/messages?page=1&page_size=3` 返回 `code=0,total=98`, 含 inbound/outbound 消息 |
| 工单列表 | 通过 | 浏览器访问 `/workorders`, 显示真实工单 8 条, 含投诉/预约/报价/咨询 |
| 工单筛选接口 | 通过 | `GET /api/v1/workorders?page=1&page_size=2&workorder_type=pricing` 返回 `code=0,total=3` |
| 工单状态更新 | 通过 | `PATCH /api/v1/workorders/7` 从 `pending` 到 `processing` 后恢复 `pending`, 两次返回 `code=0` |
| 品牌文案 | 通过 | `rg "RPA系统|RPA 管理后台|多平台AI客服助手|多平台客服管理后台|Platform RPA Admin|1\\.9\\.0"` 仅旧浏览器标签缓存可见, 代码中无匹配 |

## 注意事项

- 真实页面上看到的灰色遮罩来自浏览器扩展, 非 chatsift 代码问题。
- 本次只调现有 `/api/v1` 接口, 未修改后端 controller。
- 工单派单接口已封装, 但页面只开放状态变更; 负责人选择留到后续用户体系明确后再做。

## Git

```text
HEAD feat(W6): admin conversation center + workorder center
ed9bfd2 docs(W5): finalize acceptance git log
48f72f9 feat(W5): round2 - switch flag default on, remove send/auto-reply code
f996855 fix(W4.5): restore missing platform utils (extractDetectHosts/getPlatformAliases)
7cf17a2 docs(W4): record real douyin acceptance results
f266b35 fix(W4): normalize stale local server url in uploader
386aad4 fix(W4): use chatsift local server port in plugin popup
fb6843e fix(W4): load adapter helpers after identity resolver
```
