const pool = require('../../config/db')
const { ok, fail, tenantId, toMysqlDate, jsonValue } = require('./_shared')

async function batch(req, res) {
  const events = req.body && req.body.events
  if (!Array.isArray(events)) return fail(res, 400, 1003, 'events 必须是数组')
  if (events.length > 50) return fail(res, 400, 1003, '单批最多 50 条')

  const tenant = tenantId(req)
  const conn = await pool.getConnection()
  let accepted = 0
  let duplicated = 0
  let rejected = 0

  try {
    await conn.beginTransaction()

    for (const event of events) {
      const platform = event.platform
      const platformConversationId = event.conversation_id || event.platform_conversation_id
      const platformMessageId = event.message_id || event.platform_message_id
      const direction = event.direction
      const occurredAt = toMysqlDate(event.occurred_at)

      if (!platform || !platformConversationId || !platformMessageId || !direction || !occurredAt) {
        rejected += 1
        continue
      }

      const [existingMessages] = await conn.query(
        'SELECT id FROM messages WHERE tenant_id = ? AND platform_message_id = ? LIMIT 1',
        [tenant, platformMessageId]
      )
      if (existingMessages.length) {
        duplicated += 1
        continue
      }

      let conversationId
      const [conversationRows] = await conn.query(
        `SELECT id FROM conversations
         WHERE tenant_id = ? AND platform = ? AND platform_conversation_id = ?
         LIMIT 1`,
        [tenant, platform, platformConversationId]
      )

      // 客户昵称只取 inbound(客户)消息的发送者,绝不被 outbound(客服)覆盖
      const inboundNickname = direction === 'inbound' ? (event.sender_nickname || null) : null

      if (conversationRows.length) {
        conversationId = conversationRows[0].id
        await conn.query(
          `UPDATE conversations
           SET platform_page = COALESCE(?, platform_page),
               customer_nickname = COALESCE(?, customer_nickname),
               customer_platform_uid = COALESCE(?, customer_platform_uid),
               last_message_at = GREATEST(COALESCE(last_message_at, ?), ?),
               last_inbound_at = CASE WHEN ? = 'inbound' THEN GREATEST(COALESCE(last_inbound_at, ?), ?) ELSE last_inbound_at END,
               message_count = message_count + 1
           WHERE id = ?`,
          [
            event.platform_page || null,
            inboundNickname,
            event.customer_platform_uid || event.platform_uid || null,
            occurredAt,
            occurredAt,
            direction,
            occurredAt,
            occurredAt,
            conversationId,
          ]
        )
      } else {
        const [result] = await conn.query(
          `INSERT INTO conversations
           (tenant_id, platform, platform_page, platform_conversation_id, customer_nickname,
            customer_platform_uid, message_count, last_message_at, last_inbound_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            tenant,
            platform,
            event.platform_page || null,
            platformConversationId,
            inboundNickname,
            event.customer_platform_uid || event.platform_uid || null,
            1,
            occurredAt,
            direction === 'inbound' ? occurredAt : null,
          ]
        )
        conversationId = result.insertId
      }

      const [messageResult] = await conn.query(
        `INSERT INTO messages
         (tenant_id, conversation_id, platform_message_id, direction, sender_nickname,
          content_type, content_text, content_url, raw_snapshot, occurred_at, analyzed_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,NULL)`,
        [
          tenant,
          conversationId,
          platformMessageId,
          direction,
          event.sender_nickname || null,
          event.content_type || 'text',
          event.content_text || null,
          event.content_url || null,
          jsonValue(event.raw_snapshot),
          occurredAt,
        ]
      )

      await conn.query(
        `INSERT INTO analysis_jobs (tenant_id, message_id, conversation_id, status)
         VALUES (?, ?, ?, 'pending')`,
        [tenant, messageResult.insertId, conversationId]
      )
      accepted += 1
    }

    await conn.commit()
    ok(res, { accepted, duplicated, rejected })
  } catch (err) {
    await conn.rollback()
    console.error('[v1.events.batch]', err)
    fail(res, 500, 5000, '服务器内部错误')
  } finally {
    conn.release()
  }
}

async function heartbeat(req, res) {
  ok(res, {
    server_time: new Date().toISOString(),
    config_version: 1,
  })
}

async function domAdapterConfig(req, res) {
  ok(res, {
    version: 1,
    platform: req.query.platform || 'douyin',
    selectors: req.query.version && Number(req.query.version) >= 1 ? null : {},
  })
}

module.exports = { batch, heartbeat, domAdapterConfig }
