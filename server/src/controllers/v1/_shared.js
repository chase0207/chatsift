const pool = require('../../config/db')

function ok(res, data = {}, message = 'ok') {
  res.json({ code: 0, message, data })
}

function fail(res, status, code, message) {
  res.status(status).json({ code, message, data: null })
}

// W19:租户id单点(供 INSERT 戳 owner / 自有租户配置 get-update)。内部用户=NULL。
function tenantId(req) {
  return req.user && req.user.tenant_id
}

// W19 统一数据隔离 helper(替代裸 tenant 条件)。返回 { sql, params } 拼到 WHERE 之后。
// ★fail-closed:判据失败一律收紧(看不到),绝不放大权限。用稳定 role_key(非中文 role_name)判超管。
//   internal(平台方)         : 默认 ' AND 1=0'(不看业务数据);显式带 tenant_id 才查该租户
//   external role_key=tenant_admin: ' AND <tenantCol> = ?'(本租户全部) —— 唯一被 positively 放行的广权限
//   external 其余(客服/自定义/role_key 缺失): ' AND <tenantCol> = ? AND <saCol> IN (分配集)';
//                              无分配 或 表无 saCol 维度 → ' AND 1=0'(受限默认,看不到)
async function scope(req, opts = {}) {
  const tenantCol = opts.tenantCol || 'tenant_id'
  const saCol = opts.saCol || null
  const u = (req && req.user) || {}

  if (u.user_type === 'internal') {
    const target = (req.query && req.query.tenant_id) || (req.body && req.body.tenant_id)
    if (target) return { sql: ` AND ${tenantCol} = ?`, params: [target] }
    return { sql: ' AND 1=0', params: [] }
  }

  if (u.tenant_id == null) return { sql: ' AND 1=0', params: [] }

  // 只有稳定命中 tenant_admin 才看本租户全部;其余角色 fall-closed 到账号受限
  if (u.role_key === 'tenant_admin') {
    return { sql: ` AND ${tenantCol} = ?`, params: [u.tenant_id] }
  }

  if (!saCol) return { sql: ' AND 1=0', params: [] }
  const ids = await assignedAccountIds(req)
  if (!ids.length) return { sql: ' AND 1=0', params: [] }
  return {
    sql: ` AND ${tenantCol} = ? AND ${saCol} IN (${ids.map(() => '?').join(',')})`,
    params: [u.tenant_id, ...ids],
  }
}

// 客服分配的 service_account 集合(单请求内 memoize,避免 detail 多查询重复打库)
async function assignedAccountIds(req) {
  if (req._w19AssignedSa) return req._w19AssignedSa
  const [rows] = await pool.query(
    'SELECT service_account_id FROM employee_service_account WHERE employee_id = ?',
    [req.user.id]
  )
  req._w19AssignedSa = rows.map((r) => r.service_account_id).filter((v) => v != null)
  return req._w19AssignedSa
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
  scope,
  paging,
  toMysqlDate,
  jsonValue,
  parseJsonField,
  buildUpdate,
  dateRange,
}
