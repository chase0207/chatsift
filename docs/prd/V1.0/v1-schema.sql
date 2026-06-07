-- ============================================================
-- Chatsift V1.0.0 Database Schema
-- ============================================================
-- 目标库: chatsift (独立数据库)
-- 引擎:  InnoDB / utf8mb4
-- 原则:  表名无前缀 (独立库内的一等公民)
--        单级租户 (user_id 即 tenant_id)
--        不依赖 ORM,手写 SQL
-- 说明:  本文件只含 V1.0.0 新增的业务表。
--        鉴权/RBAC 相关表 (users/roles/menus/role_has_permissions/
--        platforms/platform_pages/plugins/configs) 从 chat_rpa 复用,
--        不在本文件重建,仅在文末给出"复用表清单"和"增量数据"。
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
-- 1. conversations — 会话
--    一个客户在一个平台上的一段持续对话
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id                       BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id                INT UNSIGNED NOT NULL              COMMENT '租户=users.id',
  platform                 VARCHAR(32)  NOT NULL              COMMENT 'douyin/xiaohongshu/...',
  platform_page            VARCHAR(64)  DEFAULT NULL          COMMENT '页面来源:laike-message/feige/private-message',
  platform_conversation_id VARCHAR(128) NOT NULL              COMMENT '平台侧会话唯一ID',
  customer_nickname        VARCHAR(128) DEFAULT NULL          COMMENT '客户昵称',
  customer_platform_uid    VARCHAR(128) DEFAULT NULL          COMMENT '平台侧用户ID,用于跨会话合并线索',
  intent_label             VARCHAR(32)  DEFAULT NULL          COMMENT 'simple_inquiry/appointment/complaint/price_inquiry',
  intent_confidence        DECIMAL(3,2) DEFAULT NULL          COMMENT '意图置信度 0.00-1.00',
  intent_source            VARCHAR(16)  DEFAULT NULL          COMMENT 'rule/llm/default',
  current_stage            VARCHAR(32)  DEFAULT 'new'         COMMENT '推进阶段:new/collecting/completing/done',
  completeness_score       TINYINT UNSIGNED DEFAULT 0         COMMENT '完整度评分 0-100',
  message_count            INT UNSIGNED DEFAULT 0             COMMENT '消息总数(冗余,加速列表)',
  last_message_at          DATETIME     DEFAULT NULL          COMMENT '最后一条消息时间',
  last_inbound_at          DATETIME     DEFAULT NULL          COMMENT '最后一条用户消息时间(判断待回复)',
  analyzed_at              DATETIME     DEFAULT NULL          COMMENT '最后分析时间',
  created_at               DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_platform_conv (tenant_id, platform, platform_conversation_id),
  KEY idx_tenant_intent      (tenant_id, intent_label),
  KEY idx_tenant_stage       (tenant_id, current_stage),
  KEY idx_tenant_lastmsg     (tenant_id, last_message_at),
  KEY idx_customer_uid       (tenant_id, customer_platform_uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会话';

-- ------------------------------------------------------------
-- 2. messages — 消息
--    会话里的每一条消息,去重的最小单位
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id                  BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id           INT UNSIGNED NOT NULL,
  conversation_id     BIGINT UNSIGNED NOT NULL,
  platform_message_id VARCHAR(128) NOT NULL                   COMMENT '平台侧消息ID,用于去重',
  direction           ENUM('inbound','outbound') NOT NULL     COMMENT 'inbound=用户发来 outbound=客服发出',
  sender_nickname     VARCHAR(128) DEFAULT NULL,
  content_type        VARCHAR(16)  DEFAULT 'text'             COMMENT 'text/image/card/system',
  content_text        TEXT         DEFAULT NULL,
  content_url         VARCHAR(512) DEFAULT NULL               COMMENT '图片/卡片等的URL',
  raw_snapshot        JSON         DEFAULT NULL               COMMENT '可选DOM快照,审计用',
  occurred_at         DATETIME     NOT NULL                   COMMENT '消息在平台发生的时间',
  analyzed_at         DATETIME     DEFAULT NULL               COMMENT '分析完成时间,NULL=待分析',
  uploaded_at         DATETIME     DEFAULT CURRENT_TIMESTAMP  COMMENT '上报入库时间',
  UNIQUE KEY uk_tenant_msg (tenant_id, platform_message_id),
  KEY idx_conv_time        (conversation_id, occurred_at),
  KEY idx_pending_analyze  (analyzed_at),
  FULLTEXT KEY ft_content  (content_text)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='消息';

-- ------------------------------------------------------------
-- 3. leads — 线索
--    潜在客户,可合并多个 conversation
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leads (
  id                   BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id            INT UNSIGNED NOT NULL,
  primary_conversation_id BIGINT UNSIGNED DEFAULT NULL        COMMENT '主会话(首次产生线索的会话)',
  customer_nickname    VARCHAR(128) DEFAULT NULL,
  customer_platform_uid VARCHAR(128) DEFAULT NULL             COMMENT '平台用户ID,合并依据',
  customer_phone       VARCHAR(32)  DEFAULT NULL,
  customer_wechat      VARCHAR(64)  DEFAULT NULL,
  city                 VARCHAR(64)  DEFAULT NULL,
  intent_label         VARCHAR(32)  DEFAULT NULL              COMMENT '最近一次意图',
  lead_score           TINYINT UNSIGNED DEFAULT 50            COMMENT '意向度 0-100',
  lead_level           VARCHAR(8)   DEFAULT 'mid'             COMMENT 'high/mid/low',
  tags                 JSON         DEFAULT NULL              COMMENT '标签数组',
  status               VARCHAR(16)  DEFAULT 'new'             COMMENT 'new/following/converted/lost',
  assigned_to          INT UNSIGNED DEFAULT NULL              COMMENT '负责人=users.id',
  last_followed_at     DATETIME     DEFAULT NULL,
  created_at           DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_tenant_status (tenant_id, status),
  KEY idx_assigned      (assigned_to, status),
  KEY idx_tenant_level  (tenant_id, lead_level),
  KEY idx_customer_uid  (tenant_id, customer_platform_uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='线索';

-- ------------------------------------------------------------
-- 4. workorders — 工单
--    待人工处理的事项,按意图分四类
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workorders (
  id                  BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id           INT UNSIGNED NOT NULL,
  conversation_id     BIGINT UNSIGNED NOT NULL,
  lead_id             BIGINT UNSIGNED DEFAULT NULL,
  workorder_type      VARCHAR(16)  NOT NULL                   COMMENT 'inquiry/appointment/complaint/pricing',
  title               VARCHAR(255) DEFAULT NULL,
  payload             JSON         DEFAULT NULL               COMMENT '抽取的结构化字段',
  completeness_score  TINYINT UNSIGNED DEFAULT 0,
  missing_fields      JSON         DEFAULT NULL               COMMENT '缺失字段数组',
  suggestion          TEXT         DEFAULT NULL               COMMENT 'AI策略建议/报价建议',
  priority            TINYINT UNSIGNED DEFAULT 5              COMMENT '1最高-9最低',
  sla_due_at          DATETIME     DEFAULT NULL               COMMENT 'SLA截止时间',
  status              VARCHAR(16)  DEFAULT 'pending'          COMMENT 'pending/assigned/processing/done/cancelled',
  assigned_to         INT UNSIGNED DEFAULT NULL,
  assigned_at         DATETIME     DEFAULT NULL,
  completed_at        DATETIME     DEFAULT NULL,
  created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_tenant_status (tenant_id, status),
  KEY idx_tenant_type   (tenant_id, workorder_type),
  KEY idx_sla           (status, sla_due_at),
  KEY idx_assigned      (assigned_to, status),
  KEY idx_conversation  (conversation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工单';

-- ------------------------------------------------------------
-- 5. intent_rules — 意图识别规则
--    替代 chat_rpa 的 keyword_replies
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS intent_rules (
  id           INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id    INT UNSIGNED NOT NULL DEFAULT 0                COMMENT '0=全局规则,>0=企业自定义',
  intent_label VARCHAR(32)  NOT NULL                          COMMENT '命中后归入的意图',
  rule_type    VARCHAR(16)  NOT NULL DEFAULT 'keyword'        COMMENT 'keyword/regex',
  pattern      VARCHAR(255) NOT NULL                          COMMENT '关键词(竖线分隔)或正则',
  priority     INT          DEFAULT 100                       COMMENT '数字越小越先匹配',
  enabled      TINYINT      DEFAULT 1,
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tenant_enabled (tenant_id, enabled, priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='意图规则';

-- ------------------------------------------------------------
-- 6. price_table — 价格表
--    询价场景查询,结构化,不走LLM
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS price_table (
  id           INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id    INT UNSIGNED NOT NULL,
  city         VARCHAR(64)  NOT NULL,
  product_name VARCHAR(128) NOT NULL                          COMMENT '课程/项目名',
  hours        INT          DEFAULT NULL                      COMMENT '课时',
  price        DECIMAL(10,2) DEFAULT NULL,
  original_price DECIMAL(10,2) DEFAULT NULL,
  notes        VARCHAR(512) DEFAULT NULL,
  enabled      TINYINT      DEFAULT 1,
  created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_tenant_city (tenant_id, city, enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='价格表';

-- ------------------------------------------------------------
-- 7. tenant_llm_config — 企业 LLM 配置
--    替代 chat_rpa 的 ai 配置
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_llm_config (
  tenant_id            INT UNSIGNED PRIMARY KEY              COMMENT '=users.id',
  api_base             VARCHAR(255) NOT NULL                 COMMENT 'OpenAI兼容接口地址',
  api_key              VARCHAR(255) NOT NULL,
  model_name           VARCHAR(64)  NOT NULL                 COMMENT 'deepseek-chat/moonshot-v1-8k等',
  monthly_token_quota  BIGINT UNSIGNED DEFAULT 1000000       COMMENT '月度Token配额',
  monthly_token_used   BIGINT UNSIGNED DEFAULT 0             COMMENT '本月已用',
  quota_reset_at       DATE         DEFAULT NULL             COMMENT '上次重置日期',
  enabled              TINYINT      DEFAULT 1,
  created_at           DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='企业LLM配置';

-- ------------------------------------------------------------
-- 8. analysis_jobs — 分析任务队列
--    setImmediate worker 的持久化备份,重启可恢复
--    注:正常流转在内存queue,本表用于崩溃恢复和审计
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analysis_jobs (
  id              BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  tenant_id       INT UNSIGNED NOT NULL,
  message_id      BIGINT UNSIGNED NOT NULL,
  conversation_id BIGINT UNSIGNED NOT NULL,
  status          VARCHAR(16)  DEFAULT 'pending'             COMMENT 'pending/processing/done/failed',
  attempts        TINYINT UNSIGNED DEFAULT 0,
  last_error      VARCHAR(512) DEFAULT NULL,
  created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_status_created (status, created_at),
  KEY idx_message        (message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='分析任务队列';

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 初始化数据 (seed)
-- ============================================================

-- 全局意图规则种子 (tenant_id=0)
-- 优先级:投诉 > 问价 > 预约 > (其余走LLM或默认simple_inquiry)
INSERT INTO intent_rules (tenant_id, intent_label, rule_type, pattern, priority, enabled) VALUES
(0, 'complaint',     'keyword', '投诉|售后|退款|差评|举报|不满意|太差|垃圾|骗', 10, 1),
(0, 'price_inquiry', 'keyword', '多少钱|价格|费用|报价|怎么收费|收费标准|贵不贵|优惠|折扣', 20, 1),
(0, 'appointment',   'keyword', '预约|报名|约课|约个|什么时候|哪天|时间|地址|怎么去|报个名', 30, 1);

-- ============================================================
-- 复用表清单 (从 chat_rpa 迁移,不在本文件重建)
-- ============================================================
-- 以下表由 chat_rpa 复用,W1 阶段从 chat_rpa 的 init.sql / migration
-- 中提取对应建表语句,放入 server/sql/00_reused_tables.sql:
--   users                 账号 (tenant)
--   roles                 角色
--   role_has_permissions  RBAC
--   menus                 后台菜单
--   platforms             平台元数据
--   platform_pages        页面识别规则
--   plugins               用户-平台授权
--   configs               用户配置 (不再存AI配置)
-- ============================================================

-- ============================================================
-- 增量数据:V1.0.0 新增权限点与菜单 (示意,W1 落地)
-- ============================================================
-- 新增权限点 (具体表结构依 chat_rpa roles/permissions 设计):
--   conversation:list     会话查看
--   lead:manage           线索管理
--   workorder:handle      工单处理
--   workorder:assign      工单派单
--   intent-rule:config    意图规则配置
--   price:manage          价格表管理
--   llm:config            LLM配置
-- 新增后台菜单:
--   会话中心 / 线索中心 / 工单中心 / 运营分析 / 系统设置(意图规则/价格表/LLM)
-- ============================================================
