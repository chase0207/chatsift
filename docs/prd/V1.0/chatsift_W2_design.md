# Chatsift W2 设计说明:Analyzer Worker + Intent Engine

> **周次**:W2
> **范围**:分析流水线的骨架 + 意图识别(规则版)
> **关联**:PRD 第 5 章(工作流)、v1-schema.sql(analysis_jobs / conversations / intent_rules)
> **本周不做**:Goal Engine、Completeness Engine、WorkOrder 生成、LLM 真实调用(stub)

---

## 1. 总体设计

W1 已经让 events 落库时同步写入 `analysis_jobs`(status=pending)。W2 要做的是一个进程内的串行 worker,把这些 pending 任务取出来处理。处理的核心动作是给消息所属的 conversation 打上意图标签。

整个流程是这样的:worker 定时轮询 analysis_jobs 表,取一批 pending 任务,逐条处理。每条任务对应一条 message,worker 读取这条 message 所在 conversation 的最近若干条消息作为上下文,送进 Intent Engine 得到意图标签,把标签写回 conversation 表,然后把 job 标记为 done。出错的 job 标记 failed 并记录错误,达到重试上限后不再重试。

为什么用"轮询数据库"而不是"内存事件触发"。因为 W1 的 events controller 和 W2 的 analyzer 可能不在同一个进程生命周期里(服务重启),用数据库做任务队列天然支持崩溃恢复——重启后未完成的 pending 任务还在表里,worker 继续处理。这正是 W1 让 events 落库时写 analysis_jobs 的原因。代价是有轮询延迟(默认 1 秒),但对客服场景完全够用。

为什么串行不并行。MVP 阶段单机资源紧张,串行 worker 内存占用可控、逻辑简单、不会出现并发写同一个 conversation 的竞态。等业务量上来,再换成多 worker + 行锁,改造点集中在取任务的 SQL(加 FOR UPDATE SKIP LOCKED)。

---

## 2. Analyzer Worker 设计

### 2.1 生命周期

worker 在服务端启动时初始化(app.js 里 require 并 start),用 setInterval 驱动。停止时(进程退出)清理定时器。

```
启动:  analyzer.start()  → setInterval(tick, POLL_INTERVAL)
每个 tick:
  1. 如果上一轮还在跑(isProcessing=true),跳过本轮(防重入)
  2. 取一批 pending job(LIMIT BATCH_SIZE,按 created_at 升序)
  3. 逐条处理(串行 await)
  4. 本轮处理完,等下一个 interval
停止:  analyzer.stop()  → clearInterval
```

关键参数(放配置,给默认值):
- POLL_INTERVAL = 1000ms(轮询间隔)
- BATCH_SIZE = 20(每轮最多取多少 job)
- MAX_ATTEMPTS = 3(单 job 最大重试次数)

### 2.2 防重入

worker 必须防止上一轮还没处理完、下一轮又开始的情况(否则同一批 job 被取两次)。用一个模块级布尔 isProcessing 标志:tick 进入时若 isProcessing 为 true 直接 return,否则置 true,处理完(finally)置 false。

### 2.3 取任务的 SQL

```sql
-- 取 pending 且未超重试上限的任务
SELECT id, tenant_id, message_id, conversation_id, attempts
FROM analysis_jobs
WHERE status = 'pending' AND attempts < ?
ORDER BY created_at ASC
LIMIT ?;
```

取出后立即把这批 job 的 status 改为 processing(避免被下一轮重复取,即便防重入失效也多一层保护):

```sql
UPDATE analysis_jobs SET status='processing', updated_at=NOW()
WHERE id IN (?);
```

### 2.4 单条 job 处理流程

```
处理 job(message_id, conversation_id, tenant_id):
  1. 读 message:SELECT content_text, direction FROM messages WHERE id=?
     - 如果 direction='outbound'(客服自己发的),不需要分析意图,
       直接标 done(意图分析只针对用户消息)
  2. 读上下文:取该 conversation 最近 N 条 inbound 消息的 content_text
     (N=5,给意图引擎更多上下文)
  3. 调 IntentEngine.classify(tenant_id, contextMessages) → { label, confidence, source }
  4. 回写 conversation:
     UPDATE conversations
     SET intent_label=?, intent_confidence=?, intent_source=?,
         analyzed_at=NOW()
     WHERE id=?
  5. 标记 message.analyzed_at = NOW()
  6. 标记 job status='done'
  出错:
    - attempts+1,status 回到 'pending'(下轮重试)
    - 若 attempts 已达 MAX_ATTEMPTS,status='failed',记 last_error
```

### 2.5 错误处理原则

单条 job 失败不能影响同批其他 job(每条 job 包在独立 try/catch 里)。worker 整体异常(比如数据库断连)要捕获,记日志,等下一轮重试,不能让 setInterval 回调抛出未捕获异常导致进程崩溃。

### 2.6 与 W3+ 的衔接

W2 的 worker 里,意图分类后就直接标 done。W3 会在第 3 步之后插入 Goal Engine、Completeness Engine、WorkOrder Engine。所以 worker 的单条处理流程要预留扩展点——把"分析"抽象成一个 pipeline,W2 只有 IntentEngine 一个 stage,W3 往 pipeline 数组里追加 stage 即可,不改 worker 主循环。

建议结构:

```javascript
const pipeline = [
  intentStage,        // W2
  // goalStage,       // W3
  // completenessStage, // W3
  // workorderStage,  // W3
];
async function processJob(job) {
  const ctx = await buildContext(job);  // 读 message + 上下文
  if (ctx.skip) return markDone(job);   // outbound 跳过
  for (const stage of pipeline) {
    await stage(ctx);                    // 每个 stage 往 ctx 写结果
  }
  await persist(ctx);                    // 统一回写 conversation
  await markDone(job);
}
```

这样 W3 加引擎是"往 pipeline push",不动主循环。

---

## 3. Intent Engine 设计(规则版)

### 3.1 职责

输入 tenant_id 和一组上下文消息文本,输出意图标签 + 置信度 + 来源。W2 只实现规则匹配,LLM 兜底留 stub(返回默认 simple_inquiry)。

```javascript
IntentEngine.classify(tenantId, messages) 
  → { label, confidence, source }
```

label 取值:simple_inquiry / appointment / complaint / price_inquiry
source 取值:rule / llm / default

### 3.2 规则匹配逻辑

```
classify(tenantId, messages):
  text = messages 拼接成一段(最近的消息权重更高,但 W2 先简单拼接)
  1. 读规则:全局规则(tenant_id=0)+ 本企业规则(tenant_id=X),
     按 priority 升序(数字小的先匹配)
     SELECT * FROM intent_rules
     WHERE tenant_id IN (0, ?) AND enabled=1
     ORDER BY priority ASC
  2. 逐条规则匹配:
     - rule_type='keyword':pattern 按 | 分割成关键词数组,
       text 命中任一关键词即匹配
     - rule_type='regex':用 pattern 做正则匹配
  3. 第一条命中的规则,返回其 intent_label,source='rule',confidence=0.9
  4. 全部规则未命中 → 进入 LLM 兜底(W2 stub)
```

种子规则的优先级设计(已在 v1-schema.sql 里):投诉 priority=10(最先匹配,风险最高),问价 priority=20,预约 priority=30。这个顺序意味着:如果一句话既包含"投诉"又包含"价格",优先判为投诉。这是有意的——投诉风险高,宁可误判为投诉也不能漏。

### 3.3 LLM 兜底(W2 stub)

```javascript
async function llmFallback(tenantId, text) {
  // W2: stub,直接返回默认
  return { label: 'simple_inquiry', confidence: 0.5, source: 'default' };
  // W3/W8 真实实现:
  //   1. 查 tenant_llm_config,检查配额
  //   2. 配额耗尽 → 返回 { label:'simple_inquiry', source:'default' } + 标记需提示
  //   3. 配额可用 → 调 LLM,解析返回的 label,扣减 token
}
```

W2 把这个函数写出来但只返回 stub,W8 再填真实 LLM 调用。这样接口稳定,后续只改函数体。

### 3.4 置信度约定

规则命中 confidence=0.9(规则是确定性的,给高分但不到 1.0)。LLM 兜底的 confidence 由 LLM 返回(W8)。default 兜底 confidence=0.5。这个分数后续可用于后台筛选"低置信度需人工复核"的会话。

---

## 4. 数据流验证(W2 结束时应该能看到)

```
1. POST /api/v1/events/batch 上报一条 "我要投诉退款" 的消息
   → messages 表插入,analysis_jobs 插入 pending

2. 1 秒内,analyzer tick 取到这条 job
   → IntentEngine 规则匹配,命中 complaint(priority=10)
   → conversations.intent_label = 'complaint', intent_source='rule', confidence=0.9
   → message.analyzed_at 填上
   → job status='done'

3. GET /api/v1/conversations
   → 这条会话的 intent_label 显示 complaint
```

上报"多少钱"→ price_inquiry;上报"我想预约这周末"→ appointment;上报"你们在哪"→ 规则未命中 → default simple_inquiry。

---

## 5. 配置项汇总

新增到 server 配置(环境变量或 config 文件):

```
ANALYZER_ENABLED=true          # 总开关,关掉则不启动 worker
ANALYZER_POLL_INTERVAL=1000    # 轮询间隔 ms
ANALYZER_BATCH_SIZE=20         # 每轮取任务数
ANALYZER_MAX_ATTEMPTS=3        # 单任务最大重试
INTENT_CONTEXT_SIZE=5          # 意图分析读取最近几条 inbound 消息
```

---

## 6. 风险与注意

第一,worker 启动时机。analyzer 应该在数据库连接池就绪后启动,不要在 app.js 顶层同步启动(那时 db 可能还没连上)。建议在 server 监听端口成功的回调里启动。

第二,优雅停止。进程收到 SIGTERM/SIGINT 时,先 clearInterval 停止取新任务,等当前 tick 处理完再退出。避免 processing 状态的 job 卡死(其实下次启动会因为 attempts 未变而被重新取,但优雅停止更干净)。

第三,processing 僵尸任务。如果一个 job 被标 processing 后进程崩溃,它会永远停在 processing。需要一个兜底:worker 启动时,把所有 status='processing' 的 job 重置为 pending(因为单进程串行,启动时不可能有真正在处理的 job)。这一句重置 SQL 放在 analyzer.start() 开头。

第四,意图只认 inbound。outbound(客服自己发的)消息不做意图分类,直接标 done。这一点在 2.4 第 1 步已经处理。
