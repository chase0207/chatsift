function ok(res, data = {}, message = 'ok') {
  res.json({ code: 0, message, data })
}

function fail(res, status, code, message) {
  res.status(status).json({ code, message, data: null })
}

function tenantId(req) {
  return req.user && req.user.id
}

function paging(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(query.page_size || query.size, 10) || 20))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

function toMysqlDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const pad = (num) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function jsonValue(value, fallback = null) {
  if (value === undefined) return fallback
  if (value === null) return null
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function parseJsonField(value, fallback = null) {
  if (value == null) return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function buildUpdate(body, allowed) {
  const fields = []
  const values = []
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      fields.push(`${key} = ?`)
      values.push(body[key])
    }
  }
  return { fields, values }
}

function dateRange(query, column, params) {
  let sql = ''
  if (query.from) {
    sql += ` AND ${column} >= ?`
    params.push(toMysqlDate(query.from) || query.from)
  }
  if (query.to) {
    sql += ` AND ${column} <= ?`
    params.push(toMysqlDate(query.to) || query.to)
  }
  return sql
}

module.exports = {
  ok,
  fail,
  tenantId,
  paging,
  toMysqlDate,
  jsonValue,
  parseJsonField,
  buildUpdate,
  dateRange,
}
