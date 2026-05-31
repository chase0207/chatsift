# W10 验收报告 — 字段有效性校验

日期: 2026-05-31

## 实施范围

- 新增 `server/src/v1/validity-checker.js`,字段有效性三态: `valid` / `invalid` / `unknown`。
- 扩展 `server/src/v1/business-rules.js`,集中配置租车字段有效性规则。
- `completeness-engine` 改为按有效字段数评分,并输出 `field_validity`。
- `analyzer` 持久化 `conversations.field_validity`。
- `analytics` 漏斗、平台对比、趋势口径改为读取已存 `field_validity`,不实时调用 AI。
- `server/sql/v1-schema.sql` 增加 `conversations.field_validity JSON`。

## Schema

本机 3306 已执行增量:

```sql
ALTER TABLE conversations
ADD COLUMN field_validity JSON DEFAULT NULL COMMENT '各字段有效性 valid/invalid/unknown及原因'
AFTER completeness_score;
```

确认结果:

```json
{
  "Field": "field_validity",
  "Type": "json",
  "Null": "YES",
  "Default": null
}
```

## 有效性判定

通过 `/api/v1/events/batch` 写入 W10 测试消息,analyzer 自动消费,所有测试 job 状态为 `done`。

### 6 字段全有效

会话: `w10_valid_all`

输入包含: `刘思奇 / 上海 / 明天下午3点 / 13800138000 / 普陀区镇坪路666号魔方公寓 / 轿车`

结果:

```json
{
  "intent_label": "appointment",
  "completeness_score": 100,
  "field_validity": {
    "name": { "status": "valid", "source": "llm" },
    "city": { "status": "valid", "source": "rule" },
    "time": { "status": "valid", "source": "rule" },
    "contact": { "status": "valid", "source": "rule" },
    "pickup_location": { "status": "valid", "source": "llm" },
    "car_type": { "status": "valid", "source": "rule" }
  }
}
```

### 明显无效字段

会话: `w10_invalid_all`

输入包含: `老板 / 市区 / 改天 / 回头加微信 / 市区 / 要个车`

结果:

```json
{
  "intent_label": "appointment",
  "completeness_score": 0,
  "field_validity": {
    "name": { "status": "invalid", "reason": "明显不是姓名" },
    "city": { "status": "invalid", "reason": "不是明确城市" },
    "time": { "status": "invalid", "reason": "时间表达过于模糊" },
    "contact": { "status": "invalid", "reason": "联系方式格式无效" },
    "pickup_location": { "status": "invalid", "reason": "上车位置不是具体点" },
    "car_type": { "status": "invalid", "reason": "车型不在词表" }
  }
}
```

### 地址点 vs 片区

具体点 `普陀区镇坪路666号魔方公寓`:

```json
{ "pickup_location": { "status": "valid", "source": "llm", "reason": "具体地址，司机可找到" } }
```

片区 `浦东新区`:

```json
{
  "conversation_id": "w10_region_pickup",
  "completeness_score": 83,
  "pickup_status": "invalid",
  "pickup_reason": "仅指定区级区域，缺乏具体上车点"
}
```

## 漏斗口径

查询:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3100/api/v1/analytics/funnel?platform_page=w10-validity-test"
```

结果:

```json
{
  "inquiry": 5,
  "lead": 3,
  "appointment": 1,
  "leadRate": 60,
  "appointmentRate": 33.3
}
```

说明:

- 留资 = `contact.status = valid`。
- 预约 = 6 个预约字段全部 `valid`。
- `unknown` 不计入预约。
- 满足 `inquiry >= lead >= appointment`,转化率不超过 100%。

`by-page` 与 `trend` 同样返回 `inquiry=5, lead=3, appointment=1`。

## 成本验证

连续刷新 analytics 接口前后 token 未变化:

```text
monthly_token_used before=734
monthly_token_used after=734
```

说明:

- 报表只读 `field_validity`,不调用 LLM。
- 规则可判字段的 `source=rule`,不调用 LLM。
- 仅姓名真伪、地址点位等规则无法确定字段调用 LLM。

## 配额耗尽降级

临时将 `tenant_llm_config.monthly_token_quota` 设为当前 used 后写入会话 `w10_quota_unknown`,再恢复原 quota。

结果:

```json
{
  "conversation_id": "w10_quota_unknown",
  "completeness_score": 67,
  "field_validity": {
    "name": { "status": "unknown", "source": "llm", "reason": "quota_exceeded" },
    "pickup_location": { "status": "unknown", "source": "llm", "reason": "quota_exceeded" },
    "city": { "status": "valid", "source": "rule" },
    "time": { "status": "valid", "source": "rule" },
    "contact": { "status": "valid", "source": "rule" },
    "car_type": { "status": "valid", "source": "rule" }
  }
}
```

结论:AI 部分标 `unknown`,分析任务不失败,该会话不计入预约。

## 回归

W3/W7/W8/W9 核心回归使用 `w10-validity-test` 和 `w10-regression` 测试数据:

```json
{
  "intents": [
    { "conversation": "w10_reg_complaint", "intent": "complaint", "source": "rule" },
    { "conversation": "w10_reg_simple_llm", "intent": "simple_inquiry", "source": "llm" },
    { "conversation": "w10_rule_only_price", "intent": "price_inquiry", "source": "rule" },
    { "conversation": "w10_valid_all", "intent": "appointment", "source": "rule" }
  ],
  "workorders": [
    { "workorder_type": "appointment", "count": 4 },
    { "workorder_type": "complaint", "count": 1 },
    { "workorder_type": "inquiry", "count": 1 },
    { "workorder_type": "pricing", "count": 1 }
  ],
  "analysis_jobs": [
    { "status": "done", "count": 7 }
  ]
}
```

结论:

- W3 意图四类路径正常。
- W7 lead 生成路径正常。
- W8 LLM 兜底路径正常,未记录明文 key。
- W9 analytics 框架正常,仅漏斗口径升级为有效性。
- completeness_score 已按有效字段数计算,旧的“非空即完整”分数预期已更新。

## Git

```text
f4f4924 feat(W10): field validity check (rule + AI)
83f4781 docs(W10): post-MVP roadmap + field validity docs
2deecf0 feat(W9): operations analytics + dashboard fix
61b9ef0 docs(W9): operations analytics + dashboard fix
```
