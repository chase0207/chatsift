# W11 验收报告 — 诊断颜色 + 快速复核

日期: 2026-05-31

## 实施范围

- 新增 `server/src/v1/diagnosis.js`,读取 W10 `field_validity` 实时拼诊断标签。
- `GET /api/v1/conversations`、`GET /api/v1/conversations/:id` 返回 `diagnosis`。
- `GET /api/v1/leads`、`GET /api/v1/leads/:id` 返回 `diagnosis`。
- 会话/线索列表支持 `diagnosis_color=danger|warning|success|info` 筛选。
- 会话/线索列表新增诊断列和“看记录”按钮。
- 新增 `MessageDrawer`,列表内就地弹出聊天记录,不跳转。
- 会话详情/线索详情新增字段诊断区,展示字段值、有效性状态和 W10 reason。

## 后端验收

### 列表诊断

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3100/api/v1/conversations?page_size=5"
```

结果摘要:

```json
{
  "total": 34,
  "colors": ["info", "danger", "warning", "warning", "danger"]
}
```

### 颜色筛选

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3100/api/v1/conversations?diagnosis_color=danger&page_size=3"
```

结果摘要:

```json
{
  "total": 18,
  "colors": ["danger", "danger", "danger"]
}
```

线索 warning 筛选:

```json
{
  "total": 5,
  "colors": ["warning", "warning", "warning"]
}
```

### 详情诊断理由

会话 `w10_region_pickup`:

```json
{
  "mainColor": "warning",
  "tags": [
    {
      "label": "联系方式有效",
      "color": "success",
      "field": "contact",
      "reason": "手机号格式有效"
    },
    {
      "label": "上车位置不准确",
      "color": "warning",
      "field": "pickup_location",
      "reason": "仅指定区级区域，缺乏具体上车点"
    }
  ]
}
```

结论:诊断理由直接来自 W10 `field_validity.reason`。

### 实时拼装一致性

临时把 `w10_region_pickup.field_validity.pickup_location.status` 从 `invalid` 改为 `valid`,重查详情:

```json
{
  "mainColor": "success",
  "tags": ["联系方式有效", "预约信息完整"]
}
```

恢复为 `invalid` 后:

```json
{
  "mainColor": "warning",
  "tags": ["联系方式有效", "上车位置不准确"]
}
```

结论:诊断标签未存表,实时读取 W10 有效性数据拼装。

## 前端验收

- `Conversations.vue`:新增诊断筛选、诊断列、主色 tag、诊断标签组、“看记录”按钮。
- `Leads.vue`:新增诊断筛选、诊断列、主色 tag、诊断标签组、“看记录”按钮。
- `ConversationDetail.vue`:新增字段诊断区。
- `LeadDetail.vue`:新增字段诊断区。
- `MessageDrawer.vue`:列表内 drawer 展示聊天记录,inbound/outbound 区分,不跳转。

构建:

```bash
npm run build:admin
```

结果:通过。仍有既有 Vite/Rolldown `INVALID_ANNOTATION` 和 chunk size warning,不影响构建。

## 成本与回归

连续请求诊断列表、颜色筛选、线索列表前后:

```text
monthly_token_used before=948 after=948
```

结论:

- W11 不调用 LLM。
- W11 不写业务表。
- W11 未改 analyzer/completeness/lead/analytics 流水线。
- 后端语法检查通过:
  - `server/src/v1/diagnosis.js`
  - `server/src/controllers/v1/conversationsController.js`
  - `server/src/controllers/v1/leadsController.js`

## Git

```text
3109d28 feat(W11): diagnosis tags + quick review
d2472c9 docs(W11): diagnosis tags + quick review
ad401c5 feat(W10): field validity check (rule + AI)
83f4781 docs(W10): post-MVP roadmap + field validity docs
```
