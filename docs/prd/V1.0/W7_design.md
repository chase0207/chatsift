-----

## 文档: W7 设计说明 — Lead Engine(线索引擎)
版本: v1.1.0
周次: W7
状态: Active

## 变更日志

|版本    |日期        |变更摘要                                                                                |触发来源           |
|------|----------|------------------------------------------------------------------------------------|---------------|
|v1.1.0|2026-05-31|新增第 0 节业务规则配置化原则(为租户化预留);completeness 预约字段校准为租车场景6字段(姓名/城市/时间/联系方式/上车位置/车型),评分改按字段占比|用户补充(业务规则按租户隔离)|
|v1.0.0|2026-05-31|初版,lead engine 设计(模型 C 聚合 + 意向度评分 + 跟进状态)                                           |Claude 设计      |

-----

# W7 设计说明:Lead Engine

> **周次**:W7
> **范围**:把会话/工单沉淀成 Lead(线索)——客户档案、意向度评分、跟进状态。对应后台空着的”线索中心”。
> **关联**:PRD 第 4.3 节、v1-schema.sql(leads 表)、W3 三引擎、W6 后台
> **本周不做**:跨平台客户合并(模型 B,未来)、自动派单给销售、线索导出

-----

## 0. 业务规则配置化原则(为租户化预留)

### 0.1 背景

chatsift 未来要服务不同行业的租户(租车/电商/教育),它们的意图关键词、抽取字段、工单字段、评分权重都不同,但**共性是”从对话收集预约/关键信息”**——骨架通用,配置可变。

一期只有租车一个业务,所以**本周仍用硬编码规则(租车场景),不做租户化**。但代码结构上要把”会变的业务规则”和”不变的引擎逻辑”分开,为未来租户化铺路。

### 0.2 本周怎么做(结构预留,逻辑硬编码)

把所有”未来要按租户配置”的规则,从散落在引擎里的硬编码,**收拢成集中的配置常量**,放在显眼位置并注释标明。涉及:

- completeness 的字段定义(租车要哪些字段)
- workorder 的字段
- lead 评分权重

建议放在 `server/src/v1/business-rules.js`(或各引擎顶部统一的 config 块),形如:

```javascript
// business-rules.js
// 注意: 这是「租车行业」的硬编码规则。未来租户化时,
// 改为按 tenant_id 从配置表读取,引擎逻辑不变。
module.exports = {
  // 预约场景要收集的字段(租车)
  appointmentFields: ['name', 'city', 'time', 'contact', 'pickup_location', 'car_type'],
  // 问价场景字段
  priceFields: ['city', 'car_type'],
  // lead 评分权重
  leadScore: {
    intentBase: { appointment:50, price_inquiry:35, simple_inquiry:15, complaint:10 },
    completenessFactor: 0.3,
    contactBonus: 15,
    stageBonus: { completing:10, done:15 },
  },
};
```

引擎(completeness-engine / lead-engine)从这里 require 配置,而不是内联硬编码。

### 0.3 未来租户化怎么升级(本周不做,仅说明)

将来接第二个行业客户时:建一张 `tenant_business_rules` 配置表,实施人员为每个租户配好字段/关键词/权重;把引擎里的 `require('./business-rules')` 改成 `loadRules(tenantId)`;引擎逻辑一行不动。因为配置由平台实施人员做(不开放租户自助),不需要做配置后台 UI,工程量可控。

-----

### 0.4 顺带校准 completeness 字段(改 W3,对齐租车真实场景)

W3 当初定的预约字段是”城市/时间/联系方式/项目/门店”,偏驾校到店场景。本周校准为**租车/陪驾真实字段**:

```
姓名 name           — 新增
城市 city
时间 time
联系方式 contact
上车位置 pickup_location  — 新增(替代"门店",租车是上门/指定地点)
车型 car_type        — 新增(租车特有)
```

去掉”项目 project”“门店 store”(租车用不上),共 **6 个字段**。

**评分算法跟着改**:原 W3 是”每字段 20 分”,6 个字段会超 100。改为**按占比**:

```
completeness_score = round(已填字段数 / 字段总数 × 100)
```

例:6 个字段填了 4 个(姓名/城市/时间/电话) → 4/6 × 100 = 67 分。这样不管字段几个都是满分 100,且加字段/减字段不用改评分公式。

price_inquiry 的字段也同理校准:租车问价看 `city + car_type`(原来是 city + hours,租车按车型不按课时)。

这是改 W3 的 completeness-engine(C 类),改完要重跑 W3 验收确认四类工单仍正常。字段定义放在 0.2 节的 business-rules.js 里(appointmentFields / priceFields)。

-----

## 1. 核心数据模型:Lead 怎么聚合(已定模型 C)

### 1.1 三种模型与本周选择

回顾决策:

- 模型 A:一条会话 = 一个 lead(太碎,同一客户多会话变多线索)
- 模型 B:一个真实客户 = 一个 lead(跨平台跨页面合并,最理想但依赖客户身份识别)
- 模型 C:单平台单页面内按客户聚合(≈ 会话一对一),跨平台不合并

**本周做模型 C,但 leads 表结构按模型 B 预留**。即:逻辑简单(lead 跟着 conversation 走),结构完整(留好跨会话合并的字段和外键),未来抖音能拿到稳定客户 ID 时,不用重构表,只改聚合逻辑即可升级到 B。

### 1.2 Lead 与 Conversation 的关系(本周)

```
Conversation (单页面内按 nickname 合并,W6.5 已实现)
     │ 1
     │
     │ 1
     ▼
Lead (本周与 conversation 一对一)
```

本周一条 conversation 对应一个 lead。但 leads 表用 `primary_conversation_id` 关联,且预留”一个 lead 未来可关联多个 conversation”的能力(通过 conversation 反向记 lead_id,或中间表,本周用 primary_conversation_id 一对一即可)。

### 1.3 为模型 B 预留的结构(本周不启用,但留好)

leads 表(W1 已建)的这些字段就是为 B 预留的:

- `customer_platform_uid`:客户平台 ID。本周抖音拿不到稳定 ID,先填 nickname;未来填真实 uid 时,可按 uid 跨会话聚合
- `primary_conversation_id`:主会话。本周一对一就是它;未来一对多时,它是”首个产生线索的会话”

**本周不写跨会话合并逻辑**,但不要把表结构改成强一对一(比如别在 conversation 上加 NOT NULL 的 lead_id 唯一约束),保持未来可一对多。

-----

## 2. Lead 何时生成 / 更新

### 2.1 触发点:接在 workorder 之后

W3 的 pipeline 是 intent → completeness → goal → workorder。W7 在 workorder 之后加一个 leadStage:

```javascript
const pipeline = [
  intentStage,
  completenessStage,
  goalStage,
  workorderStage,
  leadStage,        // W7 新增
];
```

leadStage 在工单生成后运行,因为 lead 要关联 workorder(知道这个客户产生了哪些工单)。

### 2.2 生成 / 更新逻辑

```
leadStage(ctx):
  1. 查这个 conversation 是否已有关联 lead:
     SELECT id FROM leads WHERE tenant_id=? AND primary_conversation_id=?
  2. 不存在 → 创建 lead:
     - customer_nickname = conversation.customer_nickname
     - customer_platform_uid = conversation.customer_platform_uid(本周=nickname)
     - primary_conversation_id = conversation.id
     - 从 completeness.fields 抽取已知字段填入:name(姓名)/phone(联系方式)/city/wechat
       (注意:租车场景新增了 name 字段,lead 档案也要存客户真实姓名,
        和昵称区分——nickname 是抖音昵称,name 是预约时留的真名如"刘思奇")
     - intent_label = conversation.intent_label
     - lead_score / lead_level = 按评分规则算(见第 3 节)
     - status = 'new'
  3. 已存在 → 更新 lead:
     - 补充新抽到的字段(name/phone/wechat/city,只增不覆盖已有非空值)
     - 重算 lead_score / lead_level
     - intent_label 更新为最新
     - status 不动(status 由人工或后续流程改,分析不回退人工状态)
```

注:lead 的姓名字段如果 W1 的 leads 表没有,需要确认表结构。W1 schema 的 leads 表有 customer_nickname,但可能没有单独的真实姓名字段。如果没有,W7 加一个 `customer_name` 字段(小的 schema 增量),用来存预约时留的真名,和抖音昵称 customer_nickname 区分。

字段累计原则和 W6.5 的 completeness 一致:**已知的客户信息只增不减**。比如 lead 已经有电话了,后续分析没提电话,不要把电话清空。

-----

## 3. 意向度评分(lead_score / lead_level)

### 3.1 评分目的

把线索按”成交可能性”打分,帮销售优先跟进高意向客户。这是 chatsift 交付给业务的核心价值之一——从一堆会话里筛出值得跟的人。

### 3.2 评分规则(规则版,本周不用 LLM)

lead_score 范围 0-100,由几个维度加权:

```
基础分(按意图):
  appointment   → 50(有明确预约意愿,最高意向)
  price_inquiry → 35(问价,有购买考虑)
  simple_inquiry→ 15(泛泛咨询)
  complaint     → 10(投诉,转化意向低但要处理)

完整度加分(按 completeness.score):
  + completeness_score × 0.3
  (信息越全,越接近成交,如 completeness=80 → +24)

联系方式加分:
  有 phone 或 wechat → +15(留了联系方式 = 高意向信号)

阶段加分(按 conversation.current_stage):
  completing → +10
  done       → +15(信息齐全或已转工单)

最终 lead_score = min(100, 上述之和)
```

以上权重数值**放在 0.2 节的 business-rules.js 里**(leadScore 配置块),lead-engine 从那里读,不内联硬编码。这样未来租户化时改配置即可。

### 3.3 意向度分级(lead_level)

```
lead_score >= 70  → high(高意向,优先跟进)
40 <= score < 70  → mid(中意向)
score < 40        → low(低意向)
```

### 3.4 示例

一个预约客户,completeness=80,留了电话,stage=completing:

```
基础分 50(appointment)
+ 完整度 80×0.3 = 24
+ 联系方式 15
+ 阶段 completing 10
= 99 → min(100,99)=99 → level=high
```

一个泛泛咨询,没留联系方式,stage=new:

```
基础分 15 + 0 + 0 + 0 = 15 → level=low
```

评分规则的权重写成配置(常量),方便后续调。

-----

## 4. 跟进状态(status)

### 4.1 状态定义

leads 表的 status 字段:

```
new        新线索,还没人跟进
following  跟进中(人工置)
converted  已成交(人工置)
lost       已流失(人工置)
```

### 4.2 状态由谁改

- `new`:lead 创建时的初始状态,由分析自动设置
- `following / converted / lost`:**只能人工在后台改**,分析流程不自动改

**重要原则:分析流程不回退人工状态**。如果销售已经把一个 lead 标成 following,后续分析(因为客户又发了消息)不能把它打回 new。leadStage 更新 lead 时只更新档案字段和评分,不动 status。

-----

## 5. 后台:线索中心页面

对应 admin 空着的”线索中心”菜单。两个页面,沿用 W6 的 Element Plus 风格。

### 5.1 线索列表页

- 筛选:意向度(high/mid/low)、状态(new/following/converted/lost)、城市、关键词
- 列:客户昵称、意向度(用颜色 tag,high 红/橙、mid 黄、low 灰)、lead_score、意图、城市、电话、状态、最后跟进时间
- 操作:查看详情、改状态(下拉直接改 following/converted/lost)
- 分页

### 5.2 线索详情页

- 客户档案卡片:昵称、电话、微信、城市、意向度、分数、状态
- 关联会话入口:点击跳到对应 conversation 详情(看完整对话)
- 关联工单:这个客户产生的工单列表
- 状态变更 + 跟进备注(可选)

-----

## 6. API(新增 /api/v1/leads,W1 spec 已定义)

W1 的 v1-api-spec 已经定义了 leads 接口,W7 落地实现:

```
GET   /api/v1/leads              列表(筛选 status/level/city/keyword)
GET   /api/v1/leads/:id          详情
PATCH /api/v1/leads/:id          更新(改 status / 补充档案字段)
POST  /api/v1/leads/:id/convert  标记成交
```

W1 时这些可能是 stub,W7 实现真实逻辑。

-----

## 7. 验证(W7 结束应看到)

```
1. 上报一个预约会话(留了电话、城市)
   → 生成 conversation + appointment 工单
   → 生成 lead:nickname、phone、city 填好,score 高,level=high,status=new

2. 同会话再上报消息(补充信息)
   → lead 更新:字段累计,score 重算,status 仍 new

3. 后台线索中心:看到这个 lead,意向度 high
   → 改 status 为 following
   → 再上报消息,确认 status 不被打回 new(分析不回退人工状态)

4. 一个泛泛咨询会话 → lead score 低,level=low
```

-----

## 8. 风险与注意

第一,**leadStage 接在 pipeline 末尾**,在 workorder 之后。它依赖前面所有 stage 的结果(intent/completeness/conversation 信息)。

第二,**字段只增不减**,和 completeness 一致。lead 已有的非空档案字段,后续分析不覆盖成空。

第三,**status 不被分析回退**。人工设的 following/converted/lost,分析只读不写。这是 lead engine 最容易出 bug 的地方——一定要在更新逻辑里排除 status 字段。

第四,**模型 C 不写跨会话合并**,但表结构别焊死成强一对一,给未来 B 留路。

第五,**同名误合并的已知权衡**:本周 lead 跟 conversation 走,conversation 是 pageKey+nickname 合并的,所以同名客户在同一页面会被当成一个 lead。这是 W6.5 就接受的权衡,W7 继承,不在本周解决。