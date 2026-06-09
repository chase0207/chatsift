// W20 客服账号治理审计写入 — eventsController / serviceAccountController 共用。
// conn 可为 pool 或单连接(均有 .query)。before/after 传对象自动 JSON 序列化。
async function insertAudit(conn, {
  tenantId,
  operatorUserId = null,
  targetEmployeeId = null,
  serviceAccountId = null,
  eventType,
  beforeValue = null,
  afterValue = null,
  deviceId = null,
  browserProfileId = null,
  tabId = null,
}) {
  await conn.query(
    `INSERT INTO service_account_audit
       (tenant_id, operator_user_id, target_employee_id, service_account_id, event_type,
        before_value, after_value, device_id, browser_profile_id, tab_id)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      tenantId,
      operatorUserId,
      targetEmployeeId,
      serviceAccountId,
      eventType,
      beforeValue == null ? null : JSON.stringify(beforeValue),
      afterValue == null ? null : JSON.stringify(afterValue),
      deviceId,
      browserProfileId,
      tabId,
    ]
  )
}

module.exports = { insertAudit }
