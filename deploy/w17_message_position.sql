-- W17 消息位置标识 — messages 表数据契约变更(手动迁移,给已有库 local/prod/test 原地升级)
-- 全新库由 server/sql/v1-schema.sql 基线直接建成,不跑本文件(避免列已存在报错)
-- 性质:C 类数据契约。只增列 + 放松 occurred_at NOT NULL(安全,非破坏)。
-- position/segment_at 对旧行为 NULL;Task6 清空重采后新逻辑写入。
-- uk_conv_position 含 position:旧行 position=NULL,MySQL 唯一键允许多 NULL,迁移不冲突。
ALTER TABLE messages
  ADD COLUMN position   INT UNSIGNED DEFAULT NULL COMMENT 'W17 会话内位置号(锚点窗口续编;身份+段内排序;纯位置不含内容)' AFTER direction,
  ADD COLUMN segment_at DATETIME     DEFAULT NULL COMMENT 'W17 所属时间条(段)时间;段间排序键;纯排序辅助,不展示、非真实时间' AFTER occurred_at,
  MODIFY COLUMN occurred_at DATETIME DEFAULT NULL COMMENT '消息精确时间;inbound存到秒,outbound无精确时间存NULL(W17废弃+1s合成)',
  ADD UNIQUE KEY uk_conv_position (tenant_id, conversation_id, position),
  ADD KEY        idx_conv_sort    (conversation_id, segment_at, position);
