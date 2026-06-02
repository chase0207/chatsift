const pool = require('../../config/db')
const { ok, fail, tenantId, paging, dateRange, parseJsonField } = require('./_shared')
const { buildDiagnosis } = require('../../v1/diagnosis')

async function list(req, res) {
  const tenant = tenantId(req)
  const { page, pageSize, offset } = paging(req.query)
  const params = [tenant]
  let where = 'WHERE c.tenant_id = ?'

  for (const key of ['platform', 'intent_label', 'current_stage']) {
    if (req.query[key]) {
      where += ` AND c.${key} = ?`
      params.push(req.query[key])
    }
  }
  if (req.query.platform_page) {
    where += ' AND c.platform_page LIKE ?'
    params.push(`%${req.query.platform_page}%`)
  }
  if (req.query.nickname) {
    where += ' AND c.customer_nickname LIKE ?'
    params.push(`%${req.query.nickname}%`)
  }
  where += dateRange(req.query, 'c.last_message_at', params)
  if (req.query.keyword) {
    where += ` AND EXISTS (
      SELECT 1 FROM messages m
      WHERE m.conversation_id = c.id AND m.tenant_id = c.tenant_id AND m.content_text LIKE ?
    )`
    params.push(`%${req.query.keyword}%`)
  }
  if (req.query.agent) {
    where += ` AND EXISTS (
      SELECT 1 FROM messages m
      WHERE m.conversation_id = c.id AND m.tenant_id = c.tenant_id
        AND m.direction = 'outbound' AND m.sender_nickname = ?
    )`
    params.push(req.query.agent)
  }
  if (req.query.workorder_type) {
    where += ` AND EXISTS (
      SELECT 1 FROM workorders w
      WHERE w.conversation_id = c.id AND w.tenant_id = c.tenant_id AND w.workorder_type = ?
    )`
    params.push(req.query.workorder_type)
  }

  try {
    if (req.query.diagnosis_color) {
      const [allRows] = await pool.query(
        `SELECT c.id, c.platform, c.platform_page, c.customer_nickname, c.customer_platform_uid,
                c.intent_label, c.intent_confidence, c.intent_source, c.current_stage,
                c.completeness_score, c.field_validity, c.message_count,
                DATE_FORMAT(c.last_message_at, '%Y-%m-%d %H:%i:%s') AS last_message_at,
                DATE_FORMAT(c.last_inbound_at, '%Y-%m-%d %H:%i:%s') AS last_inbound_at,
                DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
         FROM conversations c ${where}
         ORDER BY c.last_message_at DESC, c.id DESC`,
        params
      )
      const filtered = withDiagnosis(allRows).filter((row) => row.diagnosis.mainColor === req.query.diagnosis_color)
      return ok(res, {
        list: filtered.slice(offset, offset + pageSize),
        total: filtered.length,
        page,
        page_size: pageSize,
      })
    }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM conversations c ${where}`, params)
    const [rows] = await pool.query(
      `SELECT c.id, c.platform, c.platform_page, c.customer_nickname, c.customer_platform_uid,
              c.intent_label, c.intent_confidence, c.intent_source, c.current_stage,
              c.completeness_score, c.field_validity, c.message_count,
              DATE_FORMAT(c.last_message_at, '%Y-%m-%d %H:%i:%s') AS last_message_at,
              DATE_FORMAT(c.last_inbound_at, '%Y-%m-%d %H:%i:%s') AS last_inbound_at,
              DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM conversations c ${where}
       ORDER BY c.last_message_at DESC, c.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    )
    ok(res, { list: withDiagnosis(rows), total, page, page_size: pageSize })
  } catch (err) {
    console.error('[v1.conversations.list]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function detail(req, res) {
  const tenant = tenantId(req)
  try {
    const [rows] = await pool.query(
      `SELECT c.*, l.id AS lead_id
       FROM conversations c
       LEFT JOIN leads l ON l.primary_conversation_id = c.id AND l.tenant_id = c.tenant_id
       WHERE c.tenant_id = ? AND c.id = ?
       LIMIT 1`,
      [tenant, req.params.id]
    )
    if (!rows.length) return fail(res, 404, 2001, '会话不存在')
    const [workorders] = await pool.query(
      'SELECT id FROM workorders WHERE tenant_id = ? AND conversation_id = ? ORDER BY id DESC',
      [tenant, req.params.id]
    )
    const conversation = {
      ...rows[0],
      field_validity: parseJsonField(rows[0].field_validity, {}),
    }
    ok(res, {
      ...conversation,
      diagnosis: buildDiagnosis(conversation),
      workorder_ids: workorders.map((row) => row.id),
    })
  } catch (err) {
    console.error('[v1.conversations.detail]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

async function messages(req, res) {
  const tenant = tenantId(req)
  const { page, pageSize, offset } = paging(req.query)
  try {
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM messages WHERE tenant_id = ? AND conversation_id = ?',
      [tenant, req.params.id]
    )
    const latest = req.query.latest === '1' || req.query.latest === 'true'
    const [rows] = await pool.query(
      `SELECT id, direction, sender_nickname, content_type, content_text, content_url, raw_snapshot,
              DATE_FORMAT(occurred_at, '%Y-%m-%d %H:%i:%s') AS occurred_at
       FROM messages
       WHERE tenant_id = ? AND conversation_id = ?
       ORDER BY occurred_at ${latest ? 'DESC' : 'ASC'}, id ${latest ? 'DESC' : 'ASC'}
       LIMIT ? OFFSET ?`,
      [tenant, req.params.id, pageSize, offset]
    )
    const list = latest ? rows.reverse() : rows
    ok(res, {
      list: list.map((row) => ({ ...row, raw_snapshot: parseJsonField(row.raw_snapshot) })),
      total,
      page,
      page_size: pageSize,
    })
  } catch (err) {
    console.error('[v1.conversations.messages]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

function withDiagnosis(rows) {
  return rows.map((row) => {
    const fieldValidity = parseJsonField(row.field_validity, {})
    const conversation = { ...row, field_validity: fieldValidity }
    return { ...conversation, diagnosis: buildDiagnosis(conversation) }
  })
}

// 筛选项(从真实会话数据派生:平台/页面/客服),供聚合页三级联动
async function facets(req, res) {
  const tenant = tenantId(req)
  try {
    const [platforms] = await pool.query(
      "SELECT DISTINCT platform FROM conversations WHERE tenant_id = ? AND platform IS NOT NULL AND platform <> '' ORDER BY platform",
      [tenant]
    )
    const [pages] = await pool.query(
      "SELECT DISTINCT platform, platform_page FROM conversations WHERE tenant_id = ? AND platform_page IS NOT NULL AND platform_page <> '' ORDER BY platform, platform_page",
      [tenant]
    )
    const [agents] = await pool.query(
      `SELECT DISTINCT c.platform, c.platform_page, m.sender_nickname AS agent
       FROM messages m JOIN conversations c ON c.id = m.conversation_id AND c.tenant_id = m.tenant_id
       WHERE m.tenant_id = ? AND m.direction = 'outbound'
         AND m.sender_nickname IS NOT NULL AND m.sender_nickname <> ''
       ORDER BY agent LIMIT 500`,
      [tenant]
    )
    ok(res, { platforms: platforms.map((r) => r.platform), pages, agents })
  } catch (err) {
    console.error('[v1.conversations.facets]', err)
    fail(res, 500, 5000, '服务器内部错误')
  }
}

module.exports = { list, detail, messages, facets }
