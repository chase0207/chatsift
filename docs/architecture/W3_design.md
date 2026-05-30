# Chatsift W3 设计说明:Goal / Completeness / WorkOrder 三引擎

> **周次**:W3
> **范围**:把分析流水线从单 stage(intent)扩展到完整四 stage
> **关联**:W2_design.md(pipeline 结构)、PRD 第 2/4/5 章、v1-schema.sql
> **本周不做**:LLM 真实调用(仍 stub)、派单自动化(只生成待分配工单)、后台页面

-----

## 1. 本周在 pipeline 里加什么

W2 的 pipeline 只有一个 stage:

```javascript
const pipeline = [intentStage];
```

W3 扩展为四个:

```javascript
const pipeline = [
  intentStage,        // W2 已有:意图分类
  goalStage,          // W3 新增:推进阶段判断
  completenessStage,  // W3 新增:字段抽取 + 完整度评分
  workorderStage,     // W3 新增:工单生成
];
```

每个 stage 接收同一个 ctx 对象,往里写自己的结果。persist 阶段统一回写数据库。这是 W2_design 2.6 节定下的扩展方式,W3 严格遵守,不改 worker 主循环。

ctx 对象在 W3 后的结构:

```javascript
ctx = {
  tenantId, conversationId, messageId,
  message,            // 当前消息
  contextTexts,       // 最近 N 条 inbound 文本(intent 用)
  contextMessages,    // 最近 N 条完整消息对象(goal/completeness 用)
  conversation,       // 当前 conversation 记录

  intent: { label, confidence, source },     // intentStage 产出
  goal:   { stage },                          // goalStage 产出
  completeness: { score, fields, missing },   // completenessStage 产出
  workorder: { created, id, type },           // workorderStage 产出
}
```

-----

## 2. Goal Engine — 推进阶段判断

### 2.1 职责

判断这个会话推进到了哪个业务阶段,写入 conversation.current_stage。阶段反映”离成交还有多远”,是后续运营优先级排序的依据。

四个阶段(对应 v1-schema 的 current_stage 字段):

```
new        — 新会话,刚开始,意图还不明确或只是泛泛咨询
collecting — 正在收集信息,用户有明确意图但关键字段还没齐
completing — 信息接近齐全,临门一脚(完整度高但还差一两个字段)
done       — 信息齐全 / 已转工单待人工处理 / 已成交
```

### 2.2 判断逻辑(规则驱动,不用 LLM)

W3 的 goal 判断依赖 intent 和 completeness 的结果,所以 goalStage 在 pipeline 里**放在 completenessStage 之后**逻辑上更顺。但有个先后矛盾:completeness 只对 appointment / price_inquiry 有意义,goal 又依赖 completeness。解决办法是调整 pipeline 顺序:

```javascript
const pipeline = [
  intentStage,
  completenessStage,  // 先抽字段评分
  goalStage,          // 再根据 intent + completeness 判断阶段
  workorderStage,     // 最后生成工单
];
```

goal 判断规则:

```
若 intent = complaint:
  stage = done(投诉直接转工单,不需要"收集信息"阶段)

若 intent = simple_inquiry:
  stage = new(简单咨询,停留在初始阶段,等人工判断意向)

若 intent = appointment 或 price_inquiry:
  根据 completeness.score:
    score = 0          → new
    0 < score < 60     → collecting
    60 <= score < 100  → completing
    score = 100        → done
```

### 2.3 输出

```javascript
ctx.goal = { stage: 'collecting' };
```

-----

## 3. Completeness Engine — 字段抽取 + 完整度评分

### 3.1 职责

针对 appointment 和 price_inquiry 两类意图,从对话里抽取关键字段,计算完整度评分,标记缺失字段。simple_inquiry 和 complaint 不需要完整度(分别走人工判断和直接转工单),completeness 对这两类直接返回 score=0、空字段。

### 3.2 字段定义

**预约(appointment)需要 5 个字段**(PRD 2.2):

```
city         城市
time         时间
contact      联系方式(电话/微信)
project      项目(什么课程/服务)
store        门店
```

**问价(price_inquiry)需要 2 个核心字段**(PRD 2.4):

```
city         城市
hours        课时
project      项目(可选,加分项)
```

### 3.3 抽取方法(W3 用规则,LLM 留 stub)

W3 的字段抽取用规则/正则,LLM 抽取留 stub(W8 接通)。规则示例:

```
city 抽取:
  匹配"在XX""XX区""XX市",或命中预设城市词表(上海/北京/...)
  例:"我在浦东" → city=浦东

time 抽取:
  匹配"这周末""明天""X月X号""下午X点"等时间表达
  例:"约这周六下午" → time=这周六下午

contact 抽取:
  手机号正则 1[3-9]\d{9}
  微信号:命中"微信""加我""vx"等关键词后的字母数字串

hours 抽取:
  匹配"X小时""X课时""X个小时"
  例:"10小时的课" → hours=10

project 抽取:
  命中产品词表(陪驾/陪练/科目二/...)或价格表里的 product_name

store 抽取:
  命中门店词表(需企业配置,W3 先留空抽取,返回 missing)
```

抽取结果存入 ctx.completeness.fields。

### 3.4 评分逻辑

```
appointment:
  5 个字段,每个 20 分,满分 100
  score = 已抽到的字段数 × 20
  missing = 未抽到的字段名数组

price_inquiry:
  city + hours 各 50 分(project 是加分项,不计入必需)
  score = (有city?50:0) + (有hours?50:0)
  missing = 缺失的核心字段

simple_inquiry / complaint:
  score = 0, fields = {}, missing = []
  (这两类不评完整度)
```

### 3.5 输出

```javascript
ctx.completeness = {
  score: 40,
  fields: { city: '浦东', time: '这周六', contact: null, project: '陪驾', store: null },
  missing: ['contact', 'store']
};
```

-----

## 4. WorkOrder Engine — 工单生成

### 4.1 职责

根据 intent 生成对应类型的工单,写入 workorders 表。这是 W3 的最终产物,也是整个 chatsift 交付给业务的核心价值。

### 4.2 四类工单生成规则

|intent        |workorder_type|title 模板 |payload                            |priority|SLA|
|--------------|--------------|---------|-----------------------------------|--------|---|
|simple_inquiry|inquiry       |线索跟进:{昵称}|{ intent_summary }                 |5       |24h|
|appointment   |appointment   |预约确认:{昵称}|{ city,time,contact,project,store }|3       |4h |
|complaint     |complaint     |投诉处理:{昵称}|{ complaint_summary }              |1       |1h |
|price_inquiry |pricing       |报价回复:{昵称}|{ city,hours,project,quote }       |4       |2h |

priority 数字越小越紧急。投诉 1(最紧急)、预约 3、问价 4、咨询 5。

SLA 是从工单创建时间往后推的截止时间,写入 sla_due_at。投诉 1 小时、问价 2 小时、预约 4 小时、咨询 24 小时。

### 4.3 去重:一个会话同类工单不重复生成

一个会话随着对话进行会被反复分析(每条新消息触发一次),不能每次都生成新工单。规则:

```
生成工单前,检查该 conversation 是否已有同 type 且未完成(status != done/cancelled)的工单:
  SELECT id FROM workorders
  WHERE conversation_id=? AND workorder_type=? AND status NOT IN ('done','cancelled')

  已存在 → 更新该工单的 payload / completeness / missing_fields(用最新分析结果),不新建
  不存在 → 新建工单
```

这样一个预约会话只有一张预约单,随着用户补充信息,单子的 completeness 会从 40 涨到 100,而不是产生 5 张重复单。

### 4.4 报价单的特殊处理(pricing)

price_inquiry 生成 pricing 工单时,如果 city 和 hours 都抽到了,顺便查价格表生成报价建议:

```
若 completeness.fields.city 和 hours 都有:
  SELECT * FROM price_table
  WHERE tenant_id=? AND city=? AND (hours=? 或 product_name LIKE project)
  AND enabled=1
  查到 → payload.quote = 价格信息, suggestion = "建议报价:XXX 元"
  没查到 → suggestion = "价格表无匹配,需人工报价"
```

这是 PRD 2.4 描述的”查询价格表,生成报价建议”。

### 4.5 投诉单的特殊处理(complaint)

complaint 生成时,payload.complaint_summary 先用消息原文(W3),W8 接 LLM 后改为 LLM 总结的投诉类型 + 摘要。风险等级 W3 先固定 high。

### 4.6 输出与 Lead 联动

W3 工单生成后,**暂不做 Lead 创建**(Lead Engine 是 W7)。workorderStage 只写 workorders 表。ctx.workorder 记录生成结果供日志。lead_id 字段 W3 先留 NULL,W7 补。

```javascript
ctx.workorder = { created: true, id: 123, type: 'appointment' };
```

-----

## 5. persist 阶段调整

W2 的 persist 只回写 conversation 的 intent 字段。W3 扩展为回写全部分析结果:

```
UPDATE conversations SET
  intent_label=?, intent_confidence=?, intent_source=?,
  current_stage=?,              -- goal 产出
  completeness_score=?,          -- completeness 产出
  analyzed_at=NOW()
WHERE id=?
```

工单的写入在 workorderStage 内部完成(因为涉及去重查询),不放在 persist。completeness 的字段明细(fields/missing)存在工单的 payload/missing_fields 里,不单独存 conversation(conversation 只存 score 汇总)。

-----

## 6. 数据流验证(W3 结束时应该能看到)

```
上报 "我想预约,我在浦东,约这周六,陪驾课"
  → intent=appointment
  → completeness: city=浦东,time=这周六,project=陪驾,contact=null,store=null
    score = 3×20 = 60, missing=[contact,store]
  → goal: appointment + score60 → completing
  → workorder: 新建 appointment 单,completeness=60,missing=[contact,store],
    priority=3, sla_due_at=now+4h
  → conversation: intent=appointment, stage=completing, score=60

再上报同会话 "我电话13800138000,去徐家汇店"
  → completeness: 再抽到 contact + store, score=100
  → goal: completing → done
  → workorder: 找到已有 appointment 单,更新 score=100, missing=[], 不新建
  → conversation: stage=done, score=100
```

一个会话演进过程中,工单只有一张,completeness 从 60 涨到 100。

-----

## 7. 配置项

```
SLA_INQUIRY_HOURS=24
SLA_APPOINTMENT_HOURS=4
SLA_COMPLAINT_HOURS=1
SLA_PRICING_HOURS=2
COMPLETENESS_CITY_LIST=上海,北京,广州,深圳,...   # 城市词表,逗号分隔
COMPLETENESS_PROJECT_LIST=陪驾,陪练,科目二,科目三   # 项目词表
```

城市表和项目表 W3 先用环境变量配置的简单词表,后续可以做成数据库可配置。

-----

## 8. 风险与注意

第一,**pipeline 顺序**。必须是 intent → completeness → goal → workorder。goal 依赖 completeness 的 score,workorder 依赖前三者全部结果。顺序错了会拿到空值。

第二,**工单去重是 W3 最容易出 bug 的地方**。务必按 4.3 的规则查”同会话同类型未完成工单”,否则一个活跃会话会刷出大量重复工单。验收时要专门测”同一会话连发 3 条消息,只产生 1 张工单”。

第三,**completeness 只对 appointment/price_inquiry 算**。另两类直接返回 score=0,不要去抽字段(浪费且可能误抽)。

第四,**字段抽取的规则会有误差**。W3 用规则抽取,准确率有限(比如”这周六”能抽到但”周末有空吗”可能抽不到 time)。这是预期的,W8 接 LLM 后准确率会提升。W3 验收只要规则能抽到明确表达的字段即可,不追求高召回。

第五,**SLA 时间用 UTC 还是本地时区**。建议统一存 UTC,展示时转。但 chat_rpa 现有代码可能用本地时区,cc 要和现有 conversation.created_at 的时区保持一致,不要混用。