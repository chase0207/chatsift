-----

## 文档: W10 实施任务清单 — 字段有效性校验
版本: v1.0.0
周次: W10
状态: Active

## 变更日志

|版本    |日期        |变更摘要|触发来源     |
|------|----------|----|---------|
|v1.0.0|2026-05-31|初版  |Claude 设计|

-----

# W10 实施任务清单(给执行端 cc / codex)

> **目标**:字段判定从”非空”升级到”有效”;漏斗预约口径做成有效性;completeness 按有效字段评分
> **验收标准**:无效信息(市区当地址、改天当时间)被判 invalid;漏斗预约只算有效;报表不实时调 AI
> **关联**:W10_design.md(先读)、W3 completeness、W8 llm-client、W9 funnel
> **本周不做**:诊断颜色界面(W11)、准实时(W12)
> **并入**:W9 v1.1.0(预约改非空)已作废,本周直接做成有效性,不经过非空中间态

-----

## 前置:阅读设计

读 W10_design.md。重点:有效性三态(valid/invalid/unknown)、规则vs AI分工(第2节)、有效性结果存库报表只读(第3节,成本铁律)、漏斗口径升级(第4节)。

复用 W8 的 llm-client(已有),不要新写 LLM 调用。

-----

## Task 1 — 放文档

```bash
cd ~/vscode/chatsift
cp <W10_design.md> docs/architecture/W10_design.md
cp <W10_tasks.md>  docs/architecture/W10_tasks.md
git add docs/architecture/W10_*.md
git commit -m "docs(W10): field validity design + tasks"
```

-----

## Task 2 — 字段有效性规则(business-rules 扩展)

在 `server/src/v1/business-rules.js`(W7 建的)加有效性规则:

```javascript
validity: {
  contactRegex: /^1[3-9]\d{9}$/,        // 手机号
  wechatRegex: /^[a-zA-Z][a-zA-Z0-9_-]{5,19}$/,  // 微信号
  cityList: [...],                       // 城市词表(可复用现有)
  carTypeList: ['轿车','SUV','商务车','7座','七座',...],
  // 明显无效的姓名/时间关键词
  invalidNameWords: ['不知道','老板','问问','无',...],
  vagueTimeWords: ['改天','有空','再说','最近','以后'],
}
```

注释标明这是租车规则,未来租户化(和 W7 的 business-rules 一致)。

-----

## Task 3 — 有效性判定模块

新建 `server/src/v1/validity-checker.js`(或并入 completeness-engine)。

```
checkValidity(tenantId, fields):  // fields = 规则抽出的字段值
  对每个字段:
    - 空值 → invalid(不调 AI)
    - 能用规则判的(contact正则/city词表/car_type词表/明显无效name/vague time)→ 规则判 valid/invalid(不调 AI)
    - 规则判不准且非空的(pickup点vs片 / time具体度 / name真伪)→ 调 AI
  返回 { name:'valid|invalid|unknown', contact:..., ... }
```

AI 判定调 W8 的 llm-client.chat,prompt 要求返回结构化结果(每字段 valid/invalid + 简短理由)。

铁律:

- 规则能判的不调 AI;空字段直接 invalid 不调 AI
- 只对”非空且规则判不准”的字段调 AI(省钱)
- llm-client 返回 ok:false(配额耗尽/失败)→ 那些字段标 unknown,不报错
- AI 的理由存下来(供 W11 诊断显示)

-----

## Task 4 — 接入 completeness + 存有效性

改 `server/src/v1/completeness-engine.js`:

- 抽字段后,调 validity-checker 判有效性
- completeness_score 改为”valid字段数/总数×100”(只算有效字段)
- 把字段值 + field_validity(JSON,见设计3.2方案B)一起存库

schema 增量:存 field_validity JSON 列(存在 completeness 结果所在的表)。

```sql
-- 示例,实际表名以现状为准
ALTER TABLE <completeness结果表> ADD COLUMN field_validity JSON DEFAULT NULL COMMENT '各字段有效性 valid/invalid/unknown';
```

记进 schema 变更说明。

-----

## Task 5 — 漏斗口径升级为有效性

改 W9 的 funnel(及 by-page/trend)的预约/留资口径(详见 W10_design 第4节):

```
留资 = contact 字段 valid 的会话(不只是非空)
预约 = 6字段全部 valid 的会话(name/city/time/contact/pickup_location/car_type 都 valid)
unknown 不算 valid(配额耗尽没校验的,显示"待核对",不算进预约)
```

仍按实体字段(field_validity)判,不按 score/stage。真包含仍成立(预约⊂留资⊂咨询)。
预约口径全局统一(funnel/by-page/trend 用同一判断,抽公共函数)。

-----

## Task 6 — 验收

### 6.1 有效性判定

```bash
TOKEN=<login>; BASE=http://127.0.0.1:3100
# 前提:后台已配 DeepSeek key 并启用(W8)

# 有效 vs 无效联系方式
curl ... content_text="预约,刘思奇,上海,明天下午3点,13800138000,普陀区镇坪路666号魔方公寓,轿车"
# 期望:6字段全 valid,进预约环

curl ... content_text="预约,老板,市区,改天,回头加微信,要个车"
# 期望:name=invalid(老板) city/pickup=invalid(市区/无) time=invalid(改天) contact=invalid(无号),不进预约

# 地址点vs片(AI)
curl ... content_text="...上车位置浦东新区..."  # 期望 pickup=invalid(片区)
curl ... content_text="...上车位置张江路123号..."  # 期望 pickup=valid(点)
```

### 6.2 漏斗

```bash
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/analytics/funnel"
# 期望:预约只算6字段全valid的;inquiry≥lead≥appointment;转化率≤100%
# 造一条"6字段都填了但地址是市区"的 → 算留资不算预约(验证有效性生效)
```

### 6.3 成本验证(关键)

```bash
# 看报表时不调 AI:连续刷 funnel 几次,查 monthly_token_used 不变
# 只在分析消息时调,且规则能判的不调
```

### 6.4 配额降级

```bash
# 配额设很小,触发分析 → AI判的字段标 unknown,不报错,不算进预约
```

### 6.5 重跑回归

```bash
# 重跑 W3/W7/W8/W9 核心:规则路径、工单、lead、漏斗框架未坏
# 注意 completeness_score 现在按有效字段算,W3 验收的分数预期要相应更新
```

### 6.6 提交

```bash
git add server/
git commit -m "feat(W10): field validity check (rule + AI)

- validity-checker: 字段有效性三态(valid/invalid/unknown), 规则优先AI兜底
- contact正则/city词表/car_type词表规则判; 地址点vs片/时间具体度/姓名真伪 AI判
- completeness 接有效性, score 改按有效字段数, 存 field_validity
- 漏斗预约口径升级为6字段全valid(并入W9 v1.1.0), 留资=contact valid
- 成本: 规则能判不调AI, 结果存库报表只读, 配额耗尽标unknown
- 重跑 W3/W7/W8/W9"
git log --oneline -10
```

-----

## 完成标准(验收报告)

> 报告写 `docs/reports/W10_acceptance.md`。注意不要写真实 key。

- [ ] validity-checker:三态判定,规则优先 AI 兜底
- [ ] 无效信息被判 invalid:市区当地址、改天当时间、非号码当联系方式、“老板”当姓名
- [ ] 地址点vs片 AI 判对(具体门牌 valid,片区 invalid)
- [ ] completeness_score 按有效字段数算
- [ ] field_validity 存库
- [ ] 漏斗:预约=6字段全valid,留资=contact valid,真包含,转化率≤100%
- [ ] 成本:看报表不调 AI(token 不变),规则能判不调 AI
- [ ] 配额耗尽:AI部分标 unknown,不报错,不算进预约
- [ ] 重跑 W3/W7/W8/W9 回归正常(completeness 分数预期相应更新)
- [ ] git log W10 独立;报告无明文 key

-----

## 重要提示

- **第一铁律:有效性存库,报表只读不重算 AI**。漏斗会被反复刷新,实时调 AI 成本失控
- **规则优先 AI 兜底**:规则能判的(手机号正则/城市词表/车型词表/明显无效)不调 AI;空字段直接 invalid 不调 AI;只对”非空且规则判不准”的(地址点/片、模糊时间、姓名真伪)调 AI
- **配额耗尽标 unknown**,不是 invalid、不报错。unknown 显示”待核对”,不算进预约
- **复用 W8 llm-client**,不新写 LLM 调用
- **改 completeness(C类)+ schema 增量**,重跑 W3/W7/W9
- **completeness_score 口径变了**(按有效字段),W3 验收的分数预期要相应更新,这是预期不是 bug
- **AI 返回带理由**:有效性判定的理由存下来,W11 诊断显示要用
- **预约口径全局统一**,funnel/by-page/trend 一致,抽公共函数
- **不要改 chat_rpa**(只读参考)