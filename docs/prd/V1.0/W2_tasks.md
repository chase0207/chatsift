# Chatsift W2 实施任务清单(给 Claude Code)

> **周次**:W2
> **目标**:分析流水线骨架跑通——消息上报后,会话意图被自动识别
> **验收标准**:上报"我要投诉"→ 1 秒内 conversation.intent_label 自动变成 complaint
> **关联文档**:W2_design.md(设计说明,先读)、PRD_v1.0.0.md 第 5 章、v1-schema.sql
> **本周不做**:Goal/Completeness/WorkOrder 引擎、LLM 真实调用(stub)、后台页面、插件

---

## 前置:阅读设计文档

开工前先通读 `W2_design.md`,理解三件事:analyzer worker 的轮询+串行+防重入模型、pipeline 可扩展结构(W3 要往里加引擎)、intent-engine 的规则匹配逻辑。本清单是 W2_design 的落地步骤。

---

## Task 1 — 放入 W2 设计文档

```bash
cd ~/vscode/chatsift
cp <W2_design.md> docs/architecture/W2_design.md
git add docs/architecture/W2_design.md
git commit -m "docs(W2): add analyzer + intent engine design"
```

---

## Task 2 — 写 Intent Engine(规则版)

新建 `server/src/v1/intent-engine.js`。

实现 `classify(tenantId, messages)`,返回 `{ label, confidence, source }`。

逻辑(详见 W2_design 第 3 节):

```
1. messages 是字符串数组(最近 N 条 inbound 消息文本),拼成一段 text
2. 查规则:SELECT * FROM intent_rules
   WHERE tenant_id IN (0, ?) AND enabled=1 ORDER BY priority ASC
3. 逐条匹配:
   - keyword 类型:pattern.split('|') 得到关键词,text 含任一即命中
   - regex 类型:new RegExp(pattern).test(text)
4. 第一条命中 → { label: rule.intent_label, confidence: 0.9, source: 'rule' }
5. 未命中 → 调 llmFallback() → W2 返回 { label:'simple_inquiry', confidence:0.5, source:'default' }
```

同文件内写 `llmFallback(tenantId, text)` stub:

```javascript
async function llmFallback(tenantId, text) {
  // TODO W8: 真实 LLM 调用 + 配额管理
  return { label: 'simple_inquiry', confidence: 0.5, source: 'default' };
}
```

导出 classify。注意所有 SQL 用现有 db 连接池,带 tenant_id 参数。

---

## Task 3 — 写 Analyzer Worker

新建 `server/src/v1/analyzer.js`。

实现 W2_design 第 2 节描述的 worker。核心结构:

```javascript
const db = require('../config/db');
const intentEngine = require('./intent-engine');

let timer = null;
let isProcessing = false;

const POLL_INTERVAL  = parseInt(process.env.ANALYZER_POLL_INTERVAL) || 1000;
const BATCH_SIZE     = parseInt(process.env.ANALYZER_BATCH_SIZE) || 20;
const MAX_ATTEMPTS   = parseInt(process.env.ANALYZER_MAX_ATTEMPTS) || 3;
const CONTEXT_SIZE   = parseInt(process.env.INTENT_CONTEXT_SIZE) || 5;

// pipeline:W2 只有 intent 一个 stage,W3 往这里加
const pipeline = [intentStage];

async function intentStage(ctx) {
  const result = await intentEngine.classify(ctx.tenantId, ctx.contextTexts);
  ctx.intent = result;
}

async function buildContext(job) { /* 读 message + 最近 N 条 inbound */ }
async function persist(ctx)      { /* 回写 conversation intent_* 字段 */ }
async function processJob(job)   { /* buildContext → pipeline → persist → markDone */ }
async function tick()            { /* 防重入 → 取批 → 逐条 processJob */ }

function start() {
  // 1. 重置僵尸:UPDATE analysis_jobs SET status='pending' WHERE status='processing'
  // 2. timer = setInterval(tick, POLL_INTERVAL)
}
function stop() { if (timer) clearInterval(timer); }

module.exports = { start, stop };
```

实现要点(逐条对照 W2_design):

- **防重入**:tick 开头 `if (isProcessing) return;`,try 里置 true,finally 置 false
- **取任务**:SELECT pending + attempts<MAX,LIMIT BATCH,然后立即 UPDATE 这批为 processing
- **outbound 跳过**:buildContext 读到 message.direction='outbound' 时 ctx.skip=true,processJob 直接 markDone
- **上下文**:取该 conversation 最近 CONTEXT_SIZE 条 inbound 消息的 content_text 数组
- **回写**:persist 把 ctx.intent 写到 conversations 表,同时 message.analyzed_at=NOW()
- **单 job 独立 try/catch**:失败 attempts+1 回 pending,达上限标 failed + last_error
- **僵尸重置**:start() 开头先把 processing 重置为 pending

---

## Task 4 — 在 app.js 启动 worker

修改 `server/src/app.js`,在端口监听成功的回调里启动 analyzer:

```javascript
const analyzer = require('./v1/analyzer');

const server = app.listen(PORT, () => {
  console.log(`chatsift server on :${PORT}`);
  if (process.env.ANALYZER_ENABLED !== 'false') {
    analyzer.start();
    console.log('analyzer worker started');
  }
});

// 优雅停止
function shutdown() {
  analyzer.stop();
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

注意:必须在 listen 回调里启动(db 已就绪),不要在文件顶层启动。

---

## Task 5 — 补 .env.example

在 `server/.env.example` 追加:

```
ANALYZER_ENABLED=true
ANALYZER_POLL_INTERVAL=1000
ANALYZER_BATCH_SIZE=20
ANALYZER_MAX_ATTEMPTS=3
INTENT_CONTEXT_SIZE=5
```

---

## Task 6 — 启动与验收

### 6.1 启动

```bash
cd server
npm run dev
# 期望日志:chatsift server on :3100 / analyzer worker started
```

注意:W1 遗留的那条 test_msg_1(pending job)会在 analyzer 启动后立刻被处理掉,这是预期的。

### 6.2 验收 checklist

```bash
TOKEN=<从 auth/login 拿>

# 1. 上报投诉消息
curl -X POST http://127.0.0.1:3100/api/v1/events/batch \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"events":[{"platform":"douyin","platform_page":"laike-message","conversation_id":"w2_complaint","message_id":"w2_msg_complaint","direction":"inbound","sender_nickname":"测试","content_type":"text","content_text":"我要投诉,要求退款","occurred_at":"2026-05-30T11:00:00+08:00"}]}'

# 2. 等 2 秒,查会话意图
sleep 2
curl -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:3100/api/v1/conversations?keyword=投诉"
# 期望:intent_label=complaint, intent_source=rule, intent_confidence=0.9

# 3. 上报问价消息
curl -X POST http://127.0.0.1:3100/api/v1/events/batch \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"events":[{"platform":"douyin","platform_page":"laike-message","conversation_id":"w2_price","message_id":"w2_msg_price","direction":"inbound","content_type":"text","content_text":"这个课程多少钱","occurred_at":"2026-05-30T11:01:00+08:00"}]}'
sleep 2
# 期望 intent_label=price_inquiry

# 4. 上报预约消息 "我想预约这周末"
# 期望 intent_label=appointment

# 5. 上报无关消息 "你们在哪里"
# 期望 intent_label=simple_inquiry, source=default(规则未命中,走 stub 兜底)

# 6. 上报 outbound 消息,验证不分析
curl -X POST http://127.0.0.1:3100/api/v1/events/batch \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"events":[{"platform":"douyin","conversation_id":"w2_out","message_id":"w2_msg_out","direction":"outbound","content_type":"text","content_text":"您好","occurred_at":"2026-05-30T11:02:00+08:00"}]}'
sleep 2
mysql -h127.0.0.1 -uroot -p chatsift -e \
  "SELECT id,status FROM analysis_jobs WHERE message_id IN (SELECT id FROM messages WHERE platform_message_id='w2_msg_out');"
# 期望:job status=done(直接跳过分析)

# 7. 检查 analysis_jobs 全部处理完
mysql -h127.0.0.1 -uroot -p chatsift -e \
  "SELECT status, COUNT(*) FROM analysis_jobs GROUP BY status;"
# 期望:done 若干,无 pending 堆积,无 failed
```

### 6.3 提交

```bash
git add server/
git commit -m "feat(W2): analyzer worker + rule-based intent engine

- analyzer.js: polling串行worker, 防重入, 僵尸重置, pipeline可扩展
- intent-engine.js: 规则匹配(keyword/regex) + LLM兜底stub
- app.js: listen回调启动worker + 优雅停止
- 验收: 投诉/问价/预约规则命中, outbound跳过, 无pending堆积"
git log --oneline
```

---

## W2 完成标准(给我的验收报告)

1. 6.2 验收 checklist 第 2/3/4/5 项的 curl 输出(四类意图都对)
2. 第 6 项 outbound job 状态(done)
3. 第 7 项 analysis_jobs 状态分布(无 pending 堆积)
4. analyzer 启动日志
5. `git log --oneline`
6. 任何偏离记录

---

## 重要提示

- **pipeline 结构必须按 W2_design 第 2.6 节**,W3 要往 pipeline 数组加引擎,不能让 W2 把 intent 逻辑写死在主循环里
- **僵尸重置**(start 开头 processing→pending)别漏,否则崩溃过的 job 永久卡死
- **outbound 不分析**,直接 done
- **单 job 独立 try/catch**,一条失败不影响整批
- **worker 在 listen 回调里启动**,不要顶层启动
- 规则种子已在库里(投诉10/问价20/预约30),不用再插
- 遇到 conversation 上下文读取的 SQL 拿不准,先停下问我
