# Chatsift V1.0.0 API 规格

> **版本**:v1.0.0
> **前缀**:所有新接口统一 `/api/v1/`
> **鉴权**:除特别注明,所有接口需 `Authorization: Bearer <JWT>`
> **租户**:从 JWT 解析 user_id 作为 tenant_id,所有查询自动按 tenant 隔离
> **返回格式**:统一 JSON `{ code, message, data }`,code=0 成功

---

## 0. 通用约定

### 0.1 统一响应体

```json
{ "code": 0, "message": "ok", "data": { } }
```

错误时 code 非 0,message 为错误描述,data 为 null。

### 0.2 错误码表

| code | 含义 |
|---|---|
| 0 | 成功 |
| 1001 | 未授权 / token 失效 |
| 1002 | 权限不足 |
| 1003 | 参数错误 |
| 2001 | 资源不存在 |
| 3001 | LLM 配额已耗尽(降级提示) |
| 5000 | 服务端内部错误 |

### 0.3 分页约定

列表接口统一接收 `page`(默认 1)、`page_size`(默认 20,最大 100),返回:

```json
{ "code": 0, "data": { "list": [], "total": 0, "page": 1, "page_size": 20 } }
```

---

## 1. 插件 → 服务端

### 1.1 批量上报事件

```
POST /api/v1/events/batch
```

请求体:

```json
{
  "events": [
    {
      "platform": "douyin",
      "platform_page": "laike-message",
      "conversation_id": "douyin_conv_abc123",
      "message_id": "douyin_msg_xyz789",
      "direction": "inbound",
      "sender_nickname": "张三",
      "content_type": "text",
      "content_text": "你们这个多少钱",
      "content_url": null,
      "occurred_at": "2026-05-30T10:23:45+08:00"
    }
  ]
}
```

响应:

```json
{ "code": 0, "data": { "accepted": 1, "duplicated": 0, "rejected": 0 } }
```

去重规则:tenant_id + platform_message_id 已存在则计入 duplicated,不报错。
单批上限 50 条,超出返回 1003。

### 1.2 心跳

```
POST /api/v1/heartbeat
```

请求体:

```json
{
  "plugin_version": "0.1.0",
  "active_platforms": ["douyin"],
  "queue_size": 3,
  "observer_count": 2,
  "last_upload_at": "2026-05-30T10:23:00+08:00"
}
```

响应:

```json
{ "code": 0, "data": { "server_time": "2026-05-30T10:23:50+08:00", "config_version": 5 } }
```

config_version 变化时,插件应拉取最新 DOM Adapter 配置。

### 1.3 拉取 DOM Adapter 配置

```
GET /api/v1/dom-adapter-config?platform=douyin&version=5
```

响应:

```json
{
  "code": 0,
  "data": {
    "version": 6,
    "platform": "douyin",
    "selectors": { "...": "..." }
  }
}
```

version 未变化时 data.selectors 可为 null(表示无需更新)。

---

## 2. 会话中心(后台 → 服务端)

### 2.1 会话列表

```
GET /api/v1/conversations
```

权限:`conversation:list`

查询参数:`platform` / `intent_label` / `current_stage` / `keyword`(全文搜 content)/ `from` / `to` / `page` / `page_size`

响应 data.list 每项:

```json
{
  "id": 1001,
  "platform": "douyin",
  "customer_nickname": "张三",
  "intent_label": "price_inquiry",
  "intent_confidence": 0.92,
  "current_stage": "collecting",
  "completeness_score": 40,
  "message_count": 6,
  "last_message_at": "2026-05-30T10:23:45+08:00"
}
```

### 2.2 会话详情

```
GET /api/v1/conversations/:id
```

权限:`conversation:list`

响应 data 含会话主体 + 关联的 lead_id / workorder_ids。

### 2.3 会话消息列表

```
GET /api/v1/conversations/:id/messages
```

权限:`conversation:list`

响应 data.list 为按 occurred_at 升序的消息,每项含 direction / content_type / content_text / occurred_at。

---

## 3. 线索中心

### 3.1 线索列表

```
GET /api/v1/leads
```

权限:`lead:manage`

查询参数:`status` / `lead_level` / `assigned_to` / `city` / `keyword` / `page` / `page_size`

### 3.2 线索详情

```
GET /api/v1/leads/:id
```

权限:`lead:manage`

### 3.3 更新线索

```
PATCH /api/v1/leads/:id
```

权限:`lead:manage`

请求体(部分字段更新):

```json
{
  "status": "following",
  "lead_level": "high",
  "tags": ["高意向", "本地客户"],
  "assigned_to": 12,
  "customer_phone": "138...",
  "customer_wechat": "wx..."
}
```

### 3.4 标记成交

```
POST /api/v1/leads/:id/convert
```

权限:`lead:manage`

把 status 置为 converted,记录成交时间。

---

## 4. 工单中心

### 4.1 工单列表

```
GET /api/v1/workorders
```

权限:`workorder:handle`

查询参数:`workorder_type` / `status` / `assigned_to` / `priority` / `overdue`(true 筛超 SLA)/ `page` / `page_size`

响应 data.list 每项含 type / title / completeness_score / missing_fields / priority / sla_due_at / status / assigned_to。

### 4.2 工单详情

```
GET /api/v1/workorders/:id
```

权限:`workorder:handle`

响应 data 含 payload(结构化字段)/ suggestion(策略建议或报价建议)/ 关联 conversation_id、lead_id。

### 4.3 更新工单

```
PATCH /api/v1/workorders/:id
```

权限:`workorder:handle`

请求体:`status` / `payload`(补全字段)/ 备注。

### 4.4 派单

```
POST /api/v1/workorders/:id/assign
```

权限:`workorder:assign`

请求体:`{ "assigned_to": 12 }`。把 status 从 pending 改为 assigned。

---

## 5. 系统设置

### 5.1 意图规则

```
GET    /api/v1/intent-rules               权限 intent-rule:config
POST   /api/v1/intent-rules               权限 intent-rule:config
PATCH  /api/v1/intent-rules/:id           权限 intent-rule:config
DELETE /api/v1/intent-rules/:id           权限 intent-rule:config
```

POST 请求体:

```json
{
  "intent_label": "price_inquiry",
  "rule_type": "keyword",
  "pattern": "多少钱|价格|报价",
  "priority": 20,
  "enabled": 1
}
```

列表返回全局规则(tenant_id=0)+ 本企业规则,全局规则只读。

### 5.2 价格表

```
GET    /api/v1/price-table                权限 price:manage
POST   /api/v1/price-table                权限 price:manage
PATCH  /api/v1/price-table/:id            权限 price:manage
DELETE /api/v1/price-table/:id            权限 price:manage
POST   /api/v1/price-table/import         权限 price:manage  (Excel 导入,W7 实现)
```

POST 请求体:

```json
{
  "city": "上海",
  "product_name": "轿车陪驾10小时",
  "hours": 10,
  "price": 1619.00,
  "original_price": 1900.00,
  "notes": "SUV全品牌车型通用"
}
```

### 5.3 LLM 配置

```
GET /api/v1/llm-config                    权限 llm:config
PUT /api/v1/llm-config                     权限 llm:config
```

PUT 请求体:

```json
{
  "api_base": "https://api.deepseek.com/v1",
  "api_key": "sk-...",
  "model_name": "deepseek-chat",
  "monthly_token_quota": 1000000,
  "enabled": 1
}
```

GET 响应 data 含 monthly_token_used / monthly_token_quota,api_key 脱敏返回(只显示后4位)。

---

## 6. 运营分析

### 6.1 转化漏斗

```
GET /api/v1/analytics/funnel?from=&to=
```

权限:`conversation:list`

响应 data:

```json
{
  "total_conversations": 1200,
  "by_intent": { "simple_inquiry": 840, "appointment": 420, "complaint": 12, "price_inquiry": 300 },
  "leads_created": 520,
  "workorders_created": 480,
  "converted": 86
}
```

### 6.2 平台对比

```
GET /api/v1/analytics/platform-comparison?from=&to=
```

权限:`conversation:list`

V1.0.0 只有抖音,返回单平台数据,接口预留多平台结构。

---

## 7. 兼容与迁移说明

V1.0.0 是 chatsift 第一个版本,无历史接口兼容负担。chat_rpa 的 `/api/plugin/messages`、`/api/ai/*`、`/api/keyword-replies` 等接口不在 chatsift 中提供。chat_rpa 复用过来的鉴权接口(`/api/auth/*`)、用户管理(`/api/users/*`)、RBAC(`/api/roles`、`/api/menus`)保持原路径不变,不加 v1 前缀(因为它们是基础设施,非 V1.0.0 新增业务)。

新增业务接口一律 `/api/v1/` 前缀。这样可以清晰区分"复用的基础设施接口"(无 v1 前缀)和"chatsift V1.0.0 业务接口"(有 v1 前缀)。
