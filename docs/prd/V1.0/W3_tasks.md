# Chatsift W3 实施任务清单(给 Claude Code)

> **周次**:W3
> **目标**:分析流水线四 stage 完整跑通——上报消息后,会话被分类、评分、并生成对应工单
> **验收标准**:上报预约消息生成 appointment 工单;同会话补充信息时工单更新而非新建;四类意图各生成对应类型工单
> **关联文档**:W3_design.md(先读)、W2_design.md(pipeline 结构)、v1-schema.sql
> **本周不做**:LLM 真实调用(stub)、自动派单、Lead 创建(W7)、后台页面

-----

## 前置:阅读设计文档

先通读 `W3_design.md`。重点理解:pipeline 顺序变成 intent→completeness→goal→workorder(注意 completeness 在 goal 之前)、工单去重规则(4.3 节,本周最易出 bug)、四类工单的生成规则表(4.2 节)。

-----

## Task 1 — 放入 W3 设计文档

```bash
cd ~/vscode/chatsift
cp <W3_design.md> docs/architecture/W3_design.md
git add docs/architecture/W3_design.md
git commit -m "docs(W3): add goal/completeness/workorder engine design"
```

-----

## Task 2 — 写 Completeness Engine

新建 `server/src/v1/completeness-engine.js`。

实现 `evaluate(tenantId, intent, contextMessages)` → `{ score, fields, missing }`。

逻辑(详见 W3_design 第 3 节):

```
若 intent 不是 appointment 也不是 price_inquiry:
  return { score: 0, fields: {}, missing: [] }

把 contextMessages 的文本拼起来,做字段抽取:
  - city:   城市词表匹配 + "在XX/XX区/XX市"正则
  - time:   时间表达正则("这周末/明天/X月X号/下午X点")
  - contact: 手机号正则 1[3-9]\d{9} + 微信关键词
  - hours:  "X小时/X课时"正则
  - project: 项目词表匹配
  - store:  门店词表匹配(W3 词表可空,抽不到就 missing)

appointment 评分:5 字段 × 20,score = 命中数 × 20
price_inquiry 评分:city 50 + hours 50(project 不计必需)

返回 fields(含 null 的完整字段对象)、missing(缺失字段名数组)、score
```

字段抽取的词表从环境变量读(COMPLETENESS_CITY_LIST / COMPLETENESS_PROJECT_LIST),用逗号分割。

`llmExtract(tenantId, text, fields)` stub:

```javascript
async function llmExtract(tenantId, text, requiredFields) {
  // TODO W8: LLM 抽取兜底,规则抽不到的字段交给 LLM
  return {}; // W3 返回空,完全依赖规则
}
```

-----

## Task 3 — 写 Goal Engine

新建 `server/src/v1/goal-engine.js`。

实现 `judge(intent, completeness)` → `{ stage }`。

逻辑(W3_design 2.2):

```
intent=complaint        → done
intent=simple_inquiry   → new
intent=appointment / price_inquiry:
  score=0        → new
  0<score<60     → collecting
  60<=score<100  → completing
  score=100      → done
```

纯函数,不查库,不需要 async(但为统一可以 async)。

-----

## Task 4 — 写 WorkOrder Engine

新建 `server/src/v1/workorder-engine.js`。

实现 `generate(ctx)`,根据 ctx.intent / completeness / conversation 生成或更新工单。

逻辑(W3_design 第 4 节):

```
1. 确定 workorder_type 和 priority 和 SLA:
   simple_inquiry → inquiry,   priority 5, SLA 24h
   appointment    → appointment,priority 3, SLA 4h
   complaint      → complaint,  priority 1, SLA 1h
   price_inquiry  → pricing,    priority 4, SLA 2h

2. 去重检查(关键):
   SELECT id FROM workorders
   WHERE conversation_id=? AND workorder_type=? AND status NOT IN ('done','cancelled')
   
   已存在:UPDATE payload / completeness_score / missing_fields(用最新结果),不新建
   不存在:INSERT 新工单

3. pricing 特殊处理:
   若 city 和 hours 都有,查 price_table 生成 quote 和 suggestion
   查到 → payload.quote=..., suggestion="建议报价:X元"
   没查到 → suggestion="价格表无匹配,需人工报价"

4. complaint 特殊处理:
   payload.complaint_summary = 消息原文(W3),risk_level='high'
   (W8 接 LLM 后改为总结)

5. title 用模板:"预约确认:{昵称}" 等
   sla_due_at = NOW() + SLA 小时数
   lead_id 先留 NULL(W7 补)

返回 { created: bool, id, type }
```

-----

## Task 5 — 改造 analyzer.js 的 pipeline

修改 `server/src/v1/analyzer.js`,把 pipeline 扩展为四 stage,注意顺序:

```javascript
const intentEngine = require('./intent-engine');
const completenessEngine = require('./completeness-engine');
const goalEngine = require('./goal-engine');
const workorderEngine = require('./workorder-engine');

const pipeline = [
  intentStage,
  completenessStage,   // 注意:在 goal 之前
  goalStage,
  workorderStage,
];

async function intentStage(ctx) {
  ctx.intent = await intentEngine.classify(ctx.tenantId, ctx.contextTexts);
}
async function completenessStage(ctx) {
  ctx.completeness = await completenessEngine.evaluate(
    ctx.tenantId, ctx.intent.label, ctx.contextMessages);
}
async function goalStage(ctx) {
  ctx.goal = await goalEngine.judge(ctx.intent.label, ctx.completeness);
}
async function workorderStage(ctx) {
  ctx.workorder = await workorderEngine.generate(ctx);
}
```

buildContext 需要扩展:除了 contextTexts(intent 用的文本数组),还要提供 contextMessages(完整消息对象数组,completeness 用)和 conversation(当前会话记录,workorder 用昵称)。

persist 扩展为回写 current_stage 和 completeness_score(W3_design 第 5 节)。

-----

## Task 6 — 补 .env.example

追加:

```
SLA_INQUIRY_HOURS=24
SLA_APPOINTMENT_HOURS=4
SLA_COMPLAINT_HOURS=1
SLA_PRICING_HOURS=2
COMPLETENESS_CITY_LIST=上海,北京,广州,深圳,杭州,南京,成都,武汉
COMPLETENESS_PROJECT_LIST=陪驾,陪练,科目二,科目三,新手上路,长途
```

-----

## Task 7 — 启动与验收

### 7.1 启动

```bash
cd server && npm run dev
# 期望:analyzer worker started,无报错
```

### 7.2 验收 checklist

```bash
TOKEN=<从 auth/login 拿>
BASE=http://127.0.0.1:3100

# --- 测试1:预约工单生成 + 完整度演进 ---
# 第一条:部分信息
curl -X POST $BASE/api/v1/events/batch -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"events":[{"platform":"douyin","conversation_id":"w3_appt","message_id":"w3_appt_1","direction":"inbound","content_type":"text","content_text":"我想预约陪驾,我在上海","occurred_at":"2026-05-30T12:00:00+08:00"}]}'
sleep 2
# 查工单
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/workorders?workorder_type=appointment"
# 期望:1张appointment单,completeness=40(city+project),missing含time/contact/store,priority=3

# 第二条:补充信息(同会话)
curl -X POST $BASE/api/v1/events/batch -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"events":[{"platform":"douyin","conversation_id":"w3_appt","message_id":"w3_appt_2","direction":"inbound","content_type":"text","content_text":"约这周六,我电话13800138000","occurred_at":"2026-05-30T12:01:00+08:00"}]}'
sleep 2
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/workorders?workorder_type=appointment"
# 期望:还是1张单(没新建),completeness涨到80(+time+contact),missing只剩store

# --- 测试2:工单去重(同会话连发,不刷单) ---
mysql -h127.0.0.1 -uroot -p chatsift -e \
  "SELECT COUNT(*) FROM workorders WHERE conversation_id=(SELECT id FROM conversations WHERE platform_conversation_id='w3_appt');"
# 期望:1(不是2不是3)

# --- 测试3:投诉工单 ---
curl -X POST $BASE/api/v1/events/batch -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"events":[{"platform":"douyin","conversation_id":"w3_comp","message_id":"w3_comp_1","direction":"inbound","content_type":"text","content_text":"我要投诉,你们老师太差要退款","occurred_at":"2026-05-30T12:05:00+08:00"}]}'
sleep 2
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/workorders?workorder_type=complaint"
# 期望:complaint单,priority=1,sla_due_at≈now+1h,stage=done

# --- 测试4:报价工单 + 价格表查询 ---
# 先插一条价格表数据
mysql -h127.0.0.1 -uroot -p chatsift -e \
  "INSERT INTO price_table(tenant_id,city,product_name,hours,price,enabled) VALUES(<你的tenant_id>,'上海','陪驾',10,1619,1);"
curl -X POST $BASE/api/v1/events/batch -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"events":[{"platform":"douyin","conversation_id":"w3_price","message_id":"w3_price_1","direction":"inbound","content_type":"text","content_text":"上海陪驾10小时多少钱","occurred_at":"2026-05-30T12:08:00+08:00"}]}'
sleep 2
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/workorders?workorder_type=pricing"
# 期望:pricing单,suggestion含报价(1619),priority=4

# --- 测试5:简单咨询工单 ---
curl -X POST $BASE/api/v1/events/batch -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"events":[{"platform":"douyin","conversation_id":"w3_simple","message_id":"w3_simple_1","direction":"inbound","content_type":"text","content_text":"你们好","occurred_at":"2026-05-30T12:10:00+08:00"}]}'
sleep 2
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/workorders?workorder_type=inquiry"
# 期望:inquiry单,priority=5,stage=new

# --- 测试6:会话状态汇总 ---
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/conversations"
# 期望:w3_appt stage=completing/done score=80, w3_comp stage=done, 等

# --- 测试7:分析队列无堆积 ---
mysql -h127.0.0.1 -uroot -p chatsift -e "SELECT status,COUNT(*) FROM analysis_jobs GROUP BY status;"
# 期望:done 若干,无 pending/failed 堆积
```

### 7.3 提交

```bash
git add server/
git commit -m "feat(W3): goal/completeness/workorder engines

- completeness-engine.js: 字段抽取(规则)+评分, LLM stub
- goal-engine.js: 阶段判断 new/collecting/completing/done
- workorder-engine.js: 4类工单生成+去重+报价表查询
- analyzer.js: pipeline扩展为intent→completeness→goal→workorder
- 验收: 预约单完整度演进40→80, 工单去重, 投诉/报价/咨询单"
git log --oneline -6
```

-----

## W3 完成标准(给我的验收报告)

1. 测试1 两次 curl 的工单输出(看 completeness 从 40 涨到 80)
1. 测试2 工单数量(必须是 1,证明去重生效)
1. 测试3 投诉单(priority=1, SLA≈1h)
1. 测试4 报价单(suggestion 含 1619)
1. 测试5 咨询单(priority=5)
1. 测试7 analysis_jobs 状态分布
1. **`git log --oneline -6`** —— 必须能看到 W0/W1/W2/W3 各自独立的 commit(这是本周硬要求,确认 commit 没漏没混)
1. 任何偏离记录

-----

## 重要提示

- **pipeline 顺序**:intent → completeness → goal → workorder。completeness 在 goal 前面,别搞反(goal 依赖 completeness.score)
- **工单去重是本周最易翻车的点**:务必按 conversation_id + type + status≠done/cancelled 查重,测试2 专门验证
- **completeness 只对 appointment/price_inquiry 算**,另两类直接 score=0
- **LLM 仍是 stub**,字段抽取纯规则,抽不到明确表达的字段是正常的,不追求高召回
- **lead_id 留 NULL**,Lead Engine 是 W7,本周工单不关联 lead
- **SLA 时区**:和现有 conversation.created_at 保持一致,别混 UTC 和本地
- 字段抽取正则拿不准,先停下问我,不要硬猜导致误抽