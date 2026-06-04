-----

## 文档: W7 实施任务清单 — Lead Engine + 线索中心
版本: v1.1.0
周次: W7
状态: Active

## 变更日志

|版本    |日期        |变更摘要                                                                                         |触发来源           |
|------|----------|---------------------------------------------------------------------------------------------|---------------|
|v1.1.0|2026-05-31|新增 Task2 建 business-rules.js(规则集中配置);新增 Task3 校准 completeness 租车6字段+占比评分;lead 档案加姓名字段;Task 重排|用户补充(业务规则按租户隔离)|
|v1.0.0|2026-05-31|初版                                                                                           |Claude 设计      |

-----

# W7 实施任务清单(给执行端 cc / codex)

> **目标**:lead engine 把会话沉淀成线索 + 后台线索中心可用
> **验收标准**:预约会话生成高意向 lead;人工改 status 后分析不回退;线索中心能看能改
> **关联**:W7_design.md(先读)、v1-schema.sql(leads 表)、v1-api-spec.md(leads 接口)
> **聚合模型**:C(单页面内按客户聚合 ≈ 会话一对一),表结构按 B 预留
> **本周不做**:跨平台客户合并、自动派单、线索导出

-----

## 前置:阅读设计

先读 W7_design.md,重点理解:模型 C(lead 跟 conversation 一对一,但结构留 B 的余地)、评分规则(第 3 节)、status 不被分析回退(第 4 节)、字段只增不减。

-----

## Task 1 — 放文档

```bash
cd ~/vscode/chatsift
cp <W7_design.md> docs/architecture/W7_design.md
cp <W7_tasks.md>  docs/architecture/W7_tasks.md
git add docs/architecture/W7_design.md docs/architecture/W7_tasks.md
git commit -m "docs(W7): lead engine design + tasks"
```

-----

## Task 2 — 建 business-rules.js(规则集中配置)

新建 `server/src/v1/business-rules.js`,把”未来要租户化”的规则集中放这里(见 W7_design 第 0 节)。本周仍是硬编码(租车),但结构集中、注释标明。

```javascript
// business-rules.js
// 注意: 这是「租车行业」硬编码规则。未来租户化时改为按 tenant_id 读配置表,引擎逻辑不变。
module.exports = {
  appointmentFields: ['name', 'city', 'time', 'contact', 'pickup_location', 'car_type'],
  priceFields: ['city', 'car_type'],
  leadScore: {
    intentBase: { appointment:50, price_inquiry:35, simple_inquiry:15, complaint:10 },
    completenessFactor: 0.3,
    contactBonus: 15,
    stageBonus: { completing:10, done:15 },
  },
};
```

completeness-engine 和 lead-engine 都从这里 require,不再内联硬编码字段/权重。

-----

## Task 3 — 校准 completeness 字段(改 W3,租车场景)

改 `server/src/v1/completeness-engine.js`(C 类,动 W3),按 W7_design 0.4 节:

1. 预约字段从”城市/时间/联系方式/项目/门店”改为 business-rules 的 appointmentFields:
   **姓名/城市/时间/联系方式/上车位置/车型**(6 个)
1. 新增抽取逻辑:
- name(姓名):匹配”姓名:xxx”“我叫xxx”“名字xxx”,或多行结构里的”姓名:”
- pickup_location(上车位置):匹配”上车”“位置”“地址”“在xxx接”
- car_type(车型):匹配”轿车/SUV/商务车/七座”等车型词表
- 去掉 project/store 的抽取
1. 评分改为占比:`score = round(已填字段数 / 字段总数 × 100)`,不再每字段 20 分
1. price_inquiry 字段从 city+hours 改为 city+car_type

字段定义和词表从 business-rules.js 读。

-----

## Task 4 — leads 表加姓名字段(小 schema 增量)

确认 W1 的 leads 表有没有存”真实姓名”的字段。leads 表有 customer_nickname(抖音昵称),但预约时留的真名(如”刘思奇”)需要单独字段。

如果没有,加一个:

```sql
ALTER TABLE leads ADD COLUMN customer_name VARCHAR(64) DEFAULT NULL COMMENT '客户真实姓名(预约留的,区别于抖音昵称)' AFTER customer_nickname;
```

记进 docs 的 schema 变更说明。

-----

## Task 5 — 写 Lead Engine

新建 `server/src/v1/lead-engine.js`。

实现 `upsert(ctx)`,在 leadStage 调用。逻辑(详见 W7_design 第 2-3 节):

```
upsert(ctx):
  1. 查现有 lead:
     SELECT * FROM leads WHERE tenant_id=? AND primary_conversation_id=?
  2. 算 lead_score(权重从 business-rules.leadScore 读):
     基础分(intent) + completeness×0.3 + 联系方式15 + 阶段分
     lead_score = min(100, 和)
     lead_level = score>=70?high : score>=40?mid : low
  3. 不存在 → INSERT:
     nickname, customer_name(从 completeness.fields.name 取), customer_platform_uid(=nickname),
     primary_conversation_id, phone/wechat/city(从 completeness.fields 抽),
     intent_label, lead_score, lead_level, status='new'
  4. 存在 → UPDATE:
     - 档案字段只增不减(已有非空的 name/phone/wechat/city 不被空值覆盖)
     - 重算 lead_score / lead_level
     - intent_label 更新
     - status 绝对不动(人工状态不回退)
  5. 回写 conversation.lead_id(可选,建立反向关联)
```

评分权重和字段从 business-rules.js 读,不内联。导出 upsert。

-----

## Task 6 — 接入 pipeline

改 `server/src/v1/analyzer.js`,pipeline 末尾加 leadStage:

```javascript
const leadEngine = require('./lead-engine');
const pipeline = [
  intentStage, completenessStage, goalStage, workorderStage,
  leadStage,   // W7 新增
];
async function leadStage(ctx) {
  ctx.lead = await leadEngine.upsert(ctx);
}
```

确认 ctx 里有 leadStage 需要的数据:conversation 信息、completeness.fields、intent、goal.stage。如果 ctx 缺字段,在 buildContext 补上(参考 W3 怎么传 conversation 的)。

-----

## Task 7 — 实现 leads 接口(W1 stub 转真实)

`server/src/controllers/` 下 leads controller,实现 v1-api-spec 定义的:

```
GET   /api/v1/leads              列表,筛选 status/lead_level/city/keyword + 分页
GET   /api/v1/leads/:id          详情(含关联 conversation、workorders)
PATCH /api/v1/leads/:id          更新 status / 补充档案字段
POST  /api/v1/leads/:id/convert  status 置 converted
```

注意 tenant_id 隔离,所有查询带 WHERE tenant_id=?。

PATCH 更新 status 时,这是人工操作,允许改成 following/converted/lost。

-----

## Task 8 — 后台线索列表页

新建 `admin/src/views/Leads.vue`,沿用 W6 的 Conversations.vue 风格。

- 新建 `admin/src/api/leads.js`(参考 api/conversations.js):
  
  ```javascript
  import request from '../utils/request'
  export const listLeads   = (params)   => request.get('/v1/leads', { params })
  export const getLead     = (id)       => request.get(`/v1/leads/${id}`)
  export const updateLead  = (id, data) => request.patch(`/v1/leads/${id}`, data)
  export const convertLead = (id)       => request.post(`/v1/leads/${id}/convert`)
  ```
- 筛选栏:意向度(high/mid/low)、状态(new/following/converted/lost)、城市、关键词
- el-table 列:客户昵称、意向度 tag(high=danger、mid=warning、low=info)、lead_score、意图、城市、电话、状态、最后跟进时间
- 操作列:查看 → 详情页;状态下拉直接改(following/converted/lost)
- 分页

-----

## Task 9 — 后台线索详情页

新建 `admin/src/views/LeadDetail.vue`,路由 `/leads/:id`。

- 客户档案卡片:昵称、电话、微信、城市、意向度、score、status
- 关联会话:点击跳 `/conversations/:primary_conversation_id`
- 关联工单:展示该客户的工单列表(从详情接口返回)
- 状态变更:下拉改 status + 保存

-----

## Task 10 — 路由 + 菜单

- router 加 `/leads`(Leads.vue,权限 lead:manage)和 `/leads/:id`(LeadDetail.vue)
- 确认 DB 菜单”线索中心”的 path 和 `/leads` 对上(参考 W6 会话中心怎么对的)

-----

## Task 11 — 验收

### 8.1 服务端验收(curl)

```bash
TOKEN=<login>
BASE=http://127.0.0.1:3100

# 1. 上报预约会话(留电话+城市)
curl -X POST $BASE/api/v1/events/batch -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"events":[{"platform":"douyin","conversation_id":"w7_lead","message_id":"w7_l1","direction":"inbound","content_type":"text","content_text":"我想预约陪驾,在上海,电话13800138000","occurred_at":"2026-05-31T10:00:00+08:00"}]}'
sleep 2

# 2. 查 lead 生成
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/leads"
# 期望:1条 lead,nickname、phone=13800138000、city=上海,lead_score 高,lead_level=high,status=new

# 3. 人工改 status 为 following
LEAD_ID=<上面拿到的id>
curl -X PATCH $BASE/api/v1/leads/$LEAD_ID -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"status":"following"}'

# 4. 同会话再上报消息,验证 status 不被打回 new
curl -X POST $BASE/api/v1/events/batch -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"events":[{"platform":"douyin","conversation_id":"w7_lead","message_id":"w7_l2","direction":"inbound","content_type":"text","content_text":"这周六可以吗","occurred_at":"2026-05-31T10:01:00+08:00"}]}'
sleep 2
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/leads/$LEAD_ID"
# 期望:status 仍是 following(没被分析打回 new),但字段/score 可能更新

# 5. 泛泛咨询会话 → 低意向 lead
curl -X POST $BASE/api/v1/events/batch -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"events":[{"platform":"douyin","conversation_id":"w7_simple","message_id":"w7_s1","direction":"inbound","content_type":"text","content_text":"你们好","occurred_at":"2026-05-31T10:05:00+08:00"}]}'
sleep 2
# 期望:lead_level=low

# 6. 租车完整预约信息 → 验证 6 字段校准 + 占比评分
curl -X POST $BASE/api/v1/events/batch -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"events":[{"platform":"douyin","conversation_id":"w7_full","message_id":"w7_f1","direction":"inbound","content_type":"text","content_text":"我想预约,姓名刘思奇,在上海,这周六,电话13913972023,上车位置普陀区镇坪路魔方公寓,轿车","occurred_at":"2026-05-31T10:08:00+08:00"}]}'
sleep 2
mysql -h127.0.0.1 -uroot chatsift -e "SELECT completeness_score FROM conversations WHERE platform_conversation_id LIKE '%w7_full%';" 2>/dev/null || \
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/workorders?workorder_type=appointment"
# 期望:6字段全抽到 → completeness=100(6/6);
#       lead 的 customer_name=刘思奇, city=上海, contact=13913972023
# 验证占比评分:若只抽到4个字段应是 round(4/6×100)=67
```

### 8.2 后台验收(Chase 配合)

1. 登录后台,进”线索中心”,看到上面生成的 lead,意向度 high
1. 筛选意向度=high,能筛出
1. 点详情,看到客户档案、关联会话入口、关联工单
1. 改 status 为 following,保存,列表刷新

### 8.3 重跑前序验收(确认 pipeline 没坏)

leadStage 加在 pipeline 末尾,确认没影响前面:

```bash
# 重跑 W3 四类工单验收的核心 case(投诉/预约/报价/咨询)
# 确认四类工单仍正常生成,intent/completeness/workorder 没受影响
```

### 8.4 提交

```bash
git add server/ admin/
git commit -m "feat(W7): lead engine + lead center + 租车字段校准

- business-rules.js: 业务规则集中配置(为租户化预留)
- completeness 字段校准为租车6字段(姓名/城市/时间/联系方式/上车位置/车型), 占比评分
- leads 表加 customer_name 字段
- lead-engine.js: 会话沉淀为线索, 意向度评分, 字段累计, status不回退
- pipeline 末尾加 leadStage
- /api/v1/leads 接口实现, admin Leads.vue + LeadDetail.vue
- 验收: 预约高意向lead, status人工改后不被分析回退, 重跑W3"
git log --oneline -8
```

-----

## 完成标准(验收报告)

> 报告写 `docs/reports/W7_acceptance.md` 落盘 + 进 git。

- [ ] business-rules.js 建好,completeness/lead-engine 从它读规则(不内联)
- [ ] completeness 校准为租车6字段,占比评分:6字段全填=100,4字段=67
- [ ] leads 表有 customer_name 字段,预约姓名(如刘思奇)存进去
- [ ] 预约会话生成 lead:档案字段填好,lead_score 高,level=high,status=new
- [ ] 同会话再分析:字段累计、score 重算,但 status 不变
- [ ] 人工改 status=following 后,后续分析不回退为 new(关键)
- [ ] 泛泛咨询 → level=low
- [ ] 后台线索中心:列表/筛选/详情/改状态可用
- [ ] 重跑 W3 验收:四类工单未受 leadStage + 字段校准影响
- [ ] git log W7 commit 独立
- [ ] A 类调整说明(若有);B/C 类问题单独成文

-----

## 重要提示

- **status 不被分析回退**是本周最易出 bug 的点:leadStage 的 UPDATE 绝对不能动 status 字段,人工设的 following/converted/lost 要保住
- **业务规则收拢到 business-rules.js**:本周仍硬编码(租车),但集中放置+注释标明,为未来租户化预留。引擎从它读,不内联
- **completeness 改字段是 C 类**(动 W3):字段改6个、评分改占比,改完必须重跑 W3 验收
- **姓名 vs 昵称**:customer_nickname 是抖音昵称,customer_name 是预约留的真名,两个字段都要
- **字段只增不减**:lead 已有的非空 name/phone/wechat/city 不被空值覆盖(和 W6.5 completeness 一致)
- **模型 C 不写跨会话合并**,但 leads 表别焊死成强一对一(conversation 上别加 NOT NULL 唯一 lead_id),给未来模型 B 留路
- **leadStage 接 pipeline 末尾**,在 workorder 之后,依赖前面所有结果
- **同名误合并是已知权衡**(W6.5 接受的),本周继承,不解决
- **新页面沿用 W6 的 Element Plus 风格**,参考 Conversations.vue
- **不要改 chat_rpa**(只读参考)
- 评分规则跑出来如果觉得不合理(比如都偏高/偏低),先按规则跑通,验收时反馈实际分布,调权重是 A 类