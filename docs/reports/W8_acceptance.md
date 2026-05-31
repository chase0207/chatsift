# W8 验收报告

## 变更范围

- 新增 `server/src/v1/llm-client.js`,封装 DeepSeek OpenAI-compatible chat completions 调用。
- `intent-engine.llmFallback` 接入 LLM,规则命中仍直接返回,不调用 LLM。
- `completeness-engine.llmExtract` 接入 LLM 补漏,规则已抽全时不调用 LLM。
- `/api/v1/llm-config` 支持默认 DeepSeek 配置、GET key 脱敏、PUT 留空不改 key。
- 新增 admin LLM 配置页 `/settings/llm`。

## Key 安全

- 代码没有硬编码真实 API key。
- GET `/api/v1/llm-config` 不返回完整 key。
- PUT `api_key` 为空时不覆盖已有 key。
- 报告未写入真实 key。

接口脱敏验证使用临时假 key,已在验收后从本地库删除:

```json
{
  "api_base": "https://api.deepseek.com",
  "api_key": "sk-****1234",
  "model": "deepseek-chat",
  "monthly_token_quota": 1000000,
  "monthly_token_used": 0,
  "enabled": 1
}
```

验收后当前本地配置回到未启用默认态:

```json
{
  "api_base": "https://api.deepseek.com",
  "api_key": "",
  "model": "deepseek-chat",
  "model_name": "deepseek-chat",
  "monthly_token_quota": 1000000,
  "monthly_token_used": 0,
  "quota_reset_at": null,
  "enabled": 0
}
```

## 服务端验证

### 真实 DeepSeek 调用

Chase 在后台配置真实 key 后,GET `/api/v1/llm-config` 只返回脱敏值:

```json
{
  "api_base": "https://api.deepseek.com",
  "api_key": "sk-****afb2",
  "model": "deepseek-chat",
  "quota": 1000000,
  "used": 0,
  "enabled": 1
}
```

规则未命中消息:

```text
请问这周末还有空位吗我想带孩子来体验一下
```

结果:

```text
token_used_before=0 token_used_after=204
w8_real_llm intent_label=appointment intent_source=llm intent_confidence=0.75 current_stage=collecting completeness_score=17 job_status=done last_error=NULL
```

结论:真实 DeepSeek 调用成功,LLM 兜底能把隐含预约判成 `appointment`,并正确扣减 token。

### 规则命中不调 LLM

输入:

```text
我要投诉退款
```

结果:

```text
platform_conversation_id intent_label intent_source monthly_token_used
w8_rule                 complaint    rule          0
```

结论:规则命中时没有消耗 LLM token。

真实 key 配置后再次验证规则命中:

```text
w8_real_rule intent_label=complaint intent_source=rule intent_confidence=0.90 job_status=done last_error=NULL
```

### 错误 key 降级

使用临时假 key 触发一条规则未命中的消息:

```text
请问周末还有空位吗我想带孩子来体验
```

结果:

```text
platform_conversation_id intent_label    intent_source intent_confidence monthly_token_used job_status last_error
w8_bad_key              simple_inquiry  default       0.50              0                  done       NULL
```

结论:LLM API 失败时 analyzer 不崩,任务完成并降级为 default。

### 配额耗尽降级

设置 `monthly_token_quota=1, monthly_token_used=1` 后触发规则未命中消息。

结果:

```text
platform_conversation_id intent_label    intent_source intent_confidence monthly_token_used job_status last_error
w8_quota                simple_inquiry  default       0.50              1                  done       NULL
```

结论:配额耗尽时不调用 LLM,走 default 降级,analysis job 未失败。

### 月度重置

设置 `quota_reset_at='2026-04-01', monthly_token_used=5` 后调用 `llmClient.chat`。

结果:

```text
monthly_token_used quota_reset_at
0                  2026-05-31
```

结论:惰性月度重置生效。

### completeness LLM 补漏

输入:

```text
我想预约租车,我是刘思奇,在上海,电话13913972023,明天上午十点普陀区上车,想要一辆轿车
```

结果:

```text
token_used_before=204 token_used_after=321
w8_real_extract intent_label=appointment intent_source=rule current_stage=done completeness_score=100 customer_name=刘思奇 phone=13913972023 lead_score=100 lead_level=high
payload={"city":"上海","name":"刘思奇","time":"明天","contact":"13913972023","car_type":"轿车","pickup_location":"普陀区"}
```

结论:规则先命中 appointment,completeness 对缺失字段调用 LLM 补漏,最终 6 字段抽满。

### LLM 返回容错

```text
parseIntentLabel("这条消息属于 appointment") => appointment
parseIntentLabel("unknown") => simple_inquiry
parseJsonObject("```json {\"name\":\"刘思奇\",\"city\":\"上海\"} ```") => {"name":"刘思奇","city":"上海"}
```

结论:非法意图和 JSON 解析失败路径不会让非法数据进入后续流程。

## W3/W7 回归

LLM 配置禁用后重跑 W3 四类工单 + W7 lead 路径:

```text
w8_reg_appointment appointment    rule    done completeness=100 customer_name=刘思奇 phone=13913972023 lead_score=100 lead_level=high
w8_reg_complaint   complaint      rule    done completeness=0   lead_score=25  lead_level=low
w8_reg_price       price_inquiry  rule    done completeness=100 lead_score=80  lead_level=high
w8_reg_simple      simple_inquiry default new  completeness=0   lead_score=15  lead_level=low
```

工单:

```text
w8_reg_appointment appointment lead_id=10 pending
w8_reg_complaint   complaint   lead_id=11 pending
w8_reg_price       pricing     lead_id=12 pending
w8_reg_simple      inquiry     lead_id=9  pending
```

结论:接入 LLM 后,规则路径、工单生成、lead 生成未回退。

## Admin 验证

- `npm run build` 通过。
- `http://127.0.0.1:5173/settings/llm` 返回 200。
- 构建仍有 Vite/Rolldown 第三方依赖 pure annotation 和大 chunk 警告,不影响本次编译。

## Git

```text
HEAD feat(W8): LLM integration (DeepSeek) + quota management
0c452db docs(W8): LLM integration design + tasks
9a11d46 feat(W7): lead engine + lead center + 租车字段校准
b6c7f27 docs(W7): lead engine design + tasks
1e71ec9 fix(W6.5): conversation merge + completeness accumulation
```
