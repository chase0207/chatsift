const db = require('../config/db')
const intentEngine = require('./intent-engine')
const completenessEngine = require('./completeness-engine')
const goalEngine = require('./goal-engine')
const workorderEngine = require('./workorder-engine')
const leadEngine = require('./lead-engine')

let timer = null
let isProcessing = false
let stopping = false

const POLL_INTERVAL = parseInt(process.env.ANALYZER_POLL_INTERVAL, 10) || 1000
const BATCH_SIZE = parseInt(process.env.ANALYZER_BATCH_SIZE, 10) || 20
const MAX_ATTEMPTS = parseInt(process.env.ANALYZER_MAX_ATTEMPTS, 10) || 3
const CONTEXT_SIZE = parseInt(process.env.INTENT_CONTEXT_SIZE, 10) || 20

const pipeline = [
  intentStage,
  completenessStage,
  goalStage,
  workorderStage,
  leadStage,
]

async function intentStage(ctx) {
  ctx.intent = await intentEngine.classify(ctx.tenantId, ctx.contextTexts)
}

async function completenessStage(ctx) {
  ctx.completeness = await completenessEngine.evaluate(
    ctx.tenantId,
    ctx.intent.label,
    ctx.completenessMessages
  )
}

async function goalStage(ctx) {
  ctx.goal = await goalEngine.judge(ctx.intent.label, ctx.completeness)
}

async function workorderStage(ctx) {
  ctx.workorder = await workorderEngine.generate(ctx)
}

async function leadStage(ctx) {
  ctx.lead = await leadEngine.upsert(ctx)
}

async function buildContext(job) {
  const [messages] = await db.query(
    `SELECT id, tenant_id, conversation_id, direction, sender_nickname, content_text
     FROM messages
     WHERE id = ? AND tenant_id = ? AND conversation_id = ?
     LIMIT 1`,
    [job.message_id, job.tenant_id, job.conversation_id]
  )
  if (!messages.length) {
    return { job, skip: true, missingMessage: true }
  }

  const message = messages[0]
  if (message.direction === 'outbound') {
    return {
      job,
      tenantId: job.tenant_id,
      conversationId: job.conversation_id,
      message,
      contextTexts: [],
      skip: true,
    }
  }

  const [contextRows] = await db.query(
    `SELECT id, direction, sender_nickname, content_type, content_text, content_url,
            DATE_FORMAT(occurred_at, '%Y-%m-%d %H:%i:%s') AS occurred_at
     FROM messages
     WHERE tenant_id = ? AND conversation_id = ? AND direction = 'inbound' AND content_text IS NOT NULL
     ORDER BY occurred_at DESC, id DESC
     LIMIT ?`,
    [job.tenant_id, job.conversation_id, CONTEXT_SIZE]
  )
  const contextMessages = contextRows.reverse()

  const [completenessRows] = await db.query(
    `SELECT id, direction, sender_nickname, content_type, content_text, content_url,
            DATE_FORMAT(occurred_at, '%Y-%m-%d %H:%i:%s') AS occurred_at
     FROM messages
     WHERE tenant_id = ? AND conversation_id = ? AND direction = 'inbound' AND content_text IS NOT NULL
     ORDER BY occurred_at ASC, id ASC
     LIMIT 500`,
    [job.tenant_id, job.conversation_id]
  )

  const [conversations] = await db.query(
    `SELECT id, tenant_id, platform, platform_page, platform_conversation_id,
            customer_nickname, customer_platform_uid, current_stage, completeness_score
     FROM conversations
     WHERE id = ? AND tenant_id = ?
     LIMIT 1`,
    [job.conversation_id, job.tenant_id]
  )

  return {
    job,
    tenantId: job.tenant_id,
    conversationId: job.conversation_id,
    message,
    conversation: conversations[0] || {},
    contextMessages,
    completenessMessages: completenessRows,
    contextTexts: contextMessages.map((row) => row.content_text).filter(Boolean),
    skip: false,
  }
}

async function persist(ctx) {
  if (!ctx.intent) return
  await db.query(
    `UPDATE conversations
     SET intent_label = ?,
         intent_confidence = ?,
         intent_source = ?,
         current_stage = ?,
         completeness_score = ?,
         field_validity = ?,
         analyzed_at = NOW()
     WHERE id = ? AND tenant_id = ?`,
    [
      ctx.intent.label,
      ctx.intent.confidence,
      ctx.intent.source,
      ctx.goal ? ctx.goal.stage : 'new',
      ctx.completeness ? ctx.completeness.score : 0,
      ctx.completeness ? JSON.stringify(ctx.completeness.field_validity || {}) : null,
      ctx.conversationId,
      ctx.tenantId,
    ]
  )
  await db.query(
    'UPDATE messages SET analyzed_at = NOW() WHERE id = ? AND tenant_id = ?',
    [ctx.message.id, ctx.tenantId]
  )
}

async function processJob(job) {
  try {
    const ctx = await buildContext(job)
    if (ctx.skip) {
      if (ctx.message) {
        await db.query(
          'UPDATE messages SET analyzed_at = NOW() WHERE id = ? AND tenant_id = ?',
          [ctx.message.id, ctx.tenantId]
        )
      }
      await markDone(job)
      return
    }

    for (const stage of pipeline) {
      await stage(ctx)
    }

    await persist(ctx)
    await markDone(job)
  } catch (err) {
    console.error('[analyzer.processJob]', { jobId: job.id, error: err.message })
    await markFailedOrRetry(job, err)
  }
}

async function tick() {
  if (isProcessing || stopping) return
  isProcessing = true
  try {
    const jobs = await takeJobs()
    for (const job of jobs) {
      await processJob(job)
    }
  } catch (err) {
    console.error('[analyzer.tick]', err)
  } finally {
    isProcessing = false
  }
}

async function takeJobs() {
  const [jobs] = await db.query(
    `SELECT id, tenant_id, message_id, conversation_id, attempts
     FROM analysis_jobs
     WHERE status = 'pending' AND attempts < ?
     ORDER BY created_at ASC, id ASC
     LIMIT ?`,
    [MAX_ATTEMPTS, BATCH_SIZE]
  )
  if (!jobs.length) return []

  await db.query(
    `UPDATE analysis_jobs
     SET status = 'processing', updated_at = NOW()
     WHERE id IN (${jobs.map(() => '?').join(',')})`,
    jobs.map((job) => job.id)
  )

  return jobs
}

async function markDone(job) {
  await db.query(
    `UPDATE analysis_jobs
     SET status = 'done', updated_at = NOW(), last_error = NULL
     WHERE id = ?`,
    [job.id]
  )
}

async function markFailedOrRetry(job, err) {
  const attempts = (job.attempts || 0) + 1
  const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'pending'
  await db.query(
    `UPDATE analysis_jobs
     SET status = ?, attempts = ?, last_error = ?, updated_at = NOW()
     WHERE id = ?`,
    [status, attempts, String(err.message || err).slice(0, 512), job.id]
  )
}

async function resetProcessingJobs() {
  await db.query(
    `UPDATE analysis_jobs
     SET status = 'pending', updated_at = NOW()
     WHERE status = 'processing'`
  )
}

async function start() {
  if (timer) return
  stopping = false
  await resetProcessingJobs()
  timer = setInterval(tick, POLL_INTERVAL)
  tick()
}

async function stop() {
  stopping = true
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  while (isProcessing) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

module.exports = {
  start,
  stop,
  tick,
  pipeline,
}
