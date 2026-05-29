const db = require('../config/db')

async function classify(tenantId, messages) {
  const text = (messages || []).filter(Boolean).join('\n')
  if (!text.trim()) return llmFallback(tenantId, text)

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
  return { label: 'simple_inquiry', confidence: 0.5, source: 'default' }
}

module.exports = { classify, llmFallback }
