const pool = require('../../config/db')
const { ok, fail, scope: applyScope } = require('./_shared')
const rules = require('../../v1/business-rules')

const contactValidSql = "JSON_UNQUOTE(JSON_EXTRACT(c.field_validity, '$.contact.status')) = 'valid'"
const appointmentValidSql = rules.appointmentFields
  .map((field) => `JSON_UNQUOTE(JSON_EXTRACT(c.field_validity, '$.${field}.status')) = 'valid'`)
  .join(' AND ')

async function buildConversationScope(req, alias = 'c') {
  const prefix = alias ? `${alias}.` : ''
  const s = await applyScope(req, { tenantCol: `${prefix}tenant_id`, saCol: `${prefix}service_account_id` })
  const params = [...s.params]
  let where = `WHERE 1=1${s.sql}`

  const from = req.query.from || defaultFrom()
  const to = req.query.to || defaultTo()
  where += ` AND ${prefix}created_at >= ? AND ${prefix}created_at < DATE_ADD(?, INTERVAL 1 DAY)`
  params.push(from, to)

  if (req.query.platform_page) {
    where += ` AND ${prefix}platform_page = ?`
    params.push(req.query.platform_page)
  }

  return { where, params, from, to }
}

async function buildLeadScope(req, alias = 'l') {
  const prefix = alias ? `${alias}.` : ''
  const s = await applyScope(req, { tenantCol: `${prefix}tenant_id`, saCol: `${prefix}service_account_id` })
  const params = [...s.params]
  let where = `WHERE 1=1${s.sql}`

  const from = req.query.from || defaultFrom()
  const to = req.query.to || defaultTo()
  where += ` AND ${prefix}created_at >= ? AND ${prefix}created_at < DATE_ADD(?, INTERVAL 1 DAY)`
  params.push(from, to)

  return { where, params }
}

async function funnel(req, res) {
  const scope = await buildConversationScope(req)
  try {
    const [[row]] = await pool.query(
      `SELECT
         COUNT(DISTINCT c.id) AS inquiry,
         COUNT(DISTINCT CASE
           WHEN ${contactValidSql} THEN c.id
         END) AS lead_count,
         COUNT(DISTINCT CASE WHEN ${appointmentValidSql} THEN c.id END) AS appointment
       FROM conversations c
       ${scope.where}`,
      scope.params
    )
    ok(res, formatFunnel(row))
  } catch (err) {
    console.error('[v1.analytics.funnel]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function intentDistribution(req, res) {
  const scope = await buildConversationScope(req)
  try {
    const [rows] = await pool.query(
      `SELECT COALESCE(c.intent_label, 'unknown') AS intent_label, COUNT(*) AS count
       FROM conversations c
       ${scope.where}
       GROUP BY COALESCE(c.intent_label, 'unknown')
       ORDER BY count DESC`,
      scope.params
    )
    ok(res, rows)
  } catch (err) {
    console.error('[v1.analytics.intentDistribution]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function leadLevel(req, res) {
  const scope = await buildLeadScope(req)
  try {
    const [rows] = await pool.query(
      `SELECT lead_level, count
       FROM (
         SELECT COALESCE(l.lead_level, 'unknown') AS lead_level, COUNT(*) AS count
         FROM leads l
         ${scope.where}
         GROUP BY COALESCE(l.lead_level, 'unknown')
       ) t
       ORDER BY FIELD(lead_level, 'high', 'mid', 'low', 'unknown'), count DESC`,
      scope.params
    )
    ok(res, rows)
  } catch (err) {
    console.error('[v1.analytics.leadLevel]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function byPage(req, res) {
  const scope = await buildConversationScope(req)
  try {
    const [rows] = await pool.query(
      `SELECT
         COALESCE(c.platform_page, 'unknown') AS platform_page,
         COUNT(DISTINCT c.id) AS inquiry,
         COUNT(DISTINCT CASE
           WHEN ${contactValidSql} THEN c.id
         END) AS lead_count,
         COUNT(DISTINCT CASE WHEN ${appointmentValidSql} THEN c.id END) AS appointment
       FROM conversations c
       ${scope.where}
       GROUP BY COALESCE(c.platform_page, 'unknown')
       ORDER BY inquiry DESC`,
      scope.params
    )
    ok(res, rows.map(normalizeFunnelRow).map((row) => ({ ...row, ...rates(row) })))
  } catch (err) {
    console.error('[v1.analytics.byPage]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function trend(req, res) {
  const scope = await buildConversationScope(req)
  try {
    const [rows] = await pool.query(
      `SELECT
         DATE_FORMAT(c.created_at, '%Y-%m-%d') AS date,
         COUNT(DISTINCT c.id) AS inquiry,
         COUNT(DISTINCT CASE
           WHEN ${contactValidSql} THEN c.id
         END) AS lead_count,
         COUNT(DISTINCT CASE WHEN ${appointmentValidSql} THEN c.id END) AS appointment
       FROM conversations c
       ${scope.where}
       GROUP BY DATE_FORMAT(c.created_at, '%Y-%m-%d')
       ORDER BY date ASC`,
      scope.params
    )
    ok(res, rows.map(normalizeFunnelRow))
  } catch (err) {
    console.error('[v1.analytics.trend]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

function formatFunnel(row) {
  const data = normalizeFunnelRow(row)
  return { ...data, ...rates(data) }
}

function normalizeFunnelRow(row) {
  const { lead_count, ...rest } = row
  return {
    ...rest,
    inquiry: Number(row.inquiry || 0),
    lead: Number(lead_count || row.lead || 0),
    appointment: Number(row.appointment || 0),
  }
}

function rates(row) {
  return {
    leadRate: percent(row.lead, row.inquiry),
    appointmentRate: percent(row.appointment, row.lead),
  }
}

function percent(value, base) {
  const numerator = Number(value || 0)
  const denominator = Number(base || 0)
  if (!denominator) return 0
  return Number((numerator / denominator * 100).toFixed(1))
}

function defaultFrom() {
  const date = new Date()
  date.setDate(date.getDate() - 29)
  return formatDate(date)
}

function defaultTo() {
  return formatDate(new Date())
}

function formatDate(date) {
  const pad = (num) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

module.exports = {
  funnel,
  intentDistribution,
  leadLevel,
  byPage,
  trend,
}
