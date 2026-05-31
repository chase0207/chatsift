const pool = require('../../config/db')
const { ok, fail, tenantId, paging, jsonValue, parseJsonField } = require('./_shared')
const { buildDiagnosis } = require('../../v1/diagnosis')

async function list(req, res) {
  const tenant = tenantId(req)
  const { page, pageSize, offset } = paging(req.query)
  const params = [tenant]
  let where = 'WHERE l.tenant_id = ?'

  for (const key of ['status', 'lead_level', 'assigned_to', 'city']) {
    if (req.query[key]) {
      where += ` AND l.${key} = ?`
      params.push(req.query[key])
    }
  }
  if (req.query.keyword) {
    where += ' AND (l.customer_nickname LIKE ? OR l.customer_name LIKE ? OR l.customer_phone LIKE ? OR l.customer_wechat LIKE ?)'
    const keyword = `%${req.query.keyword}%`
    params.push(keyword, keyword, keyword, keyword)
  }

  try {
    if (req.query.diagnosis_color) {
      const [allRows] = await pool.query(`${leadListSql()} ${where} ORDER BY l.id DESC`, params)
      const filtered = withDiagnosis(allRows).filter((row) => row.diagnosis.mainColor === req.query.diagnosis_color)
      return ok(res, {
        list: filtered.slice(offset, offset + pageSize),
        total: filtered.length,
        page,
        page_size: pageSize,
      })
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM leads l LEFT JOIN conversations c ON c.tenant_id = l.tenant_id AND c.id = l.primary_conversation_id ${where}`,
      params
    )
    const [rows] = await pool.query(
      `${leadListSql()} ${where} ORDER BY l.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    )
    ok(res, {
      list: withDiagnosis(rows),
      total,
      page,
      page_size: pageSize,
    })
  } catch (err) {
    console.error('[v1.leads.list]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function detail(req, res) {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM leads WHERE tenant_id = ? AND id = ? LIMIT 1',
      [tenantId(req), req.params.id]
    )
    if (!rows.length) return fail(res, 404, 2001, '线索不存在')
    const lead = { ...rows[0], tags: parseJsonField(rows[0].tags, []) }
    const [conversations] = await pool.query(
      `SELECT id, platform, platform_page, platform_conversation_id,
              customer_nickname, customer_platform_uid, intent_label, current_stage,
              completeness_score, field_validity, message_count,
              DATE_FORMAT(last_message_at, '%Y-%m-%d %H:%i:%s') AS last_message_at
       FROM conversations
       WHERE tenant_id = ? AND id = ?
       LIMIT 1`,
      [tenantId(req), lead.primary_conversation_id]
    )
    const [workorders] = await pool.query(
      `SELECT id, conversation_id, workorder_type, title, completeness_score,
              missing_fields, suggestion, priority, status,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM workorders
       WHERE tenant_id = ? AND conversation_id = ?
       ORDER BY id DESC`,
      [tenantId(req), lead.primary_conversation_id]
    )
    const conversation = conversations[0]
      ? { ...conversations[0], field_validity: parseJsonField(conversations[0].field_validity, {}) }
      : null
    ok(res, {
      lead: {
        ...lead,
        diagnosis: buildDiagnosis(conversation || lead),
      },
      conversation: conversation ? { ...conversation, diagnosis: buildDiagnosis(conversation) } : null,
      workorders: workorders.map((row) => ({
        ...row,
        missing_fields: parseJsonField(row.missing_fields, []),
      })),
    })
  } catch (err) {
    console.error('[v1.leads.detail]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

function leadListSql() {
  return `SELECT l.id, l.primary_conversation_id, l.customer_nickname, l.customer_name, l.customer_platform_uid,
                 l.customer_phone, l.customer_wechat, l.city, l.intent_label, l.lead_score, l.lead_level,
                 l.tags, l.status, l.assigned_to,
                 c.platform AS conversation_platform,
                 c.platform_page AS conversation_platform_page,
                 c.field_validity AS conversation_field_validity,
                 c.intent_label AS conversation_intent_label,
                 DATE_FORMAT(l.last_followed_at, '%Y-%m-%d %H:%i:%s') AS last_followed_at,
                 DATE_FORMAT(l.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                 DATE_FORMAT(l.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
          FROM leads l
          LEFT JOIN conversations c ON c.tenant_id = l.tenant_id AND c.id = l.primary_conversation_id`
}

function withDiagnosis(rows) {
  return rows.map((row) => {
    const tags = parseJsonField(row.tags, [])
    const conversation = {
      id: row.primary_conversation_id,
      intent_label: row.conversation_intent_label || row.intent_label,
      field_validity: parseJsonField(row.conversation_field_validity, {}),
    }
    return {
      ...row,
      tags,
      diagnosis: buildDiagnosis(conversation),
    }
  })
}

async function update(req, res) {
  const allowed = [
    'status',
    'lead_level',
    'assigned_to',
    'customer_name',
    'customer_phone',
    'customer_wechat',
    'city',
    'lead_score',
    'intent_label',
    'customer_nickname',
  ]
  const fields = []
  const values = []
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) {
      fields.push(`${key} = ?`)
      values.push(req.body[key])
    }
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'tags')) {
    fields.push('tags = ?')
    values.push(jsonValue(req.body.tags))
  }
  if (req.body.status === 'following') {
    fields.push('last_followed_at = NOW()')
  }
  if (!fields.length) return fail(res, 400, 1003, '没有可更新字段')

  try {
    const [result] = await pool.query(
      `UPDATE leads SET ${fields.join(', ')} WHERE tenant_id = ? AND id = ?`,
      [...values, tenantId(req), req.params.id]
    )
    if (!result.affectedRows) return fail(res, 404, 2001, '线索不存在')
    ok(res)
  } catch (err) {
    console.error('[v1.leads.update]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function convert(req, res) {
  try {
    const [result] = await pool.query(
      `UPDATE leads
       SET status = 'converted', last_followed_at = NOW()
       WHERE tenant_id = ? AND id = ?`,
      [tenantId(req), req.params.id]
    )
    if (!result.affectedRows) return fail(res, 404, 2001, '线索不存在')
    ok(res)
  } catch (err) {
    console.error('[v1.leads.convert]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

module.exports = { list, detail, update, convert }
