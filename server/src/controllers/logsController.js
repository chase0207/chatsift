const pool = require('../config/db')
const { applyDataScope } = require('../utils/data-scope')
const { normalizePlatform, resolveUserGrant } = require('./deviceController')

// GET /api/logs/messages
async function messages(req, res) {
  const page      = Math.max(1, parseInt(req.query.page)  || 1)
  const size      = Math.min(100, parseInt(req.query.size) || 20)
  const offset    = (page - 1) * size
  const platform  = req.query.platform  || ''
  const status    = req.query.status    ?? ''
  const source    = req.query.source    || ''
  const startDate = req.query.startDate || ''
  const endDate   = req.query.endDate   || ''

  const scope = applyDataScope(req, { ownerColumn: 'user_id', alias: 'p' })

  const where = []
  const params = []
  if (platform)    { where.push('ml.platform = ?');              params.push(platform) }
  if (status !== '') { where.push('ml.status = ?');              params.push(status) }
  if (source)      { where.push('ml.source = ?');                params.push(source) }
  if (startDate)   { where.push('ml.created_at >= ?');           params.push(startDate) }
  if (endDate)     { where.push('ml.created_at <= ?');           params.push(endDate + ' 23:59:59') }
  if (scope.sql)   { where.push(scope.sql.replace(/^ AND /, '')); params.push(...scope.params) }

  const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : ''

  try {
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM message_logs ml
       LEFT JOIN plugins p ON p.id = ml.plugin_id
       ${whereSQL}`,
      params
    )
    const [rows] = await pool.query(
      `SELECT ml.id, ml.plugin_id, p.plugin_key, ml.platform, ml.user_name,
              ml.question, ml.reply, ml.source, ml.reason, ml.status,
              DATE_FORMAT(ml.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM message_logs ml
       LEFT JOIN plugins p ON p.id = ml.plugin_id
       ${whereSQL}
       ORDER BY ml.id DESC LIMIT ? OFFSET ?`,
      [...params, size, offset]
    )
    res.json({ code: 0, data: { list: rows, total, page, size } })
  } catch (err) {
    console.error('[logs.messages]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// GET /api/logs/transfers
async function transfers(req, res) {
  const page   = Math.max(1, parseInt(req.query.page)  || 1)
  const size   = Math.min(100, parseInt(req.query.size) || 20)
  const offset = (page - 1) * size
  const scope  = applyDataScope(req, { ownerColumn: 'user_id', alias: 'p' })
  const whereSQL = scope.sql ? `WHERE 1=1${scope.sql}` : ''
  try {
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM human_transfer_logs ht
       LEFT JOIN plugins p ON p.id = ht.plugin_id
       ${whereSQL}`,
      scope.params
    )
    const [rows] = await pool.query(
      `SELECT ht.id, ht.plugin_id, p.plugin_key, ht.action, ht.user_name, ht.room_id,
              DATE_FORMAT(ht.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM human_transfer_logs ht
       LEFT JOIN plugins p ON p.id = ht.plugin_id
       ${whereSQL}
       ORDER BY ht.id DESC LIMIT ? OFFSET ?`,
      [...scope.params, size, offset]
    )
    res.json({ code: 0, data: { list: rows, total, page, size } })
  } catch (err) {
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// POST /api/logs/runtime
// 插件运行诊断日志：看门狗、防串话、发送失败、自检失败等。
async function createRuntime(req, res) {
  const platform = normalizePlatform(req.body.platform || 'unknown') || 'unknown'
  const scene = String(req.body.scene || '').slice(0, 64) || null
  const level = String(req.body.level || 'info').slice(0, 16)
  const message = String(req.body.message || '').trim()
  const deviceId = String(req.body.device_id || '').slice(0, 128) || null
  const pageUrl = String(req.body.page_url || '').slice(0, 512) || null

  if (!message) {
    return res.status(400).json({ code: 400, message: 'message 不能为空' })
  }

  try {
    let pluginId = null
    if (req.user && req.user.id && platform !== 'unknown') {
      const grant = await resolveUserGrant(req.user.id, platform)
      if (grant) pluginId = grant.id
    }

    await pool.query(
      `INSERT INTO runtime_logs
       (plugin_id, platform, scene, level, message, device_id, page_url)
       VALUES (?,?,?,?,?,?,?)`,
      [pluginId, platform, scene, level, message.slice(0, 2000), deviceId, pageUrl]
    )

    res.json({ code: 0, message: '记录成功' })
  } catch (err) {
    console.error('[logs.runtime.create]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

// GET /api/logs/runtime
async function runtime(req, res) {
  const page      = Math.max(1, parseInt(req.query.page)  || 1)
  const size      = Math.min(100, parseInt(req.query.size) || 50)
  const offset    = (page - 1) * size
  const platform  = req.query.platform  || ''
  const level     = req.query.level     || ''
  const scene     = req.query.scene     || ''
  const startDate = req.query.startDate || ''
  const endDate   = req.query.endDate   || ''

  const scope = applyDataScope(req, { ownerColumn: 'user_id', alias: 'p' })
  const where = []
  const params = []
  if (platform)  { where.push('rl.platform = ?');   params.push(platform) }
  if (level)     { where.push('rl.level = ?');      params.push(level) }
  if (scene)     { where.push('rl.scene = ?');      params.push(scene) }
  if (startDate) { where.push('rl.created_at >= ?'); params.push(startDate) }
  if (endDate)   { where.push('rl.created_at <= ?'); params.push(endDate + ' 23:59:59') }
  if (scope.sql) { where.push(scope.sql.replace(/^ AND /, '')); params.push(...scope.params) }
  const whereSQL = where.length ? `WHERE ${where.join(' AND ')}` : ''

  try {
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM runtime_logs rl
       LEFT JOIN plugins p ON p.id = rl.plugin_id
       ${whereSQL}`,
      params
    )
    const [rows] = await pool.query(
      `SELECT rl.id, rl.plugin_id, p.plugin_key, rl.platform, rl.scene, rl.level,
              rl.message, rl.device_id, rl.page_url,
              DATE_FORMAT(rl.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM runtime_logs rl
       LEFT JOIN plugins p ON p.id = rl.plugin_id
       ${whereSQL}
       ORDER BY rl.id DESC LIMIT ? OFFSET ?`,
      [...params, size, offset]
    )
    res.json({ code: 0, data: { list: rows, total, page, size } })
  } catch (err) {
    console.error('[logs.runtime]', err)
    res.status(500).json({ code: 500, message: '服务器错误' })
  }
}

module.exports = { messages, transfers, createRuntime, runtime }
