const pool = require('../config/db')
const { normalizePlatformKey } = require('../utils/platforms')

const normalizePlatform = normalizePlatformKey

async function resolveUserGrant(userId, platform) {
  const normalized = normalizePlatform(platform)
  const [rows] = await pool.query(
    `SELECT id, user_id, plugin_key, platform, status, expire_at, max_online
     FROM plugins
     WHERE user_id = ? AND platform = ? AND status = 1
     ORDER BY id DESC
     LIMIT 1`,
    [userId, normalized]
  )
  if (!rows.length) return null
  const grant = rows[0]
  if (grant.expire_at && new Date(grant.expire_at) < new Date()) return null
  return grant
}

module.exports = { normalizePlatform, resolveUserGrant }
