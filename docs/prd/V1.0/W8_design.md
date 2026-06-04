-----

## 文档: W8 设计说明 — LLM 真实接入(DeepSeek)+ 配额管理
版本: v1.0.0
周次: W8
状态: Active

## 变更日志

|版本    |日期        |变更摘要                     |触发来源     |
|------|----------|-------------------------|---------|
|v1.0.0|2026-05-31|初版,LLM 接入 + 配额 + 降级 + 配置页|Claude 设计|

-----

# W8 设计说明:LLM 真实接入 + 配额管理

> **周次**:W8
> **范围**:把 intent / completeness 的 LLM stub 接通真实 DeepSeek;配额管理;降级;后台 LLM 配置页
> **关联**:PRD 第 7 章(LLM 配额管理与降级)、v1-schema(tenant_llm_config)、v1-api-spec(/llm-config)、W2 intent-engine、W3 completeness-engine
> **核心原则**:LLM 费用完全租户化——每租户配自己的 key,用自己的额度,花自己的钱。chatsift 只是管道
> **本周不做**:LLM 做意图以外的复杂分析、流式输出、多模型对比、向量检索

-----

## 0. 安全前提:API key 的处理

租户的 DeepSeek API key 是敏感支付凭证,W8 必须做到:

- **从不硬编码**:key 只存在 tenant_llm_config 表,代码从表读,绝不写进代码/配置文件/git
- **读取脱敏**:后台 GET /llm-config 返回时,api_key 只显示后 4 位(`sk-****afb2`),不回显完整 key
- **写入不回显**:后台填 key 保存后,前端不再取回完整 key;要改就重填
- **日志不打印 key**:LLM 调用的日志里绝不打印 api_key
- 生产环境后台走 HTTPS(本地测试 http 例外)

-----

## 1. LLM 在哪两处接入

W2/W3 留了两个 stub,W8 接通:

```
intent-engine.llmFallback(tenantId, text)
  现状:return { label:'simple_inquiry', confidence:0.5, source:'default' }
  W8:规则没命中意图时,调租户 LLM 判断意图

completeness-engine.llmExtract(tenantId, text, requiredFields)
  现状:return {}
  W8:规则抽不到字段时,调租户 LLM 抽取
```

两处都接,都消耗租户额度。

-----

## 2. LLM 客户端(新增 server/src/v1/llm-client.js)

统一封装对 DeepSeek 的调用,intent 和 completeness 都用它。

### 2.1 接口

```javascript
// 调用租户配置的 LLM,返回文本 + token 用量
async function chat(tenantId, { systemPrompt, userPrompt, maxTokens }) 
  → { ok, text, tokensUsed, error }
```

### 2.2 调用流程

```
chat(tenantId, opts):
  1. 读租户 LLM 配置:
     SELECT * FROM tenant_llm_config WHERE tenant_id=? AND enabled=1
     - 没配置 / 没启用 → return { ok:false, error:'no_config' }
  2. 检查配额:
     monthly_token_used >= monthly_token_quota → return { ok:false, error:'quota_exceeded' }
  3. 调 DeepSeek(OpenAI 兼容):
     POST {api_base}/v1/chat/completions
     headers: Authorization: Bearer {api_key}
     body: { model, messages:[{role:system,...},{role:user,...}], max_tokens, temperature:0 }
     - 超时 10s
     - 网络错误 / 5xx / 401 → return { ok:false, error:'api_error' }
  4. 解析响应:
     text = data.choices[0].message.content
     tokensUsed = data.usage.total_tokens
  5. 扣减配额:
     UPDATE tenant_llm_config SET monthly_token_used = monthly_token_used + ? WHERE tenant_id=?
  6. return { ok:true, text, tokensUsed }
```

### 2.3 关键参数

- `temperature: 0`:意图分类和字段抽取要稳定可复现,不要随机性
- `timeout: 10000`:10 秒超时,LLM 慢不能拖垮 analyzer
- DeepSeek 接口地址:`https://api.deepseek.com`,模型 `deepseek-chat`(这些是默认值,实际从租户配置读)

### 2.4 错误不抛出,只返回标记

llm-client 的任何失败(无配置/超额/网络/解析)都**返回 { ok:false, error } 而不是 throw**。因为它跑在 analyzer 串行 worker 里,抛异常会中断分析。调用方(intent/completeness)拿到 ok:false 就走降级(用默认值),不崩。

-----

## 3. intent-engine 接入 LLM

改 `llmFallback`:

```
llmFallback(tenantId, text):
  result = await llmClient.chat(tenantId, {
    systemPrompt: "你是意图分类器。把客服对话消息分到四类之一,只返回类别英文,不要解释:
                   simple_inquiry(简单咨询) / appointment(预约下单) /
                   complaint(投诉建议) / price_inquiry(询问价格)",
    userPrompt: text,
    maxTokens: 20
  })
  if not result.ok:
    // 降级:配额耗尽或调用失败,返回默认 + 标记
    return { label:'simple_inquiry', confidence:0.5, source:'default',
             degraded: result.error === 'quota_exceeded' }
  // 解析 LLM 返回的类别
  label = parseIntentLabel(result.text)  // 容错:从返回文本里提取四类之一,提取不到用 simple_inquiry
  return { label, confidence:0.75, source:'llm' }
```

注意:

- LLM 的 confidence 给 0.75(比规则的 0.9 低,因为 LLM 判断不如规则确定)
- parseIntentLabel 要容错:LLM 可能返回”这条消息属于 appointment”而不是干脆的”appointment”,要能从中提取。提取不到任何合法类别 → 兜底 simple_inquiry
- degraded 标记:配额耗尽时标记,供后台显示”请联系平台管理员”

-----

## 4. completeness-engine 接入 LLM

改 `llmExtract`,作为规则抽取的补充(规则先抽,抽不到的字段再问 LLM):

```
llmExtract(tenantId, text, missingFields):
  if missingFields 为空 → return {}  // 规则已抽全,不调 LLM 省钱
  result = await llmClient.chat(tenantId, {
    systemPrompt: "从租车客服对话里抽取字段,只返回 JSON,没有的字段填 null。
                   要抽取的字段:" + missingFields.join(',') + "
                   字段含义:name=姓名,city=城市,time=时间,contact=电话/微信,
                   pickup_location=上车位置,car_type=车型",
    userPrompt: text,
    maxTokens: 200
  })
  if not result.ok:
    return {}  // 降级:抽不到就空,完全交给规则的结果
  // 解析 JSON
  try:
    extracted = JSON.parse(提取result.text里的JSON块)
    return 只保留 missingFields 里的非空字段
  catch:
    return {}  // LLM 返回的不是合法 JSON,放弃,不崩
```

注意:

- **只对规则抽不到的字段(missingFields)调 LLM**,规则抽到的不重复问,省 token
- missingFields 为空(规则已抽全)直接 return,不调 LLM
- LLM 返回的 JSON 要容错解析,解析失败就当没抽到,不崩
- 抽取范围:completeness 用全量 inbound(W6.5 已改),但传给 LLM 的 text 要注意长度,太长截断(防 token 爆)

-----

## 5. 配额管理与降级

### 5.1 配额扣减

每次 llm-client.chat 成功后,按返回的 total_tokens 累加到 monthly_token_used。

### 5.2 月度重置

monthly_token_used 每月 1 日重置为 0。实现:llm-client 调用前检查 quota_reset_at,如果不是本月,先重置 used=0 并更新 reset_at。(不用定时任务,惰性重置即可)

```
调用前:
  if quota_reset_at 的月份 != 当前月份:
    UPDATE SET monthly_token_used=0, quota_reset_at=今天
```

### 5.3 降级策略(PRD 第 7 章)

配额耗尽(used >= quota)时:

- llm-client 返回 { ok:false, error:‘quota_exceeded’ }
- intent/completeness 走默认值(simple_inquiry / 空字段)
- 标记 degraded,analyzer 把这个标记记到某处(如 conversation 或日志),后台能查到
- 后台对该租户显示提示:“LLM 配额已用尽,请联系平台管理员”(PRD 指定文案)

降级**不中断采集和规则分析**——规则该怎么跑还怎么跑,只是 LLM 兜底这层没了。

### 5.4 成本控制(省 token 的约束)

为帮租户控制成本,以下情况不调 LLM:

- 规则已命中意图 → 不调 intent LLM(W2 规则优先逻辑保留)
- 规则已抽全字段 → 不调 completeness LLM
- outbound 消息 → 不分析(W2 已有)
- 配额耗尽 → 不调

这样 LLM 只在”规则兜不住”时才出动,大幅减少调用量。

-----

## 6. 后台 LLM 配置页

对应 admin”系统设置”。实现 v1-api-spec 的 /llm-config 接口 + 配置页面。

### 6.1 接口(W1 spec 已定义)

```
GET /api/v1/llm-config   权限 llm:config
  返回:api_base, model, monthly_token_quota, monthly_token_used, enabled
        api_key 脱敏(只显示后4位 sk-****afb2)
PUT /api/v1/llm-config    权限 llm:config
  请求:api_base, api_key(选填,不填则不改), model, monthly_token_quota, enabled
```

### 6.2 配置页(admin)

- 表单:接口地址(默认 <https://api.deepseek.com)、API> Key(password 输入框,占位显示脱敏值)、模型(默认 deepseek-chat)、月度配额、启用开关
- 用量展示:本月已用 token / 配额(进度条),接近耗尽时变红
- 保存:PUT /llm-config。api_key 留空表示不修改(避免脱敏值被当成新 key 存进去)

-----

## 7. 验证(W8 结束应看到)

```
前提:在后台 LLM 配置页填入真实 DeepSeek 配置(api_base/key/model/配额),启用

1. 规则命中的意图(如"我要投诉")→ 不调 LLM,source=rule(省钱验证)
2. 规则没命中的意图(如"周末有空吗"这种隐含预约)→ 调 LLM,source=llm,
   LLM 应判为 appointment(规则判不出的,LLM 能判)
3. 规则抽不到的字段 → LLM 补抽,completeness 提升
4. 配额耗尽测试:把配额改成很小(如 100),触发几次后 → 降级,source=default,
   degraded 标记,后台显示"请联系平台管理员"
5. 月度重置:把 quota_reset_at 改成上个月,触发调用 → used 归零重新计
6. 配置页:填配置能存,api_key 脱敏显示,用量进度条正确
7. 错误容错:故意填错 key → llm-client 返回 ok:false → 走降级,analyzer 不崩
```

-----

## 8. 风险与注意

第一,**LLM 调用在 analyzer 串行 worker 里,绝不能阻塞太久**。10 秒超时是硬上限。如果 DeepSeek 慢,宁可超时降级,不能拖垮整个分析队列。

第二,**LLM 返回不可控**,parseIntentLabel 和 JSON 解析都要容错,解析失败走降级,绝不让 LLM 的乱返回 throw 出来崩掉 worker。

第三,**配额扣减要准**。每次按真实 total_tokens 扣,不要估算。并发场景(虽然 MVP 串行)下用 `used = used + ?` 的原子更新,不要先读后写。

第四,**key 安全**(见第 0 节):不硬编码、读取脱敏、日志不打印、PUT 留空不改。

第五,**省钱约束要落实**(第 5.4 节):规则能兜的绝不调 LLM。这直接关系租户成本,是产品对租户的责任。

第六,**parseIntentLabel 的兜底**:LLM 返回的意图如果不在四类里(它可能自由发挥),兜底成 simple_inquiry,不要让非法 label 进数据库。