-----

## 文档: W9 设计说明 — 运营分析 + 修 dashboard
版本: v1.0.0
周次: W9
状态: Active

## 变更日志

|版本    |日期        |变更摘要                                |触发来源     |
|------|----------|------------------------------------|---------|
|v1.0.0|2026-05-31|初版,运营分析(咨询→留资→预约漏斗)+ 修 dashboard 500|Claude 设计|

-----

# W9 设计说明:运营分析 + 修 dashboard

> **周次**:W9(MVP 主线最后一周)
> **范围**:运营分析页(转化漏斗 + 维度分析)+ 修挂起的 dashboard/stats 500
> **关联**:W6 后台、W7 lead、各引擎、dashboardController(老表 bug)
> **本周不做**:导出报表、自定义报表、跨租户对比、实时大屏

-----

## 1. 转化漏斗(核心)

### 1.1 三环定义(已定,不含成交)

chatsift 是采集探针,**看不到线下成交**,所以漏斗到”预约”为止,不放”成交”(成交在线下,数据永远填不准,放了反而失真)。三环都能从现有数据客观算出:

```
咨询 (全部会话)
  = COUNT(conversations)              所有采集到的会话

留资 (留了联系方式)
  = COUNT(conversations 关联的 lead 里 contact/phone/wechat 非空)
    或 completeness 抽到 contact 的会话
  含义:客户留了电话/微信,销售能跟进

预约 (明确预约意图)
  = COUNT(intent_label='appointment')
  含义:客户表达了预约/下单意愿
```

### 1.2 转化率

```
留资率 = 留资数 / 咨询数 × 100%
预约率 = 预约数 / 留资数 × 100%   (注:也可用 预约数/咨询数,看哪个对业务更有意义,默认按相邻环计算)
```

### 1.3 漏斗的业务意义

对租车业务:咨询是”来问的人”,留资是”愿意留联系方式的人”(高意向信号),预约是”明确要约车的人”。三环逐级收窄,转化率告诉运营:获客质量如何(留资率)、留资客户的成交意愿如何(预约率)。这是 chatsift 给运营的核心经营视图。

### 1.4 留资口径确认

“留资”以 lead 的联系方式字段为准(W7 的 lead 已经抽了 phone/wechat)。一个会话只要其 lead 有非空 contact,就算留资。这样和 lead engine 的数据一致,不重复造逻辑。

-----

## 2. 其他分析维度

漏斗之外,几个对运营有用的维度(都是简单聚合):

### 2.1 意图分布

各意图(simple_inquiry/appointment/complaint/price_inquiry)的会话数占比。饼图或柱状。看客户都在问什么。

### 2.2 意向度分布

lead_level(high/mid/low)的线索数。看高意向客户有多少,值得优先投入。

### 2.3 平台/页面对比

按 platform_page(private-message / laike-message / feige)分组,各页面的会话数、留资率、预约率。看哪个入口的客户质量高。一期只有抖音几个页面,但结构支持未来多平台对比。

### 2.4 时间趋势

按天统计会话数、留资数、预约数的趋势(折线)。看每天采集量和转化的变化。支持日期范围筛选。

-----

## 3. 后端:统计接口

新增 `/api/v1/analytics` 系列接口(或一个聚合接口)。这些是只读聚合查询,不改业务表。

```
GET /api/v1/analytics/funnel?from=&to=&platform_page=
  返回:{ inquiry:数, lead:数, appointment:数, leadRate:%, appointmentRate:% }

GET /api/v1/analytics/intent-distribution?from=&to=
  返回:[{ intent_label, count }]

GET /api/v1/analytics/lead-level?from=&to=
  返回:[{ lead_level, count }]

GET /api/v1/analytics/by-page?from=&to=
  返回:[{ platform_page, inquiry, lead, appointment }]

GET /api/v1/analytics/trend?from=&to=
  返回:[{ date, inquiry, lead, appointment }]
```

实现注意:

- 全部带 tenant_id 隔离(WHERE tenant_id=?)
- 日期范围默认近 30 天
- 都是 GROUP BY 聚合,不要 N+1 查询
- 漏斗的”留资”用 lead 表 join(contact 非空),口径见 1.4

-----

## 4. 后端:修 dashboard/stats 500(挂起已久的债)

### 4.1 病因(已知)

`server/src/controllers/dashboardController.js` 的 stats 接口查老表 `message_logs`,但 chatsift 的 schema 用 `messages`(从 W4.5 platforms 那次同类问题就知道,这是 chat_rpa 迁移残留)。导致控制台首页 GET /api/dashboard/stats 报 500(“Table ‘chatsift.message_logs’ doesn’t exist”)。

### 4.2 修法

改 dashboardController,把查询从 message_logs 改成 chatsift 的真实表:

- “今日消息数”类指标:从 `messages` 表查(WHERE DATE(occurred_at)=今天 或 uploaded_at)
- “会话数/工单数/线索数”类:从 conversations/workorders/leads 查
- 确认 dashboard 首页那几个统计卡片(截图见过:用户总数/授权插件/今日消息/在线设备)的数据源都对——其中”今日消息”要改成查 messages

### 4.3 注意

- dashboardController 是 W1 之前迁移来的老代码(C 类)。改它要谨慎:只改 stats 这个方法的查询表,别动 controller 其他部分
- 改完确认控制台首页不再报 500,卡片数字正确(用真实采集数据核对)
- 控制台那几个老卡片(用户总数/在线设备等)如果对 chatsift 意义不大,本周不强求重做,只要不报错即可;新的经营指标在”运营分析”页体现

-----

## 5. 后台:运营分析页

新建运营分析页,挂已有的”运营分析”菜单。沿用 W6/W7 Element Plus 风格。

### 5.1 页面结构

- 顶部:日期范围选择器(默认近 30 天)+ 平台页面筛选
- 漏斗区:咨询→留资→预约 的漏斗图(用 Element Plus 或简单的层级条形,数字 + 转化率)
- 分布区:意图分布(饼/柱)、意向度分布(柱)
- 对比区:平台/页面对比表(各页面 inquiry/lead/appointment + 转化率)
- 趋势区:折线图(会话/留资/预约 按天)

### 5.2 图表实现

admin 现有依赖里如果有图表库(看 package.json,可能有 echarts 或类似)就用现成的;没有就用简单的 Element Plus 进度条/表格表达漏斗和分布,不强求花哨图表。重点是数字准确、能看懂,不是炫酷。

-----

## 6. 验证(W9 结束应看到)

```
1. 造一批测试会话(不同意图、部分留资、部分预约)
2. 运营分析页:
   - 漏斗:咨询 N → 留资 M → 预约 K,转化率正确
   - 意图分布:各类占比正确
   - 意向度分布:high/mid/low 数量正确
   - 平台对比:各 page 数据正确
   - 趋势:按天曲线正确
   - 日期筛选生效
3. 控制台首页:不再报 500,卡片数字正确(dashboard 修复)
4. 重跑 W3/W7/W8 核心路径,确认 analytics 是只读、没影响分析流水线
```

-----

## 7. 风险与注意

第一,**analytics 是只读聚合**,不写业务表,不碰分析流水线。它只是从已有数据算统计,最安全的一类功能。

第二,**dashboard 修复是 C 类**(改 W1 前的老 controller),只改 stats 的查询表,别动别的,改完确认首页不报错。

第三,**留资口径统一**:以 lead 的 contact 字段为准,和 W7 一致,不另造逻辑。

第四,**漏斗不含成交**:成交在线下采集不到,不放。这是 chatsift 能力边界的诚实体现,不要为了”漏斗完整”硬加一个填不准的环节。

第五,**MVP 收尾**:W9 是主线最后一周。完成后 chatsift 从采集→分析→线索→工单→运营报表全链路闭环。后续(如真多租户、跨平台、业务规则租户化)都是 MVP 之后的迭代。