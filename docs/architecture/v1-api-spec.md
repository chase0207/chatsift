# Chatsift API 规格

> **版本**:v1.1.0
> **前缀**:所有新接口统一 `/api/v1/`
> **鉴权**:除特别注明,所有接口需 `Authorization: Bearer <JWT>`
> **租户**:从 JWT 解析 user_id 作为 tenant_id,所有查询自动按 tenant 隔离
> **返回格式**:统一 JSON `{ code, message, data }`,code=0 成功

## 变更日志

| 版本 | 日期 | 变更摘要 |
|---|---|---|
| v1.0.0 | — | 初版(MVP 早期) |
| v1.1.0 | 2026-06-01 | 回写代码现状,对齐 SPEC_GAP C1-C7/U1-U3:漏斗改三环结构、platform-comparison 改名 by-page、补 completeness 6 字段占比口径与 pricing payload、heartbeat/dom-config 占位现状、analysis_jobs DB 轮询、补记 leads/recent 与 intent-distribution/lead-level/trend、补列表新增查询参数 |

> **校准原则**:本次为"让文档追上代码"。v1.0.0 写于 MVP 早期,其漏斗/字段/评分等口径已被 W7/W9/W10/W11/W12 演进覆盖,但原文未回写。**以代码为准**,下方差异处均标注现状。这些不是 bug,是演进成果。

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

> **实现现状(SPEC_GAP C5)**:每条入库消息会写入一条 `analysis_jobs(status='pending')`。分析 worker 直接**轮询 `analysis_jobs` 表**(`setInterval` 取 pending 批)消费,该表即主队列,**无内存队列**(schema 早期注释"内存 queue"已过时)。

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

> **实现现状(SPEC_GAP C6)**:当前 `config_version` **恒返回 1**(占位,未做服务端配置版本管理)。

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

> **实现现状(SPEC_GAP C6)**:当前 `version>=1` 时 `selectors` **恒返回 null**——服务端选择器下发**未启用**,插件统一使用内置 SELECTORS。

---

## 2. 会话中心(后台 → 服务端)

### 2.1 会话列表

```
GET /api/v1/conversations
```

权限:`conversation:list`

查询参数:`platform` / `intent_label` / `current_stage` / `keyword`(消息全文 EXISTS 搜)/ `platform_page`(LIKE)/ `nickname`(LIKE)/ `diagnosis_color`(red/orange/green/gray)/ `from` / `to` / `page` / `page_size`

> **新增参数现状(SPEC_GAP U3)**:`platform_page`/`nickname`(W12.6 搜索增强)、`diagnosis_color`(W11 诊断色)为 v1.0.0 后新增。其中 **`diagnosis_color` 是"取全部命中行→实时拼诊断→内存过滤→再分页"**,无 SQL LIMIT,大数据量下有性能隐患(待优化项,现记录不改)。

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

> **completeness_score 口径(SPEC_GAP C3)**:仅对 intent ∈ {appointment, price_inquiry} 计算,其余 intent 恒 0。score = 有效字段数 / required 字段数 × 100(W10 起按"有效"计分,非早期"已填×20")。required 字段:预约 6 字段 `name/city/time/contact/pickup_location/car_type`、问价 2 字段 `city/car_type`(W7 校准为租车口径,早期的 project/store/hours 已弃用)。

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

查询参数:`latest`(传 1 时按 occurred_at 倒序取最新 N 条再恢复正序返回,供前端长会话只看最新消息;W12.6 加)。

响应 data.list 为按 occurred_at 升序的消息,每项含 direction / content_type / content_text / occurred_at。

---

## 3. 线索中心

### 3.1 线索列表

```
GET /api/v1/leads
```

权限:`lead:manage`

查询参数:`status` / `lead_level` / `assigned_to` / `city` / `keyword`(昵称/姓名/手机/微信 LIKE)/ `ids`(逗号分隔,提醒跳转用)/ `diagnosis_color`(同会话列表,内存过滤)/ `page` / `page_size`

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

### 3.5 高价值新线索(准实时提醒取数)

```
GET /api/v1/leads/recent?since=&min_level=
```

权限:`lead:manage`

W12 准实时提醒的服务端取数(**无独立 notifications 表/接口**)。取 `status='new'` 且 `updated_at >= since` 的线索(LIMIT 50),再经 `shouldNotify` 过滤:**仅返回 complaint、或 high 级、或(诊断 success 且预约 6 字段全 valid)**,普通咨询不推。

查询参数:`since`(ISO 时间,默认 now-30min)、`min_level`(默认 high)。

响应 data:

```json
{
  "list": [
    {
      "id": 1001,
      "primary_conversation_id": 58,
      "customer_nickname": "张三",
      "customer_name": "张三",
      "lead_level": "high",
      "intent_label": "appointment",
      "diagnosis_mainColor": "success",
      "diagnosis": { "mainColor": "success", "tags": [] },
      "created_at": "2026-05-30 10:20:00",
      "updated_at": "2026-05-30 10:23:45"
    }
  ],
  "total": 1,
  "since": "2026-05-30 09:53:45"
}
```

前端铃铛每 30s 轮询此接口(自记 `since`),命中则弹通知、点击按 `ids` 跳线索列表。SPEC_GAP U1。

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

> **payload 字段口径(SPEC_GAP C4)**:按 intent 不同:
> - appointment:完整度 6 字段 `name/city/time/contact/pickup_location/car_type`。
> - pricing:`city`+`car_type`+`quote`(查 price_table 按城市+车型 LIKE 命中得报价);suggestion 缺城市/车型→人工报价、有 quote→"建议报价:X元"、否则→价格表无匹配。
> - complaint:消息原文 + `risk_level=high`。
> - inquiry:intent_summary。
> 早期文档的 `hours/project/store` 已在租车口径弃用(W7 后)。

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
POST   /api/v1/price-table/import         权限 price:manage  (Excel 导入,未实现)
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

> **实现现状(SPEC_GAP M1)**:`/price-table/import` 当前是**空 stub**——路由已挂载,但 controller 直接返回 `{ imported: 0 }`,无任何 Excel 解析/入库逻辑。业务暂不急,留待后续实现。

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

> 所有接口权限 `conversation:list`。默认时间范围近 30 天(`from`=今天-29,`to`=今天),可选 `platform_page` 过滤;时间维度除 lead-level 按 `leads.created_at` 外,其余按 `conversations.created_at`。
> 漏斗口径在 W9/W10 已重定义为**三环:咨询 → 留资 → 预约,不含成交**(成交在线下、采集不到)。留资=contact 字段 valid;预约=6 字段全 valid。三环真包含,故转化率 ≤100%。

### 6.1 转化漏斗(SPEC_GAP C1)

```
GET /api/v1/analytics/funnel?from=&to=&platform_page=
```

响应 data(**已非早期 total_conversations/by_intent/converted 结构**):

```json
{
  "inquiry": 1200,
  "lead": 520,
  "appointment": 180,
  "leadRate": 43.3,
  "appointmentRate": 34.6
}
```

- `inquiry` = 范围内会话数(`COUNT(DISTINCT c.id)`)。
- `lead` = `field_validity.contact.status='valid'` 的会话数。
- `appointment` = 预约 6 字段全 `valid` 的会话数(SQL 按 business-rules.appointmentFields 动态拼)。
- `leadRate`=lead/inquiry、`appointmentRate`=appointment/lead(百分比保留 1 位,分母 0 返 0)。

### 6.2 按页面对比(SPEC_GAP C2,原 platform-comparison 改名)

```
GET /api/v1/analytics/by-page?from=&to=
```

按 `platform_page` 分组的三环漏斗(W9 起改为**页面维度**而非"平台"维度)。响应 data 为数组,每项:

```json
{ "platform_page": "private-message", "inquiry": 600, "lead": 280, "appointment": 90, "leadRate": 46.7, "appointmentRate": 32.1 }
```

### 6.3 意图分布(SPEC_GAP U2)

```
GET /api/v1/analytics/intent-distribution?from=&to=&platform_page=
```

按 `intent_label` 分组计数,count 降序。响应 data 为数组:

```json
[ { "intent_label": "simple_inquiry", "count": 840 }, { "intent_label": "appointment", "count": 180 } ]
```

### 6.4 线索分层(SPEC_GAP U2)

```
GET /api/v1/analytics/lead-level?from=&to=
```

按 `lead_level` 分组计数,按 high/mid/low/unknown 排序。响应 data 为数组:

```json
[ { "lead_level": "high", "count": 60 }, { "lead_level": "mid", "count": 120 }, { "lead_level": "low", "count": 340 } ]
```

### 6.5 趋势(SPEC_GAP U2)

```
GET /api/v1/analytics/trend?from=&to=&platform_page=
```

按天聚合的三环计数(**无 rate 字段**)。响应 data 为数组,日期升序:

```json
[ { "date": "2026-05-29", "inquiry": 40, "lead": 18, "appointment": 6 } ]
```

---

## 7. 兼容与迁移说明

V1.0.0 是 chatsift 第一个版本,无历史接口兼容负担。chat_rpa 的 `/api/plugin/messages`、`/api/ai/*`、`/api/keyword-replies` 等接口不在 chatsift 中提供。chat_rpa 复用过来的鉴权接口(`/api/auth/*`)、用户管理(`/api/users/*`)、RBAC(`/api/roles`、`/api/menus`)保持原路径不变,不加 v1 前缀(因为它们是基础设施,非 V1.0.0 新增业务)。

新增业务接口一律 `/api/v1/` 前缀。这样可以清晰区分"复用的基础设施接口"(无 v1 前缀)和"chatsift V1.0.0 业务接口"(有 v1 前缀)。
