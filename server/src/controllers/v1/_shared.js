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
// ★正向枚举 + fail-closed:每个已知角色显式放行,未知一律收紧(1=0),绝不放大权限。
//   用稳定 role_code(非中文 role_name/非魔法 role_id)判角色。
//   internal(平台方)      : 默认 ' AND 1=0';显式带 tenant_id 才查该租户
//   external tenant_admin : ' AND <tenantCol> = ?'(本租户全部)
//   external agent        : ' AND <tenantCol> = ? AND <saCol> IN (分配集)';无分配/无 saCol → ' AND 1=0'
//   external 其它(自定义/role_code 缺失/补全失败): ' AND 1=0'(未知 fail-closed)
async function scope(req, opts = {}) {
  const tenantCol = opts.tenantCol || 'tenant_id'
  const saCol = opts.saCol || null
  const u = (req && req.user) || {}

  let base
  if (u.user_type === 'internal') {
    const target = (req.query && req.query.tenant_id) || (req.body && req.body.tenant_id)
    base = target
      ? { sql: ` AND ${tenantCol} = ?`, params: [target], granted: true }
      : { sql: ' AND 1=0', params: [], granted: false }
  } else if (u.tenant_id == null) {
    base = { sql: ' AND 1=0', params: [], granted: false }
  } else if (u.role_code === 'tenant_admin') {
    // 租户超管:正判,看本租户全部
    base = { sql: ` AND ${tenantCol} = ?`, params: [u.tenant_id], granted: true }
  } else if (u.role_code === 'agent') {
    // 客服:正判,仅本租户 + 有查看权的 service_account;无查看权/无账号维度 → 看不到
    if (!saCol) {
      base = { sql: ' AND 1=0', params: [], granted: false }
    } else {
      const ids = await assignedAccountIds(req)
      if (!ids.length) base = { sql: ' AND 1=0', params: [], granted: false }
      else base = {
        sql: ` AND ${tenantCol} = ? AND ${saCol} IN (${ids.map(() => '?').join(',')})`,
        params: [u.tenant_id, ...ids],
        granted: true,
      }
    }
  } else {
    // 未知角色(自定义/role_code 缺失/补全失败)→ fail-closed,绝不 fallthrough 放大
    base = { sql: ' AND 1=0', params: [], granted: false }
  }

  // W20-C4:有 saCol 的业务视图统一隐藏 disabled 账号(NULL service_account_id=未治理放行);
  //   pending/active 可见性由上面查看权集 + 租户超管看全租户天然满足(§7 口径)。
  if (base.granted && saCol) {
    base.sql += ` AND (${saCol} IS NULL OR ${saCol} NOT IN (SELECT id FROM service_accounts WHERE lifecycle = 'disabled'))`
  }
  return { sql: base.sql, params: base.params }
}

// W20-C2:客服查看权 service_account 集合(改读 service_account_view,★带 tenant_id;单请求内 memoize)
async function assignedAccountIds(req) {
  if (req._w19AssignedSa) return req._w19AssignedSa
  const [rows] = await pool.query(
    'SELECT service_account_id FROM service_account_view WHERE tenant_id = ? AND employee_id = ?',
    [req.user.tenant_id, req.user.id]
  )
  req._w19AssignedSa = rows.map((r) => r.service_account_id).filter((v) => v != null)
  return req._w19AssignedSa
}

// W19-C4:平台方(internal)不持有租户配置,写租户配置应得干净 403(替代 tenant_id=NULL 入库 500)
function denyInternal(req, res) {
  if (req.user && req.user.user_type === 'internal') {
    fail(res, 403, 1003, '平台方账号不可操作租户配置')
    return true
  }
  return false
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
  denyInternal,
  paging,
  toMysqlDate,
  jsonValue,
  parseJsonField,
  buildUpdate,
  dateRange,
}
