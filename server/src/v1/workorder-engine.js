const db = require('../config/db')

async function generate(ctx) {
  const spec = specForIntent(ctx.intent.label)
  const payload = await buildPayload(ctx, spec.type)
  const suggestion = await buildSuggestion(ctx, spec.type, payload)
  const title = `${spec.title}:${ctx.conversation.customer_nickname || ctx.message.sender_nickname || '未知客户'}`
  const missingFields = ctx.completeness ? ctx.completeness.missing : []

  const [existing] = await db.query(
    `SELECT id
     FROM workorders
     WHERE tenant_id = ? AND conversation_id = ? AND workorder_type = ?
       AND status NOT IN ('done', 'cancelled')
     ORDER BY id DESC
     LIMIT 1`,
    [ctx.tenantId, ctx.conversationId, spec.type]
  )

  if (existing.length) {
    await db.query(
      `UPDATE workorders
       SET title = ?,
           payload = ?,
           completeness_score = ?,
           missing_fields = ?,
           suggestion = ?,
           priority = ?
       WHERE id = ? AND tenant_id = ?`,
      [
        title,
        JSON.stringify(payload),
        ctx.completeness ? ctx.completeness.score : 0,
        JSON.stringify(missingFields),
        suggestion,
        spec.priority,
        existing[0].id,
        ctx.tenantId,
      ]
    )
    return { created: false, id: existing[0].id, type: spec.type }
  }

  const [result] = await db.query(
    `INSERT INTO workorders
     (tenant_id, conversation_id, lead_id, workorder_type, title, payload,
      completeness_score, missing_fields, suggestion, priority, sla_due_at, status)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR), 'pending')`,
    [
      ctx.tenantId,
      ctx.conversationId,
      spec.type,
      title,
      JSON.stringify(payload),
      ctx.completeness ? ctx.completeness.score : 0,
      JSON.stringify(missingFields),
      suggestion,
      spec.priority,
      spec.slaHours,
    ]
  )

  return { created: true, id: result.insertId, type: spec.type }
}

function specForIntent(intent) {
  const specs = {
    simple_inquiry: {
      type: 'inquiry',
      title: '线索跟进',
      priority: 5,
      slaHours: Number(process.env.SLA_INQUIRY_HOURS || 24),
    },
    appointment: {
      type: 'appointment',
      title: '预约确认',
      priority: 3,
      slaHours: Number(process.env.SLA_APPOINTMENT_HOURS || 4),
    },
    complaint: {
      type: 'complaint',
      title: '投诉处理',
      priority: 1,
      slaHours: Number(process.env.SLA_COMPLAINT_HOURS || 1),
    },
    price_inquiry: {
      type: 'pricing',
      title: '报价回复',
      priority: 4,
      slaHours: Number(process.env.SLA_PRICING_HOURS || 2),
    },
  }
  return specs[intent] || specs.simple_inquiry
}

async function buildPayload(ctx, type) {
  if (type === 'appointment') return { ...ctx.completeness.fields }

  if (type === 'pricing') {
    const fields = { ...ctx.completeness.fields }
    if (fields.city && fields.car_type) {
      const quote = await findQuote(ctx.tenantId, fields)
      if (quote) fields.quote = quote
    }
    return fields
  }

  if (type === 'complaint') {
    return {
      complaint_summary: ctx.message.content_text || '',
      risk_level: 'high',
    }
  }

  return {
    intent_summary: ctx.message.content_text || '',
  }
}

async function buildSuggestion(ctx, type, payload) {
  if (type !== 'pricing') return null
  if (!payload.city || !payload.car_type) return '缺少城市或车型,需人工报价'
  if (payload.quote) return `建议报价:${payload.quote.price}元`
  return '价格表无匹配,需人工报价'
}

async function findQuote(tenantId, fields) {
  const params = [tenantId, fields.city, `%${fields.car_type}%`, `%${fields.car_type}%`]

  const [rows] = await db.query(
    `SELECT id, city, product_name, hours, price, original_price, notes
     FROM price_table
     WHERE tenant_id = ? AND city = ? AND enabled = 1
       AND (product_name LIKE ? OR notes LIKE ?)
     ORDER BY id DESC
     LIMIT 1`,
    params
  )
  return rows[0] || null
}

module.exports = { generate }
