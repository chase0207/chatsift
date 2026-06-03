-- 回填工单标题里写死的旧客户名(2026-06-03, v0.2.11)
-- title 格式 = "{类型}:{客户名}";类型前缀无冒号,取首段拼纠正后的会话客户名
UPDATE workorders w
JOIN conversations c ON c.id = w.conversation_id AND c.tenant_id = w.tenant_id
SET w.title = CONCAT(SUBSTRING_INDEX(w.title, ':', 1), ':', c.customer_nickname)
WHERE c.customer_nickname IS NOT NULL AND c.customer_nickname <> ''
  AND w.title LIKE '%:%'
  AND SUBSTRING_INDEX(w.title, ':', -1) <> c.customer_nickname;
