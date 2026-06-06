const db = require('../config/db')
const rules = require('./business-rules')

async function upsert(ctx) {
  if (!ctx.intent || !ctx.conversationId) return { skipped: true }

  const [rows] = await db.query(
    `SELECT *
     FROM leads
     WHERE tenant_id = ? AND primary_conversation_id = ?
     LIMIT 1`,
    [ctx.tenantId, ctx.conversationId]
  )

  const existing = rows[0] || null
  const profile = buildProfile(ctx, existing)
  const score = calculateScore(ctx, profile)
  const level = score >= 70 ? 'high' : score >= 40 ? 'mid' : 'low'

  if (existing) {
    await db.query(
      `UPDATE leads
       SET customer_nickname = ?,
           customer_name = ?,
           customer_platform_uid = ?,
           customer_phone = ?,
           customer_wechat = ?,
           city = ?,
           intent_label = ?,
           lead_score = ?,
           lead_level = ?
       WHERE tenant_id = ? AND id = ?`,
      [
        profile.customer_nickname,
        profile.customer_name,
        profile.customer_platform_uid,
        profile.customer_phone,
        profile.customer_wechat,
        profile.city,
        ctx.intent.label,
        score,
        level,
        ctx.tenantId,
        existing.id,
      ]
    )
    await linkWorkorders(ctx, existing.id)
    return { created: false, id: existing.id, score, level, status: existing.status }
  }

  const [result] = await db.query(
    `INSERT INTO leads
     (tenant_id, service_account_id, primary_conversation_id, customer_nickname, customer_name,
      customer_platform_uid, customer_phone, customer_wechat, city,
      intent_label, lead_score, lead_level, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
    [
      ctx.tenantId,
      ctx.conversation?.service_account_id || null,
      ctx.conversationId,
      profile.customer_nickname,
      profile.customer_name,
      profile.customer_platform_uid,
      profile.customer_phone,
      profile.customer_wechat,
      profile.city,
      ctx.intent.label,
      score,
      level,
    ]
  )
  await linkWorkorders(ctx, result.insertId)
  return { created: true, id: result.insertId, score, level, status: 'new' }
}

async function linkWorkorders(ctx, leadId) {
  await db.query(
    `UPDATE workorders
     SET lead_id = ?
     WHERE tenant_id = ? AND conversation_id = ? AND lead_id IS NULL`,
    [leadId, ctx.tenantId, ctx.conversationId]
  )
}

function buildProfile(ctx, existing = {}) {
  const fields = ctx.completeness?.fields || {}
  const contact = splitContact(fields.contact)
  const nickname = ctx.conversation?.customer_nickname || ctx.message?.sender_nickname || null
  const platformUid = ctx.conversation?.customer_platform_uid || nickname

  return {
    customer_nickname: existing?.customer_nickname || nickname,
    customer_name: existing?.customer_name || fields.name || null,
    customer_platform_uid: existing?.customer_platform_uid || platformUid || null,
    customer_phone: existing?.customer_phone || contact.phone || null,
    customer_wechat: existing?.customer_wechat || contact.wechat || null,
    city: existing?.city || fields.city || null,
  }
}

function splitContact(contact) {
  if (!contact) return { phone: null, wechat: null }
  if (/^1[3-9]\d{9}$/.test(contact)) return { phone: contact, wechat: null }
  return { phone: null, wechat: contact }
}

function calculateScore(ctx, profile) {
  const scoring = rules.leadScore
  const intent = ctx.intent?.label || 'simple_inquiry'
  const stage = ctx.goal?.stage || ctx.conversation?.current_stage || 'new'
  const base = scoring.intentBase[intent] || 0
  const completeness = Number(ctx.completeness?.score || 0) * scoring.completenessFactor
  const contact = profile.customer_phone || profile.customer_wechat ? scoring.contactBonus : 0
  const stageBonus = scoring.stageBonus[stage] || 0
  return Math.min(100, Math.round(base + completeness + contact + stageBonus))
}

module.exports = { upsert }
