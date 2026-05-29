;(function () {
  'use strict'

  // V1.9 Runtime Protocol 全局常量。
  // 任何模块（runtime/* / adapters/**）需要状态、LK 编码或默认配置时，统一从这里读取。
  // 禁止在其他文件直接定义重复的状态名或 LK 编码，避免协议漂移。

  // ── RuntimeStateMachine 状态枚举（V1.9_Runtime_Protocol § Runtime State Machine）─
  var RuntimeState = {
    IDLE:                'IDLE',
    SCANNING:            'SCANNING',
    SESSION_SWITCHING:   'SESSION_SWITCHING',
    READING_MESSAGES:    'READING_MESSAGES',
    WAITING_STABLE:      'WAITING_STABLE',
    BUILDING_BATCH:      'BUILDING_BATCH',
    DECIDING:            'DECIDING',
    SENDING:             'SENDING',
    CONFIRMING:          'CONFIRMING',
    SYNCING:             'SYNCING',
    ERROR:               'ERROR',
    STOPPED:             'STOPPED',
  }

  // ── LK 节点编码（统一方案：9 组，权威定义见 docs/prd/V1.9/V1.9_Runtime_Protocol.md § LK Protocol）─
  // 注意：部分常量 key 沿用历史命名（如 RUNTIME_LOCK），但其【值】已按统一分层重编号。
  // 排障一律以字符串值（落库到 runtime_logs.lk_code）为准，不要以 key 名判断层级。
  // 标 "（未发射）" 的为新增占位节点：本轮只定义不埋点，待后续 Tier1/2 补 Tracer.log。
  var LK = {
    // ── 1. Bootstrap ──
    BOOT_INIT:            'LK-BOOT-01',   // runtime_bootstrap（← 原 RUNTIME_INIT，start/resume）
    BOOT_PLUGIN_ATTACH:   'LK-BOOT-02',   // plugin_attach（未发射）
    BOOT_STORAGE_RESTORE: 'LK-BOOT-03',   // storage_restore（未发射）
    RUNTIME_LOCK:         'LK-BOOT-04',   // runtime_lock（← 原 LK-RUNTIME-02）
    BOOT_OBSERVER_INIT:   'LK-BOOT-05',   // observer_init（未发射）

    // ── 2. Environment（整层未发射，逻辑现走 content_legacy） ──
    ENV_DETECT_PLATFORM:    'LK-ENV-01',  // detect_platform（未发射）
    ENV_DETECT_PAGE:        'LK-ENV-02',  // detect_page（未发射）
    ENV_DETECT_IFRAME:      'LK-ENV-03',  // detect_iframe（未发射）
    ENV_DETECT_SHADOW_ROOT: 'LK-ENV-04',  // detect_shadow_root（未发射，逻辑也缺）
    ENV_BUILD_DOM_CONTEXT:  'LK-ENV-05',  // build_dom_context（未发射）
    ENV_ADAPTER_ATTACH:     'LK-ENV-06',  // adapter_attach（未发射）
    ENV_CONTEXT_READY:      'LK-ENV-07',  // runtime_context_ready（未发射）

    // ── 3. Session ──
    SESSION_LIST:       'LK-SESSION-01',
    SESSION_TRIGGER:    'LK-SESSION-02',  // 已定义未发射，待补埋点
    SESSION_SWITCH:     'LK-SESSION-03',
    SESSION_ACTIVE:     'LK-SESSION-04',  // 已定义未发射，待补埋点
    SESSION_IDENTITY:   'LK-SESSION-05',  // build_session_identity（未发射）
    SESSION_STABLE_WAIT:'LK-SESSION-06',  // session_stable_wait（未发射）

    // ── 4. Message ──
    MSG_CONTAINER:      'LK-MSG-01',      // 已定义未发射，待补埋点
    MSG_SCAN:           'LK-MSG-02',
    MSG_CLASSIFY:       'LK-MSG-03',      // 已定义未发射，待补埋点
    MSG_SORT:           'LK-MSG-04',      // 已定义未发射，待补埋点
    MSG_STABLE_WAIT:    'LK-MSG-05',
    MSG_BATCH_BUILD:    'LK-MSG-06',
    MSG_DEDUP:          'LK-MSG-07',      // deduplicate_messages（未发射）
    MSG_OWNER:          'LK-MSG-08',      // detect_message_owner（未发射）
    MSG_TYPE:           'LK-MSG-09',      // detect_message_type（未发射）

    // ── 5. Decision（决策现走 legacy decideReply，runtime 未接管） ──
    DECISION_PROMPT:    'LK-DECISION-01',
    DECISION_KEYWORD:   'LK-DECISION-02',
    DECISION_INTENT:    'LK-DECISION-03',  // intent_detect（未实现）
    DECISION_GOAL:      'LK-DECISION-04',  // goal_check（未实现）
    DECISION_AI_REQ:    'LK-DECISION-05',  // ← 原 LK-DECISION-03
    DECISION_AI_RESP:   'LK-DECISION-06',  // ← 原 LK-DECISION-04
    DECISION_GAP_ACTION:'LK-DECISION-07',  // build_gap_action（未实现）

    // ── 6. Send ──
    SEND_PRECHECK:      'LK-SEND-01',
    SEND_LOCATE_INPUT:  'LK-SEND-02',  // locate_textarea（未发射）
    SEND_INPUT:         'LK-SEND-03',  // input_message（已定义未发射，待补埋点）
    SEND_LOCATE_BUTTON: 'LK-SEND-04',  // locate_send_button（未发射）
    SEND_CLICK:         'LK-SEND-05',  // ← 原 LK-SEND-03
    SEND_CONFIRM:       'LK-SEND-06',  // ← 原 LK-SEND-04（含自气泡判定，合并附件 05+06）
    SEND_TIMEOUT:       'LK-SEND-07',  // send_timeout（未发射）

    // ── 7. Sync ──
    SYNC_RUNTIME_LOG:   'LK-SYNC-01',  // 已定义未发射，待补埋点
    SYNC_MESSAGE:       'LK-SYNC-02',  // 已定义未发射，待补埋点
    SYNC_BATCH_FINAL:   'LK-SYNC-03',

    // ── 8. Recovery ──
    RUNTIME_HEARTBEAT:  'LK-RECOVERY-01',  // watchdog_heartbeat（← 原 LK-RUNTIME-03）
    RUNTIME_WATCHDOG:   'LK-RECOVERY-02',  // detect_runtime_stall（← 原 LK-RUNTIME-WATCHDOG）
    RECOVERY_RUNTIME:   'LK-RECOVERY-03',  // recover_runtime（← 原 RUNTIME_INIT @ recovery-manager）
    RECOVERY_QUEUE:     'LK-RECOVERY-04',  // restore_queue（未发射）
    RECOVERY_BATCH:     'LK-RECOVERY-05',  // restore_batch（未发射）
    RUNTIME_CLEANUP:    'LK-RECOVERY-06',  // cleanup_observer（← 原 LK-RUNTIME-04）

    // ── 9. Error（跨层横切） ──
    ERR_DOM_MISSING:    'LK-ERROR-01',
    ERR_SEND_FAILED:    'LK-ERROR-02',
    ERR_AI_TIMEOUT:     'LK-ERROR-03',  // 已定义未发射，待补埋点
    ERR_DUPLICATE:      'LK-ERROR-04',

    // ── 横切特殊标记（不参与层内编号） ──
    RUNTIME_STATE:      'LK-STATE',           // 状态机迁移（← 原 LK-RUNTIME-STATE）
    CHAOS_VIOLATION:    'LK-CHAOS-VIOLATION',  // chaos 不变量哨兵
  }

  var Stage = {
    RUNTIME:  'runtime',
    SESSION:  'session',
    MESSAGE:  'message',
    DECISION: 'decision',
    SEND:     'send',
    SYNC:     'sync',
    ERROR:    'error',
  }

  var Status = {
    SUCCESS: 'success',
    FAILED:  'failed',
    SKIPPED: 'skipped',
    WARNING: 'warning',
  }

  // ── Feature Flag 默认值（在 runtime-config 未返回 experimental 字段时兜底） ─
  // 全部默认 false。解锁路径见 runtime/feature-flags.js。
  // 二级 send_runtime_v19 锁住整个发送链路（sendReply / confirmReply / prepareReply / sendInBatch）。
  var FeatureFlagDefaults = {
    runtime_v19:        false,   // V1.9 Runtime 启动总开关
    send_runtime_v19:   false,   // V1.9-M4 发送链路总开关（最高风险）
    batch_protocol_v2:  false,
    adapter_layer_v19:  false,
    send_confirm_v19:   false,
    watchdog_v19:       false,
  }

  // ── 协议常量（V1.9_Runtime_Protocol 关键阈值，便于集中调整） ─────────
  var Protocol = {
    LK_BUFFER_MAX:       100,    // 内存缓存的 LK 条数，超过即刷盘
    LK_FLUSH_INTERVAL:   3000,   // 自动 flush 间隔（ms）
    LK_BATCH_MAX:        200,    // 单次上送服务端的最大条数
  }

  window.RpaConstants = {
    RuntimeState:         RuntimeState,
    LK:                   LK,
    Stage:                Stage,
    Status:               Status,
    FeatureFlagDefaults:  FeatureFlagDefaults,
    Protocol:             Protocol,
  }

})()
