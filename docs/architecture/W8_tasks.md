-----

## 文档: W8 实施任务清单 — LLM 接入 + 配额管理
版本: v1.0.0
周次: W8
状态: Active

## 变更日志

|版本    |日期        |变更摘要|触发来源     |
|------|----------|----|---------|
|v1.0.0|2026-05-31|初版  |Claude 设计|

-----

# W8 实施任务清单(给执行端 cc / codex)

> **目标**:intent/completeness 的 LLM stub 接通真实 DeepSeek,配额管理 + 降级 + 后台配置页
> **验收标准**:规则没命中的意图能用 LLM 判对;配额耗尽降级;配置页能配 key(脱敏)
> **关联**:W8_design.md(先读)、PRD 第7章、tenant_llm_config 表、/llm-config 接口
> **核心原则**:LLM 费用租户化,每租户配自己的 key/额度
> **本周不做**:LLM 复杂分析、流式、多模型

-----

## 前置:阅读设计 + key 由用户后台配

先读 W8_design.md,重点:llm-client 失败只返回标记不抛异常(第2.4节)、降级策略(第5节)、省钱约束(第5.4节)、key 安全(第0节)。

**API key 不在代码里,也不在本任务里**。cc 写的代码从 tenant_llm_config 表读 key。真实 key 由用户(Chase)在后台 LLM 配置页填入测试租户,或 INSERT 进本地测试库。cc 不接触真实 key。

DeepSeek 已知信息(非机密,可写进代码默认值):

- api_base: `https://api.deepseek.com`
- model: `deepseek-chat`
- 接口格式:OpenAI 兼容,调用 `{api_base}/v1/chat/completions`

-----

## Task 1 — 放文档

```bash
cd ~/vscode/chatsift
cp <W8_design.md> docs/architecture/W8_design.md
cp <W8_tasks.md>  docs/architecture/W8_tasks.md
git add docs/architecture/W8_*.md
git commit -m "docs(W8): LLM integration design + tasks"
```

-----

## Task 2 — 写 LLM 客户端

新建 `server/src/v1/llm-client.js`(详见 W8_design 第2节)。

实现 `chat(tenantId, { systemPrompt, userPrompt, maxTokens })` → `{ ok, text, tokensUsed, error }`:

```
1. 读租户配置:SELECT * FROM tenant_llm_config WHERE tenant_id=? AND enabled=1
   无配置 → { ok:false, error:'no_config' }
2. 月度重置检查:quota_reset_at 不是本月 → UPDATE used=0, reset_at=今天
3. 配额检查:used >= quota → { ok:false, error:'quota_exceeded' }
4. 调 DeepSeek(用 node 的 fetch 或 https,超时 10s):
   POST {api_base}/v1/chat/completions
   Authorization: Bearer {api_key}
   body: { model, messages:[{role:'system',content:systemPrompt},{role:'user',content:userPrompt}],
           max_tokens:maxTokens, temperature:0 }
   超时/网络错/非200 → { ok:false, error:'api_error' }
5. 解析:text=choices[0].message.content, tokensUsed=usage.total_tokens
6. 扣额度:UPDATE tenant_llm_config SET monthly_token_used=monthly_token_used+? WHERE tenant_id=?
7. { ok:true, text, tokensUsed }
```

铁律:

- **任何失败返回 {ok:false} 不 throw**(跑在 worker 里,抛异常会崩分析)
- temperature:0(分类要稳定)
- 日志不打印 api_key
- 用原子更新 `used = used + ?`,不要先读后写

`node --check` 通过。

-----

## Task 3 — intent-engine 接 LLM

改 `server/src/v1/intent-engine.js` 的 `llmFallback`(详见 W8_design 第3节):

```
llmFallback(tenantId, text):
  result = await llmClient.chat(tenantId, {
    systemPrompt: "<意图分类器 prompt,见设计第3节,要求只返回四类英文之一>",
    userPrompt: text, maxTokens: 20
  })
  if not result.ok:
    return { label:'simple_inquiry', confidence:0.5, source:'default',
             degraded: result.error==='quota_exceeded' }
  label = parseIntentLabel(result.text)  // 容错提取四类之一,提取不到→simple_inquiry
  return { label, confidence:0.75, source:'llm' }
```

写 `parseIntentLabel(text)`:从 LLM 返回文本里找 simple_inquiry/appointment/complaint/price_inquiry 之一,找不到兜底 simple_inquiry。**绝不让非法 label 进库**。

规则优先逻辑保留:规则命中就 return rule 结果,根本不进 llmFallback(省钱)。

-----

## Task 4 — completeness-engine 接 LLM

改 `server/src/v1/completeness-engine.js` 的 `llmExtract`(详见 W8_design 第4节):

```
llmExtract(tenantId, text, missingFields):
  if missingFields 空 → return {}  // 规则抽全了,不调 LLM
  result = await llmClient.chat(tenantId, {
    systemPrompt: "<抽取 prompt,只返回JSON,字段含义见设计第4节>",
    userPrompt: text, maxTokens: 200
  })
  if not result.ok → return {}  // 降级,交给规则结果
  try: extracted = JSON.parse(从result.text提取JSON)
       return 只保留 missingFields 里的非空字段
  catch: return {}  // 解析失败不崩
```

只对规则没抽到的字段(missingFields)调 LLM。规则先跑,LLM 补漏。

-----

## Task 5 — 实现 /api/v1/llm-config 接口

`server/src/controllers/` 的 llm-config controller(W1 可能是 stub):

```
GET /api/v1/llm-config (权限 llm:config):
  读 tenant_llm_config,返回 api_base/model/monthly_token_quota/monthly_token_used/enabled
  api_key 脱敏:只返回后4位,如 "sk-****afb2"(没配置返回空)

PUT /api/v1/llm-config (权限 llm:config):
  请求:api_base, api_key(选填), model, monthly_token_quota, enabled
  - api_key 为空/未提供 → 不修改现有 key(避免脱敏值覆盖真 key)
  - api_key 有值 → 更新
  upsert 到 tenant_llm_config(按 tenant_id)
```

铁律:GET 绝不返回完整 key;日志不打印 key。

-----

## Task 6 — 后台 LLM 配置页

新建 `admin/src/views/LlmConfig.vue`(沿用 W6/W7 Element Plus 风格),挂”系统设置”下。

- api `admin/src/api/llmConfig.js`:getLlmConfig / updateLlmConfig
- 表单:接口地址(默认 <https://api.deepseek.com)、API> Key(el-input type=password,placeholder 显示脱敏值)、模型(默认 deepseek-chat)、月度配额、启用开关
- 用量:本月已用/配额 进度条,接近满变红
- 保存 PUT;api_key 留空表示不改

挂路由 `/settings/llm` 或在系统设置页内,对应菜单”系统设置”。

-----

## Task 7 — 验收

### 7.1 配置(Chase 操作:填真实 key)

```
在后台 LLM 配置页填入真实 DeepSeek:
  api_base: https://api.deepseek.com
  api_key: <你的新 DeepSeek key>
  model: deepseek-chat
  monthly_token_quota: 1000000
  enabled: 开
保存。确认列表/详情里 key 脱敏显示(sk-****xxxx)。
```

### 7.2 服务端验收(curl)

```bash
TOKEN=<login>; BASE=http://127.0.0.1:3100

# 1. 规则命中 → 不调 LLM
curl -X POST $BASE/api/v1/events/batch -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"events":[{"platform":"douyin","conversation_id":"w8_rule","message_id":"w8_r1","direction":"inbound","content_type":"text","content_text":"我要投诉退款","occurred_at":"2026-05-31T11:00:00+08:00"}]}'
sleep 2
# 查 conversation.intent_source 应为 rule(没调 LLM)

# 2. 规则没命中 → 调 LLM
curl -X POST $BASE/api/v1/events/batch -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"events":[{"platform":"douyin","conversation_id":"w8_llm","message_id":"w8_l1","direction":"inbound","content_type":"text","content_text":"请问这周末还有空位吗我想带孩子来体验","occurred_at":"2026-05-31T11:01:00+08:00"}]}'
sleep 3
# 查 intent_source=llm,label 期望是 appointment(规则判不出"周末有空"这种隐含预约)

# 3. 查配额扣减
mysql -h127.0.0.1 -uroot chatsift -e "SELECT monthly_token_used FROM tenant_llm_config;"
# 期望:>0(调用后有消耗)

# 4. 配额耗尽降级测试
mysql -h127.0.0.1 -uroot chatsift -e "UPDATE tenant_llm_config SET monthly_token_quota=1;"
curl -X POST $BASE/api/v1/events/batch -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"events":[{"platform":"douyin","conversation_id":"w8_quota","message_id":"w8_q1","direction":"inbound","content_type":"text","content_text":"随便问问你们好","occurred_at":"2026-05-31T11:05:00+08:00"}]}'
sleep 2
# 期望:intent_source=default(降级),不报错。恢复配额:UPDATE SET monthly_token_quota=1000000

# 5. 错误 key 容错
# 临时把 key 改错,触发分析,确认 analyzer 不崩、走降级。测完恢复
```

### 7.3 重跑前序验收

```bash
# 重跑 W3 四类工单 + W7 lead,确认接 LLM 后规则路径没坏
# (规则命中的仍走规则,LLM 只是补充)
```

### 7.4 后台验收(Chase 配合)

- LLM 配置页:填配置能存、key 脱敏显示、用量进度条正确

### 7.5 提交

```bash
git add server/ admin/
git commit -m "feat(W8): LLM integration (DeepSeek) + quota management

- llm-client.js: DeepSeek调用, 超时10s, 失败不抛异常只降级
- intent llmFallback / completeness llmExtract 接通真实LLM
- 配额扣减 + 月度重置 + 耗尽降级(提示联系管理员)
- /api/v1/llm-config 接口(key脱敏) + 后台配置页
- 省钱约束: 规则命中不调LLM, outbound不调, 配额耗尽降级
- 验收: 规则没命中走LLM判对意图, 配额耗尽降级不崩"
git log --oneline -8
```

-----

## 完成标准(验收报告)

> 报告写 `docs/reports/W8_acceptance.md`。注意:报告里**绝不能出现真实 api_key**(贴配置时打码)。

- [ ] llm-client.js:DeepSeek 调通,失败返回标记不抛异常
- [ ] 规则命中的意图不调 LLM(source=rule),省钱约束生效
- [ ] 规则没命中的意图调 LLM(source=llm),“周末有空”类隐含预约 LLM 能判对
- [ ] completeness:规则抽不到的字段 LLM 能补
- [ ] 配额扣减正确(monthly_token_used 增加)
- [ ] 配额耗尽 → 降级 source=default,不报错,degraded 标记
- [ ] 错误 key → analyzer 不崩,走降级
- [ ] /llm-config:key 脱敏返回,PUT 留空不改 key
- [ ] 后台配置页:能配、脱敏显示、用量进度条
- [ ] 重跑 W3/W7:规则路径未受影响
- [ ] git log W8 独立;报告无明文 key

-----

## 重要提示

- **API key 不进代码、不进报告、不进 git**:代码从表读,报告贴配置打码,日志不打印
- **llm-client 失败只返回 {ok:false} 不 throw**:它在 analyzer worker 里,抛异常会崩整个分析队列
- **省钱约束**:规则能兜的绝不调 LLM(规则命中→不调 intent;字段抽全→不调 completeness;outbound→不分析;配额耗尽→不调)。这关系租户成本
- **LLM 返回容错**:parseIntentLabel 提取不到合法类别兜底 simple_inquiry;JSON 解析失败返回空。绝不让非法值进库或崩 worker
- **降级不中断**:配额耗尽/调用失败时规则照常跑,只是没了 LLM 兜底
- **配额原子更新** `used = used + ?`,不先读后写
- **temperature:0**:分类抽取要稳定
- **重跑 W3/W7**:接 LLM 不能影响已验收的规则路径
- **不要改 chat_rpa**(只读参考)
- 真实 LLM 调用质量(意图判得准不准)如果不理想,可能要调 prompt,调 prompt 是 A 类,验收时反馈