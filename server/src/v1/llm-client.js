const db = require('../config/db')

const DEFAULT_API_BASE = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-chat'
const TIMEOUT_MS = 10000

async function chat(tenantId, { systemPrompt, userPrompt, maxTokens }) {
  try {
    const config = await loadConfig(tenantId)
    if (!config) return { ok: false, text: '', tokensUsed: 0, error: 'no_config' }

    await resetMonthlyQuotaIfNeeded(config)
    if (Number(config.monthly_token_used || 0) >= Number(config.monthly_token_quota || 0)) {
      return { ok: false, text: '', tokensUsed: 0, error: 'quota_exceeded' }
    }

    const result = await callApi(config, { systemPrompt, userPrompt, maxTokens })
    if (!result.ok) return result

    await db.query(
      `UPDATE tenant_llm_config
       SET monthly_token_used = monthly_token_used + ?
       WHERE tenant_id = ?`,
      [result.tokensUsed || 0, tenantId]
    )
    return result
  } catch (err) {
    return { ok: false, text: '', tokensUsed: 0, error: 'api_error' }
  }
}

async function loadConfig(tenantId) {
  const [rows] = await db.query(
    `SELECT tenant_id, api_base, api_key, model_name, monthly_token_quota,
            monthly_token_used, quota_reset_at, enabled
     FROM tenant_llm_config
     WHERE tenant_id = ? AND enabled = 1
     LIMIT 1`,
    [tenantId]
  )
  const config = rows[0]
  if (!config || !config.api_key) return null
  return {
    ...config,
    api_base: config.api_base || DEFAULT_API_BASE,
    model_name: config.model_name || DEFAULT_MODEL,
  }
}

async function resetMonthlyQuotaIfNeeded(config) {
  const now = new Date()
  const resetAt = config.quota_reset_at ? new Date(config.quota_reset_at) : null
  const needsReset = !resetAt ||
    resetAt.getFullYear() !== now.getFullYear() ||
    resetAt.getMonth() !== now.getMonth()

  if (!needsReset) return
  await db.query(
    `UPDATE tenant_llm_config
     SET monthly_token_used = 0, quota_reset_at = CURDATE()
     WHERE tenant_id = ?`,
    [config.tenant_id]
  )
  config.monthly_token_used = 0
}

async function callApi(config, { systemPrompt, userPrompt, maxTokens }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(`${trimSlash(config.api_base)}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model_name,
        messages: [
          { role: 'system', content: systemPrompt || '' },
          { role: 'user', content: userPrompt || '' },
        ],
        max_tokens: maxTokens || 200,
        temperature: 0,
      }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!response.ok) return { ok: false, text: '', tokensUsed: 0, error: 'api_error' }

    const data = await response.json().catch(() => null)
    const text = data?.choices?.[0]?.message?.content || ''
    if (!text) return { ok: false, text: '', tokensUsed: 0, error: 'api_error' }
    return {
      ok: true,
      text,
      tokensUsed: Number(data?.usage?.total_tokens || 0),
      error: null,
    }
  } catch (err) {
    clearTimeout(timer)
    return { ok: false, text: '', tokensUsed: 0, error: 'api_error' }
  }
}

function trimSlash(value) {
  return String(value || DEFAULT_API_BASE).replace(/\/+$/, '')
}

module.exports = { chat, DEFAULT_API_BASE, DEFAULT_MODEL }
