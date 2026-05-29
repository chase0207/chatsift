const pool = require('../../config/db')
const { ok, fail, tenantId, dateRange } = require('./_shared')

async function funnel(req, res) {
  const tenant = tenantId(req)
  const convParams = [tenant]
  let convWhere = 'WHERE tenant_id = ?'
  convWhere += dateRange(req.query, 'created_at', convParams)

  try {
    const [[{ total_conversations }]] = await pool.query(
      `SELECT COUNT(*) AS total_conversations FROM conversations ${convWhere}`,
      convParams
    )
    const [intentRows] = await pool.query(
      `SELECT COALESCE(intent_label, 'unknown') AS intent_label, COUNT(*) AS total
       FROM conversations ${convWhere}
       GROUP BY COALESCE(intent_label, 'unknown')`,
      convParams
    )
    const [[{ leads_created }]] = await pool.query(
      `SELECT COUNT(*) AS leads_created FROM leads ${convWhere}`,
      convParams
    )
    const [[{ workorders_created }]] = await pool.query(
      `SELECT COUNT(*) AS workorders_created FROM workorders ${convWhere}`,
      convParams
    )
    const [[{ converted }]] = await pool.query(
      `SELECT COUNT(*) AS converted FROM leads ${convWhere} AND status = 'converted'`,
      convParams
    )
    ok(res, {
      total_conversations,
      by_intent: Object.fromEntries(intentRows.map((row) => [row.intent_label, row.total])),
      leads_created,
      workorders_created,
      converted,
    })
  } catch (err) {
    console.error('[v1.analytics.funnel]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function platformComparison(req, res) {
  const params = [tenantId(req)]
  let where = 'WHERE tenant_id = ?'
  where += dateRange(req.query, 'created_at', params)

  try {
    const [rows] = await pool.query(
      `SELECT platform, COUNT(*) AS conversations, SUM(message_count) AS messages
       FROM conversations ${where}
       GROUP BY platform
       ORDER BY conversations DESC`,
      params
    )
    ok(res, { list: rows })
  } catch (err) {
    console.error('[v1.analytics.platformComparison]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

module.exports = { funnel, platformComparison }
