# W9 验收报告

## 变更范围

- 重写 `/api/v1/analytics` 只读聚合接口:
  - `/funnel`
  - `/intent-distribution`
  - `/lead-level`
  - `/by-page`
  - `/trend`
- 新增 admin 运营分析页 `/analytics`,使用 Element Plus 进度条和表格,未引入新图表库。
- 修复 `GET /api/dashboard/stats` 的老表查询:
  - `message_logs` 改为 `messages`
  - `device_sessions` 改为 `conversations`
- 将运营分析权限点对齐为 `analytics:view`。

## Dashboard 修复

```text
GET /api/dashboard/stats
```

结果:

```json
{
  "code": 0,
  "data": {
    "users": 1,
    "plugins": 1,
    "messages": 38,
    "devices": 4
  }
}
```

结论:不再访问 `message_logs` / `device_sessions` 老表,首页 stats 不再 500。

## W9 独立数据验收

使用 `platform_page=w9-test-page` 造 6 条会话:

- 2 条 simple_inquiry
- 2 条 appointment,均留电话
- 1 条 price_inquiry
- 1 条 complaint

### 漏斗

```json
{
  "inquiry": 6,
  "lead": 2,
  "appointment": 2,
  "leadRate": 33.3,
  "appointmentRate": 100
}
```

结论:咨询→留资→预约三环正确。留资以 `leads.customer_phone/customer_wechat` 为准。

### 平台页面对比

```json
[
  {
    "platform_page": "w9-test-page",
    "inquiry": 6,
    "lead": 2,
    "appointment": 2,
    "leadRate": 33.3,
    "appointmentRate": 100
  }
]
```

### 意图分布

```json
[
  { "intent_label": "simple_inquiry", "count": 2 },
  { "intent_label": "appointment", "count": 2 },
  { "intent_label": "price_inquiry", "count": 1 },
  { "intent_label": "complaint", "count": 1 }
]
```

### 趋势

```json
[
  {
    "date": "2026-05-31",
    "inquiry": 6,
    "lead": 2,
    "appointment": 2
  }
]
```

## W3/W7/W8 回归

`w9-test-page` 六条验收会话分析结果:

```text
w9_appointment_1 appointment    rule completeness=100 phone=13800138001 lead=high workorder=appointment
w9_appointment_2 appointment    rule completeness=100 phone=13800138002 lead=high workorder=appointment
w9_complaint_1   complaint      rule completeness=0   phone=NULL        lead=low  workorder=complaint
w9_price_1       price_inquiry  rule completeness=100 phone=NULL        lead=high workorder=pricing
w9_simple_1      simple_inquiry llm  completeness=0   phone=NULL        lead=low  workorder=inquiry
w9_simple_2      simple_inquiry llm  completeness=0   phone=NULL        lead=low  workorder=inquiry
```

结论:

- W3 工单生成正常。
- W7 lead 生成正常。
- W8 LLM fallback 正常。
- analytics 为只读聚合,未影响分析流水线。

## Admin 验收

- `npm run build` 通过。
- `http://127.0.0.1:5173/analytics` 返回 200。
- 未引入新图表库。
- 构建仍有 Vite/Rolldown 第三方依赖 pure annotation 和大 chunk 警告,不影响本次编译。

## 说明

现有历史数据里可能出现预约数大于留资数,所以全量漏斗的相邻预约率可能超过 100%。这是因为 W7 之前及部分意图路径没有联系方式,而 W9 按文档要求严格以 lead contact 作为留资口径。独立 `w9-test-page` 数据已验证标准漏斗计算正确。

## Git

```text
HEAD feat(W9): operations analytics + dashboard fix
61b9ef0 docs(W9): operations analytics + dashboard fix
93f12fd docs(W8): add real DeepSeek acceptance results
46893b7 feat(W8): LLM integration (DeepSeek) + quota management
0c452db docs(W8): LLM integration design + tasks
```
