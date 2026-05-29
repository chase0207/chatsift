const pool = require('../../config/db')
const { ok, fail, tenantId } = require('./_shared')

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
    if (!rows.length) return ok(res, null)
    const row = rows[0]
    row.api_key = maskKey(row.api_key)
    ok(res, row)
  } catch (err) {
    console.error('[v1.llmConfig.get]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function put(req, res) {
  const { api_base, api_key, model_name, monthly_token_quota = 1000000, enabled = 1 } = req.body
  if (!api_base || !api_key || !model_name) return fail(res, 400, 1003, 'api_base、api_key、model_name 不能为空')
  try {
    await pool.query(
      `INSERT INTO tenant_llm_config
       (tenant_id, api_base, api_key, model_name, monthly_token_quota, enabled)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         api_base = VALUES(api_base),
         api_key = VALUES(api_key),
         model_name = VALUES(model_name),
         monthly_token_quota = VALUES(monthly_token_quota),
         enabled = VALUES(enabled)`,
      [tenantId(req), api_base, api_key, model_name, monthly_token_quota, enabled]
    )
    ok(res)
  } catch (err) {
    console.error('[v1.llmConfig.put]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

function maskKey(key) {
  if (!key) return ''
  if (key.length <= 4) return '****'
  return `${'*'.repeat(Math.max(4, key.length - 4))}${key.slice(-4)}`
}

module.exports = { get, put }
