function applyDataScope(req, { ownerColumn = 'user_id', alias = '' } = {}) {
  const scope = req.user?.data_scope || 'self'
  if (scope === 'all') return { sql: '', params: [] }
  const col = alias ? `${alias}.${ownerColumn}` : ownerColumn
  return { sql: ` AND ${col} = ?`, params: [req.user.id] }
}

module.exports = { applyDataScope }
