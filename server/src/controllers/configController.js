const pool = require('../config/db')
const { applyDataScope } = require('../utils/data-scope')

function parseKeywordRulesText(text) {
  if (!text || !String(text).trim()) return []
  return String(text).split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('#'))
    .map((line, idx) => {
      const hashIdx = line.indexOf('#')
      return {
        keywords: line.slice(0, hashIdx).trim(),
        replies: line.slice(hashIdx + 1).trim(),
        sort_order: idx * 10,
      }
    })
    .filter((r) => r.keywords && r.replies)
}

async function loadKeywordRulesText(pluginId) {
  const [rows] = await pool.query(
    `SELECT keywords, replies
     FROM keyword_replies
     WHERE plugin_id = ? AND enabled = 1
     ORDER BY sort_order ASC, id ASC`,
    [pluginId]
  ).catch(() => [[]])

  return rows
    .map((row) => `${String(row.keywords || '').trim()}#${String(row.replies || '').trim()}`)
    .filter((line) => line !== '#')
    .join('\n')
}

async function saveKeywordRulesText(pluginId, keywordsText) {
  const rules = parseKeywordRulesText(keywordsText || '')
  await pool.query('DELETE FROM keyword_replies WHERE plugin_id = ?', [pluginId])
  if (!rules.length) return
  const values = rules.map((r) => [pluginId, r.keywords, r.replies, 1, r.sort_order])
  await pool.query(
    'INSERT INTO keyword_replies (plugin_id, keywords, replies, enabled, sort_order) VALUES ?',
    [values]
  )
}

async function ensurePluginAccess(req, pluginId) {
  const scope = applyDataScope(req, { ownerColumn: 'user_id', alias: 'p' })
  const [[plugin]] = await pool.query(
    `SELECT p.id FROM plugins p WHERE p.id = ?${scope.sql} LIMIT 1`,
    [pluginId, ...scope.params]
  )
  return plugin
}

// GET /api/configs/:pluginId/:platform
async function getConfig(req, res) {
  const { pluginId, platform } = req.params
  try {
    const plugin = await ensurePluginAccess(req, pluginId)
    if (!plugin) return res.status(404).json({ code: 404, message: '记录不存在或无权限' })
    const [rows] = await pool.query(
      'SELECT id, plugin_id, platform, config_json, updated_at FROM configs WHERE plugin_id = ? AND platform = ? LIMIT 1',
      [pluginId, platform]
    )
    const keywordRulesText = await loadKeywordRulesText(pluginId)
    if (!rows.length) {
      return res.json({ code: 0, data: { plugin_id: Number(pluginId), platform, config_json: { keywords: keywordRulesText } } })
    }
    const row = rows[0]
    try { row.config_json = JSON.parse(row.config_json) } catch {}
    if (!row.config_json || typeof row.config_json !== 'object') row.config_json = {}
    row.config_json.keywords = keywordRulesText
    res.json({ code: 0, data: row })
  } catch (err) {
    console.error('[config.get]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// PUT /api/configs/:pluginId/:platform
async function saveConfig(req, res) {
  const { pluginId, platform } = req.params
  const { config_json } = req.body
  if (config_json === undefined) {
    return res.status(400).json({ code: 400, message: 'config_json 不能为空' })
  }
  try {
    const plugin = await ensurePluginAccess(req, pluginId)
    if (!plugin) return res.status(404).json({ code: 404, message: '记录不存在或无权限' })
    const cfgObj = typeof config_json === 'string' ? JSON.parse(config_json) : config_json
    const keywordsText = cfgObj.keywords
    const cfgToStore = { ...cfgObj }
    delete cfgToStore.keywords

    const [existing] = await pool.query(
      'SELECT config_json FROM configs WHERE plugin_id = ? AND platform = ? LIMIT 1',
      [pluginId, platform]
    )
    let merged = {}
    if (existing.length) {
      try { merged = JSON.parse(existing[0].config_json) || {} } catch {}
    }
    Object.assign(merged, cfgToStore)
    const jsonStr = JSON.stringify(merged)

    await pool.query(
      `INSERT INTO configs (plugin_id, platform, config_json)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE config_json = VALUES(config_json), updated_at = NOW()`,
      [pluginId, platform, jsonStr]
    )
    if (keywordsText !== undefined) await saveKeywordRulesText(pluginId, keywordsText)
    res.json({ code: 0, message: '保存成功' })
  } catch (err) {
    console.error('[config.save]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

module.exports = { getConfig, saveConfig }
