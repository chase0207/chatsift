-----

## 文档: W9 实施任务清单 — 运营分析 + 修 dashboard
版本: v1.0.0
周次: W9
状态: Active

## 变更日志

|版本    |日期        |变更摘要|触发来源     |
|------|----------|----|---------|
|v1.0.0|2026-05-31|初版  |Claude 设计|

-----

# W9 实施任务清单(给执行端 cc / codex)

> **目标**:运营分析页(咨询→留资→预约漏斗 + 维度分析)+ 修 dashboard/stats 500
> **验收标准**:漏斗和各维度数字正确;控制台首页不再 500
> **关联**:W9_design.md(先读)、W7 lead、dashboardController(老表 bug)
> **本周不做**:导出、自定义报表、跨租户
> **MVP 收尾**:本周完成后主线全部跑通

-----

## 前置:阅读设计

读 W9_design.md。重点:漏斗三环定义(咨询→留资→预约,不含成交)、留资口径(以 lead 的 contact 为准)、dashboard 修复只改查询表。

-----

## Task 1 — 放文档

```bash
cd ~/vscode/chatsift
cp <W9_design.md> docs/architecture/W9_design.md
cp <W9_tasks.md>  docs/architecture/W9_tasks.md
git add docs/architecture/W9_*.md
git commit -m "docs(W9): operations analytics + dashboard fix"
```

-----

## Task 2 — 写 analytics 统计接口

`server/src/controllers/` 新增 analyticsController + 路由,实现(详见 W9_design 第3节):

```
GET /api/v1/analytics/funnel?from=&to=&platform_page=
  inquiry = COUNT(conversations)
  lead    = COUNT(conversations 关联 lead 的 contact/phone/wechat 非空)
  appointment = COUNT(intent_label='appointment')
  返回 {inquiry, lead, appointment, leadRate, appointmentRate}

GET /api/v1/analytics/intent-distribution   [{intent_label, count}]
GET /api/v1/analytics/lead-level            [{lead_level, count}]
GET /api/v1/analytics/by-page               [{platform_page, inquiry, lead, appointment}]
GET /api/v1/analytics/trend                 [{date, inquiry, lead, appointment}]
```

铁律:

- 全部 WHERE tenant_id=?(租户隔离)
- 日期范围默认近 30 天
- GROUP BY 聚合,不要 N+1
- 留资 join lead 表,contact 非空算留资(和 W7 一致)
- 这些是只读查询,不写任何业务表

权限点 analytics:view。各接口 node –check 通过。

-----

## Task 3 — 修 dashboard/stats 500

改 `server/src/controllers/dashboardController.js` 的 stats 方法(详见 W9_design 第4节):

- 把查 `message_logs` 的地方改成查 chatsift 真实表:
  - 今日消息数 → 从 `messages` 查(WHERE DATE(uploaded_at)=CURDATE() 或按 occurred_at)
  - 会话/工单/线索数 → conversations/workorders/leads
- 只改 stats 方法的查询表,别动 controller 其他部分(C 类,谨慎)
- 确认控制台首页 GET /api/dashboard/stats 返回 200,卡片数字正确

验证:

```bash
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3100/api/dashboard/stats
# 期望:200,不再是 500 / message_logs doesn't exist
```

-----

## Task 4 — analytics API 封装

`admin/src/api/analytics.js`(参考现有 api 写法):

```javascript
import request from '../utils/request'
export const getFunnel       = (params) => request.get('/v1/analytics/funnel', { params })
export const getIntentDist   = (params) => request.get('/v1/analytics/intent-distribution', { params })
export const getLeadLevel    = (params) => request.get('/v1/analytics/lead-level', { params })
export const getByPage       = (params) => request.get('/v1/analytics/by-page', { params })
export const getTrend        = (params) => request.get('/v1/analytics/trend', { params })
```

-----

## Task 5 — 运营分析页

新建 `admin/src/views/Analytics.vue`,挂”运营分析”菜单。沿用 W6/W7 Element Plus 风格。

- 顶部:日期范围选择器(默认近 30 天)+ 平台页面筛选
- 漏斗:咨询→留资→预约,三层 + 各环数字 + 转化率
- 意图分布、意向度分布:柱状或饼(看有无图表库)
- 平台对比:表格(各 page 的 inquiry/lead/appointment + 转化率)
- 趋势:折线(按天)

图表库:先看 `admin/package.json` 有没有 echarts 之类。有就用;没有就用 Element Plus 的进度条 + 表格表达漏斗和分布,不强求引入新库(引入新库是 A 类,可以做但先确认必要)。重点是数字准、能看懂。

挂路由(如 `/analytics`),对齐 DB 菜单”运营分析”的 path(参考 W6 会话中心怎么对的)。

-----

## Task 6 — 验收

### 6.1 造测试数据

```bash
TOKEN=<login>; BASE=http://127.0.0.1:3100
# 造一批不同意图/留资状态的会话(用 events/batch),例如:
# - 2条 simple_inquiry(不留资)
# - 2条 appointment 留电话(留资+预约)
# - 1条 price_inquiry 留电话(留资)
# - 1条 complaint
# 具体 curl 略,cc 按需造,目标是漏斗/分布有数据可验
```

### 6.2 服务端验收

```bash
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/analytics/funnel"
# 期望:inquiry/lead/appointment 数字符合造的数据,转化率算对

curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/analytics/intent-distribution"
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/analytics/by-page"
curl -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/analytics/trend"
# 期望:各维度数字正确

curl -H "Authorization: Bearer $TOKEN" "$BASE/api/dashboard/stats"
# 期望:200,不再 500
```

### 6.3 后台验收(Chase 配合)

- 运营分析页:漏斗、分布、对比、趋势显示,日期筛选生效
- 控制台首页:不再报 500,卡片数字正确

### 6.4 重跑核心路径

```bash
# 重跑 W3/W7/W8 核心 case,确认 analytics(只读)没影响分析流水线
```

### 6.5 提交

```bash
git add server/ admin/
git commit -m "feat(W9): operations analytics + dashboard fix

- analytics 接口: 咨询→留资→预约漏斗 + 意图/意向度分布 + 平台对比 + 趋势
- 运营分析页 Analytics.vue
- 修 dashboard/stats 500: message_logs → messages/conversations
- MVP 主线完成: 采集→分析→线索→工单→运营报表 全链路"
git log --oneline -10
```

-----

## 完成标准(验收报告)

> 报告写 `docs/reports/W9_acceptance.md`。

- [ ] funnel 接口:咨询→留资→预约三环数字 + 转化率正确(留资以 lead.contact 为准)
- [ ] 意图分布 / 意向度分布 / 平台对比 / 趋势 各接口数字正确
- [ ] dashboard/stats 返回 200(不再 message_logs 500)
- [ ] 运营分析页:漏斗/分布/对比/趋势可见,日期筛选生效
- [ ] 控制台首页不报错,卡片数字正确
- [ ] 重跑 W3/W7/W8:analytics 只读,未影响流水线
- [ ] git log W9 独立
- [ ] A 类调整说明(若有,如引入图表库);B/C 类问题单独成文

-----

## 重要提示

- **漏斗不含成交**:成交在线下采集不到,只到”预约”。不要硬加成交环节(会填不准)
- **留资口径以 lead.contact 为准**,和 W7 一致,不另造逻辑
- **analytics 全部只读聚合**,不写业务表,不碰分析流水线——最安全的功能
- **dashboard 修复是 C 类**:只改 stats 的查询表(message_logs→messages),别动 controller 其他部分
- **租户隔离**:所有 analytics 查询带 WHERE tenant_id=?
- **图表库**:有现成的就用,没有用 Element Plus 进度条/表格,引入新库先确认必要(A 类)
- **新页面沿用 W6/W7 风格**
- **不要改 chat_rpa**(只读参考)