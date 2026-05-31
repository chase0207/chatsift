# W12 验收报告 — 准实时时序 + 后台主动提醒

日期: 2026-05-31

## 开工现状测量

四段链路现状:

| 段 | 开工现状 | 处理 |
|---|---:|---|
| ① 采集节流 | `legacy-collector` MutationObserver debounce 约 0.8 秒 | 收紧到 W12 目标 10 秒 |
| ② 上报 flush | `EventUploader` 5 秒定时 tick,未按攒满条数立即触发 | 改为 15 秒定时 + 队列满 10 条立即触发 |
| ③ 分析队列 | analyzer 1 秒 poll,本机实测 1-3 秒,无 pending 积压 | 不改 analyzer,避免过度设计 |
| ④ 后台提醒 | 无主动提醒,客服不刷新就看不到新线索 | 新增 `/leads/recent` + admin 30 秒轮询红点 |

分析队列状态:

```json
{
  "analysis_jobs": [
    { "status": "done", "count": 54 }
  ],
  "recent_analyze_seconds": [1, 2, 2, 2, 1, 2, 1, 3, 3, 2]
}
```

结论:当前没有积压,不加 analyzer 优先级。

## 实施范围

### 后台提醒

- 新增 `GET /api/v1/leads/recent?since=<ISO>&min_level=high`。
- 返回 `since` 之后、`status='new'` 且值得提醒的线索:
  - `lead_level=high`
  - 或完整有效预约
  - 或投诉类
- 普通咨询不返回。
- `MainLayout.vue` 每 30 秒轮询一次。
- 顶栏新增红点数字提醒。
- 点击红点进入线索中心,携带 `ids` 精确筛出本次提醒的线索。
- 线索列表支持 `ids=1,2,3` 查询。

### 采集与上报

- `plugin/runtime/legacy-collector.js`
  - `COLLECT_DEBOUNCE_MS = 10000`
  - 只包 MutationObserver 触发节流,不改 adapter、message_id、conversation_id。
- `plugin/runtime/event-uploader.js`
  - `UPLOAD_INTERVAL = 15000`
  - `UPLOAD_FLUSH_SIZE = 10`
- `plugin/runtime/event-queue.js`
  - 增加 `onChange`,队列满 10 条时触发 uploader tick。
- 重新生成 `plugin/content.js`。

### 使用说明

已在 `README.md` 增加插件准实时使用要求:抖音客服页面必须保持前台打开,插件处于启动状态。后台标签页/最小化/休眠会导致 DOM 不刷新,无法准实时采集。

## 验收结果

### 完整预约提醒

用 `/api/v1/events/batch` 写入完整预约:

```text
姓名:王浩然
城市:上海
时间:明天下午4点
联系方式:13800138113
上车位置:普陀区镇坪路666号魔方公寓
车型:轿车
```

`/api/v1/leads/recent` 返回:

```json
{
  "total": 1,
  "matched": {
    "id": 30,
    "customer_nickname": "w12-e2e-b",
    "lead_level": "high",
    "intent_label": "appointment",
    "diagnosis_mainColor": "success",
    "diagnosis": {
      "mainColor": "success",
      "tags": ["联系方式有效", "预约信息完整"]
    }
  }
}
```

接口级端到端计时:

```text
events/batch 写入 -> /leads/recent 可提醒: 2189 ms
```

数据库分析耗时:

```json
{
  "intent_label": "appointment",
  "completeness_score": 100,
  "lead_level": "high",
  "analyze_seconds": 2
}
```

后台轮询间隔为 30 秒,因此页面提示预计在分析完成后的 0-30 秒出现。接口级 2.2 秒 + 轮询最坏 30 秒,满足 1 分钟 SLA。

### 普通咨询不提醒

写入普通咨询:

```text
你好，请问有人在吗
```

查询 `/api/v1/leads/recent?since=<写入前>&min_level=high`:

```json
{
  "total": 0,
  "nicknames": []
}
```

结论:普通咨询不打扰客服。

### 处理后不重复提醒

将 W12 测试 lead `30` 更新为 `following` 后,再次查询 recent:

```json
{
  "total": 0,
  "ids": []
}
```

结论:已处理线索不会重复提醒。

### ids 精确筛选

查询:

```bash
GET /api/v1/leads?ids=29,30&status=new
```

结果:

```json
{
  "total": 1,
  "ids": [29],
  "statuses": ["new"]
}
```

说明:lead 30 已改为 `following`,因此被 `status=new` 排除。红点点击进入线索中心时会用 ids 精确筛选当前提醒集合。

## 回归

执行:

```bash
node -c server/src/controllers/v1/leadsController.js
node -c server/src/routes/v1/leads.js
npm run build:admin
npm run build:plugin
```

结果:

- 后端语法检查通过。
- admin 构建通过;仍有既有 Vite/Rolldown pure annotation 和 chunk size warning。
- plugin 构建通过,重新生成 `plugin/content.js`;仍有既有缺失可选文件 warning。
- W12 未修改 analyzer/completeness/diagnosis 逻辑。

采集实页回归说明:

- 本次改动触碰 W4/W5 插件采集节流和上报 flush。
- 已做构建级和代码路径验证。
- 真实抖音页面“不漏采、不重复、chase 会话仍合并”需要重新加载插件后由 Chase 触发真实消息再复测。

## 当前时序

| 段 | 当前配置/实测 |
|---|---|
| ① 采集节流 | 10 秒 |
| ② 上报 flush | 满 10 条立即 flush,否则 15 秒定时 flush |
| ③ 分析延迟 | 本机实测 1-3 秒,无积压 |
| ④ 后台提醒 | 30 秒轮询 |

端到端估算:

```text
真实页面路径最坏约 10s 采集 + 15s 上报 + 1-3s 分析 + 0-30s 后台轮询
= 约 26-58 秒
```

满足 W12 “1 分钟左右、远低于 5 分钟 SLA”目标。

## Git

```text
e12c94f feat(W12): near-realtime timing + active notification
ab53926 docs(W12): near-realtime timing + notification
9000a61 feat(W11): diagnosis tags + quick review
d2472c9 docs(W11): diagnosis tags + quick review
```
