-- 修复 customer_nickname 被 outbound(客服)覆盖(2026-06-03)
-- 配合 eventsController 改为"只取 inbound 客户昵称";此处回填存量。
-- 1) 会话:customer_nickname = 首条 inbound 消息的发送者
UPDATE conversations c
JOIN (
  SELECT m.conversation_id, m.sender_nickname
  FROM messages m
  JOIN (SELECT conversation_id, MIN(id) AS min_id FROM messages WHERE direction='inbound' GROUP BY conversation_id) f
    ON f.min_id = m.id
) im ON im.conversation_id = c.id
SET c.customer_nickname = im.sender_nickname
WHERE im.sender_nickname IS NOT NULL AND im.sender_nickname <> '';

-- 2) 线索:customer_nickname = 关联会话纠正后的客户名(工单标题按约定不动)
UPDATE leads l
JOIN conversations c ON c.id = l.primary_conversation_id
SET l.customer_nickname = c.customer_nickname
WHERE c.customer_nickname IS NOT NULL AND c.customer_nickname <> '';
