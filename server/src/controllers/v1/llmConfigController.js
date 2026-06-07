const pool = require('../../config/db')
const { ok, fail, tenantId, denyInternal } = require('./_shared')
const { DEFAULT_API_BASE, DEFAULT_MODEL } = require('../../v1/llm-client')

async function get(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT tenant_id, api_base, api_key, model_name, monthly_token_quota,
              monthly_token_used, quota_reset_at, enabled,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
              DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
       FROM tenant_llm_config WHERE tenant_id = ? LIMIT 1`,
      [tenantId(req)]
    )

    const row = rows[0]
    if (!row) {
      return ok(res, {
        api_base: DEFAULT_API_BASE,
        api_key: '',
        model: DEFAULT_MODEL,
        model_name: DEFAULT_MODEL,
        monthly_token_quota: 1000000,
        monthly_token_used: 0,
        quota_reset_at: null,
        enabled: 0,
      })
    }

    ok(res, {
      ...row,
      api_key: maskKey(row.api_key),
      model: row.model_name,
    })
  } catch (err) {
    console.error('[v1.llmConfig.get]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function put(req, res) {
  if (denyInternal(req, res)) return
  const apiBase = req.body.api_base || DEFAULT_API_BASE
  const modelName = req.body.model || req.body.model_name || DEFAULT_MODEL
  const quota = Number(req.body.monthly_token_quota || 1000000)
  const enabled = req.body.enabled ? 1 : 0
  const apiKey = typeof req.body.api_key === 'string' ? req.body.api_key.trim() : null

  if (!apiBase || !modelName || !Number.isFinite(quota) || quota < 0) {
    return fail(res, 400, 1003, '配置参数不合法')
  }

  try {
    const [rows] = await pool.query(
      'SELECT tenant_id, api_key FROM tenant_llm_config WHERE tenant_id = ? LIMIT 1',
      [tenantId(req)]
    )

    if (!rows.length && !apiKey) {
      await pool.query(
        `INSERT INTO tenant_llm_config
         (tenant_id, api_base, api_key, model_name, monthly_token_quota, monthly_token_used, quota_reset_at, enabled)
         VALUES (?, ?, '', ?, ?, 0, CURDATE(), ?)`,
        [tenantId(req), apiBase, modelName, quota, enabled]
      )
      return ok(res)
    }

    if (!rows.length) {
      await pool.query(
        `INSERT INTO tenant_llm_config
         (tenant_id, api_base, api_key, model_name, monthly_token_quota, monthly_token_used, quota_reset_at, enabled)
         VALUES (?, ?, ?, ?, ?, 0, CURDATE(), ?)`,
        [tenantId(req), apiBase, apiKey, modelName, quota, enabled]
      )
      return ok(res)
    }

    const fields = [
      'api_base = ?',
      'model_name = ?',
      'monthly_token_quota = ?',
      'enabled = ?',
    ]
    const values = [apiBase, modelName, quota, enabled]
    if (apiKey) {
      fields.push('api_key = ?')
      values.push(apiKey)
    }

    await pool.query(
      `UPDATE tenant_llm_config SET ${fields.join(', ')} WHERE tenant_id = ?`,
      [...values, tenantId(req)]
    )
    ok(res)
  } catch (err) {
    console.error('[v1.llmConfig.put]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

function maskKey(key) {
  if (!key) return ''
  const suffix = key.slice(-4)
  if (key.startsWith('sk-')) return `sk-****${suffix}`
  return `****${suffix}`
}

module.exports = { get, put, maskKey }
