const db = require('../config/db')
const llmClient = require('./llm-client')

const VALID_INTENTS = ['simple_inquiry', 'appointment', 'complaint', 'price_inquiry']

async function classify(tenantId, messages) {
  const text = (messages || []).filter(Boolean).join('\n')
  if (!text.trim()) return llmFallback(tenantId, text)

  const structuredIntent = classifyStructuredAppointment(text)
  if (structuredIntent) return structuredIntent

  const [rules] = await db.query(
    `SELECT id, tenant_id, intent_label, rule_type, pattern, priority
     FROM intent_rules
     WHERE tenant_id IN (0, ?) AND enabled = 1
     ORDER BY priority ASC, tenant_id DESC, id ASC`,
    [tenantId]
  )

  for (const rule of rules) {
    if (matchesRule(rule, text)) {
      return { label: rule.intent_label, confidence: 0.9, source: 'rule' }
    }
  }

  return llmFallback(tenantId, text)
}

function classifyStructuredAppointment(text) {
  const fields = ['姓名', '手机', '电话', '联系方式', '时间', '用车时间', '预约时间', '车型', '城市', '地点', '上车位置']
  const fieldCount = fields.filter((field) => text.includes(field)).length
  if (fieldCount >= 3) return { label: 'appointment', confidence: 0.92, source: 'rule' }

  if (
    /(想约|预约|约车|下单|留资|留个信息)/.test(text) &&
    /(今天|明天|后天|上午|下午|晚上|\d{1,2}点|\d{1,2}月\d{1,2}[号日])/.test(text)
  ) {
    return { label: 'appointment', confidence: 0.9, source: 'rule' }
  }

  return null
}

function matchesRule(rule, text) {
  if (rule.rule_type === 'regex') return matchesRegex(rule.pattern, text)
  return matchesKeyword(rule.pattern, text)
}

function matchesKeyword(pattern, text) {
  return String(pattern || '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)
    .some((keyword) => text.includes(keyword))
}

function matchesRegex(pattern, text) {
  try {
    return new RegExp(pattern).test(text)
  } catch (err) {
    console.warn('[intent-engine] invalid regex rule:', pattern, err.message)
    return false
  }
}

async function llmFallback(tenantId, text) {
  if (!String(text || '').trim()) {
    return { label: 'simple_inquiry', confidence: 0.5, source: 'default' }
  }

  const result = await llmClient.chat(tenantId, {
    systemPrompt: [
      '你是客服对话意图分类器。',
      '把用户消息分到四类之一,只返回类别英文,不要解释。',
      'simple_inquiry=简单咨询',
      'appointment=预约下单/想约时间/询问是否有空位',
      'complaint=投诉建议/退款/差评',
      'price_inquiry=询问价格/费用/报价',
    ].join('\n'),
    userPrompt: text,
    maxTokens: 20,
  })

  if (!result.ok) {
    return {
      label: 'simple_inquiry',
      confidence: 0.5,
      source: 'default',
      degraded: result.error === 'quota_exceeded',
    }
  }

  return {
    label: parseIntentLabel(result.text),
    confidence: 0.75,
    source: 'llm',
  }
}

function parseIntentLabel(text) {
  const value = String(text || '')
  return VALID_INTENTS.find((label) => value.includes(label)) || 'simple_inquiry'
}

module.exports = { classify, llmFallback, parseIntentLabel, classifyStructuredAppointment }
