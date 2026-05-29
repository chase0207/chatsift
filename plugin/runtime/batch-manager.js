// TODO V2.0 改造: 见 MIGRATED_FROM_CHAT_RPA.md 第 1.2 节 / docs/prd/V2.0/runtime-disposition.md
;(function () {
  'use strict'

  // V1.9 BatchManager（V1.9_Runtime_Protocol § 第三章 + V1.9_技术方案 § 8）
  //
  // 职责：管理"一次完整对话处理"的生命周期。
  //   ⚠ batch 不是消息列表，而是【这一轮处理任务】。
  //   一个 batch 可能包含多条用户连续消息、一次决策、一次发送、一次确认。
  //
  // batchId 与 batch_hash 的区分：
  //   - batchId   = fnv64(session_id + first_inbound_text + first_timestamp)
  //                 唯一标识"哪一轮对话",同一轮内不变,合并消息时 batch_hash 会变但 batchId 不变
  //   - batch_hash= fnv64(session_id + 所有用户消息内容拼接 + 所有时间戳拼接)
  //                 去重指纹,用于服务端唯一约束 (platform+pageKey+session_id+batch_hash)
  //
  // ⚠ Caller 约束：
  //   session_id 必须全局唯一。生产路径由 SessionIdentityResolver 派生，
  //   resolver 内部 fnv64(platform | pageKey | account | userKey) 已含 platform，
  //   因此同一 user 跨平台拿到的 session_id 必然不同 → batchId 也不会跨平台碰撞。
  //   如果调用方手工构造 session_id 字面值，跨平台传同字符串会导致 _byId 覆盖。
  //   该场景在生产路径不应出现，单元测试若需要请用 resolver 派生。
  //
  // M2 范围：本地状态机 + 唯一约束去重，不负责消息聚合时机（stable_wait 在 M4）。

  var C      = window.RpaConstants
  var Hash   = window.RpaHash
  var Tracer = window.RpaLkTracer
  var Logger = window.RpaLogger
  if (!C || !Hash || !Tracer || !Logger) {
    throw new Error('[V19] BatchManager dependencies missing')
  }

  var LK     = C.LK
  var Stage  = C.Stage
  var Status = C.Status

  // batch 状态机
  var BatchStatus = {
    NEW:          'NEW',
    COLLECTING:   'COLLECTING',
    STABLE_WAIT:  'STABLE_WAIT',
    DECIDING:     'DECIDING',
    SENDING:      'SENDING',
    CONFIRMING:   'CONFIRMING',
    SYNCING:      'SYNCING',
    DONE:         'DONE',
    FAILED:       'FAILED',
    ABORTED:      'ABORTED',
  }

  // 允许的状态转换
  var TRANS = {}
  TRANS[BatchStatus.NEW]         = [BatchStatus.COLLECTING, BatchStatus.ABORTED]
  TRANS[BatchStatus.COLLECTING]  = [BatchStatus.STABLE_WAIT, BatchStatus.ABORTED, BatchStatus.FAILED]
  TRANS[BatchStatus.STABLE_WAIT] = [BatchStatus.DECIDING, BatchStatus.COLLECTING, BatchStatus.ABORTED, BatchStatus.FAILED]
  TRANS[BatchStatus.DECIDING]    = [BatchStatus.SENDING, BatchStatus.SYNCING, BatchStatus.FAILED, BatchStatus.ABORTED]
  TRANS[BatchStatus.SENDING]     = [BatchStatus.CONFIRMING, BatchStatus.FAILED]
  TRANS[BatchStatus.CONFIRMING]  = [BatchStatus.SYNCING, BatchStatus.FAILED]
  TRANS[BatchStatus.SYNCING]     = [BatchStatus.DONE, BatchStatus.FAILED]
  TRANS[BatchStatus.DONE]        = []
  TRANS[BatchStatus.FAILED]      = [BatchStatus.ABORTED]
  TRANS[BatchStatus.ABORTED]     = []

  function isTerminal(status) {
    return status === BatchStatus.DONE || status === BatchStatus.ABORTED || status === BatchStatus.FAILED
  }

  // ── 内存索引 ────────────────────────────────────────────────────
  // _byId:   batchId    → batch object
  // _byUniq: uniqKey    → batchId       （uniqKey = platform|pageKey|session_id|batch_hash）
  // 双索引便于 reload 后从 uniq 去重
  var _byId   = Object.create(null)
  var _byUniq = Object.create(null)

  function _uniqKey(b) {
    return [b.platform, b.pageKey, b.session_id, b.batch_hash].join('|')
  }

  function _computeBatchId(session_id, firstInbound) {
    var first = firstInbound || {}
    return Hash.joinAndHash([session_id, first.content || '', first.timestamp || ''], Hash.fnv64)
  }

  function _computeBatchHash(session_id, inbounds) {
    var contents = (inbounds || []).map(function (m) { return m.content || '' }).join('|')
    var times    = (inbounds || []).map(function (m) { return m.timestamp || '' }).join('|')
    return Hash.joinAndHash([session_id, contents, times], Hash.fnv64)
  }

  // 创建 batch；如果同 uniqKey 已存在并且未结束，返回旧 batch（实现幂等）
  function create(opts) {
    opts = opts || {}
    if (!opts.platform || !opts.pageKey || !opts.session_id) {
      throw new Error('[V19] BatchManager.create requires platform/pageKey/session_id')
    }
    var inbounds = Array.isArray(opts.inbound_messages) ? opts.inbound_messages : []
    var batch_id   = opts.batch_id   || _computeBatchId(opts.session_id, inbounds[0])
    var batch_hash = opts.batch_hash || _computeBatchHash(opts.session_id, inbounds)

    var probe = {
      platform:   opts.platform,
      pageKey:    opts.pageKey,
      session_id: opts.session_id,
      batch_hash: batch_hash,
    }
    var uniq = _uniqKey(probe)

    var existing = _byUniq[uniq] && _byId[_byUniq[uniq]]
    if (existing && !isTerminal(existing.status)) {
      Logger.info('BatchManager', 'create returned existing batch', existing.batch_id)
      return existing
    }
    if (existing && isTerminal(existing.status)) {
      // 已完成的 batch 不允许重新激活，避免 reload 重复处理
      Tracer.log({
        lk_code:   LK.ERR_DUPLICATE,
        stage:     Stage.MESSAGE,
        status:    Status.WARNING,
        message:   'duplicate batch rejected (already terminal)',
        batchId:   existing.batch_id,
        session_id: existing.session_id,
        detail:    { existingStatus: existing.status, uniq: uniq },
      })
      return null
    }

    var batch = {
      batch_id:        batch_id,
      batch_hash:      batch_hash,
      platform:        opts.platform,
      pageKey:         opts.pageKey,
      session_id:      opts.session_id,
      status:          BatchStatus.NEW,
      inbound_messages: inbounds.slice(),
      outbound_messages: [],
      decision_source: null,
      send_confirm_status: null,
      first_message_at: inbounds[0] && inbounds[0].timestamp || null,
      last_message_at:  inbounds.length ? inbounds[inbounds.length - 1].timestamp || null : null,
      created_at:      Date.now(),
      updated_at:      Date.now(),
    }
    _byId[batch_id]   = batch
    _byUniq[uniq]     = batch_id

    Tracer.log({
      lk_code:   LK.MSG_BATCH_BUILD,
      stage:     Stage.MESSAGE,
      status:    Status.SUCCESS,
      message:   'batch created',
      batchId:   batch_id,
      session_id: opts.session_id,
      detail:    { inbound: inbounds.length, batch_hash: batch_hash },
    })
    return batch
  }

  function get(batch_id) {
    return _byId[batch_id] || null
  }

  // 状态机迁移
  function transition(batch_id, to, meta) {
    var batch = _byId[batch_id]
    if (!batch) return { ok: false, reason: 'batch not found' }
    var allowed = TRANS[batch.status] || []
    if (allowed.indexOf(to) < 0) {
      Tracer.log({
        lk_code:   LK.ERR_DUPLICATE,
        stage:     Stage.MESSAGE,
        status:    Status.FAILED,
        message:   'illegal batch transition: ' + batch.status + ' → ' + to,
        batchId:   batch_id,
        session_id: batch.session_id,
        detail:    { from: batch.status, to: to, meta: meta || null },
      })
      return { ok: false, from: batch.status, to: to, reason: 'illegal-transition' }
    }
    var from = batch.status
    batch.status = to
    batch.updated_at = Date.now()
    if (meta && meta.decision_source) batch.decision_source = meta.decision_source
    if (meta && meta.send_confirm_status) batch.send_confirm_status = meta.send_confirm_status

    Tracer.log({
      lk_code:   to === BatchStatus.DONE ? LK.SYNC_BATCH_FINAL : LK.MSG_BATCH_BUILD,
      stage:     Stage.MESSAGE,
      status:    Status.SUCCESS,
      message:   'batch ' + from + ' → ' + to,
      batchId:   batch_id,
      session_id: batch.session_id,
      detail:    { from: from, to: to, meta: meta || null },
    })
    return { ok: true, from: from, to: to }
  }

  // 合并新的入站消息到现有 batch；batch_hash 会重算并迁移到新 uniq
  function mergeInbound(batch_id, messages) {
    var batch = _byId[batch_id]
    if (!batch) return null
    if (isTerminal(batch.status)) return null

    var oldUniq = _uniqKey(batch)
    batch.inbound_messages = batch.inbound_messages.concat(messages || [])
    batch.last_message_at = (messages && messages.length)
      ? (messages[messages.length - 1].timestamp || batch.last_message_at)
      : batch.last_message_at
    batch.batch_hash = _computeBatchHash(batch.session_id, batch.inbound_messages)
    batch.updated_at = Date.now()

    var newUniq = _uniqKey(batch)
    if (oldUniq !== newUniq) {
      delete _byUniq[oldUniq]
      _byUniq[newUniq] = batch_id
    }
    return batch
  }

  function recordOutbound(batch_id, message) {
    var batch = _byId[batch_id]
    if (!batch) return null
    batch.outbound_messages.push(message)
    batch.updated_at = Date.now()
    return batch
  }

  function setConfirm(batch_id, confirmStatus) {
    var batch = _byId[batch_id]
    if (!batch) return null
    batch.send_confirm_status = confirmStatus
    batch.updated_at = Date.now()
    return batch
  }

  function abort(batch_id, reason) {
    var batch = _byId[batch_id]
    if (!batch) return false
    if (isTerminal(batch.status)) return false
    return transition(batch_id, BatchStatus.ABORTED, { reason: reason }).ok
  }

  // 用于 RecoveryManager 重建索引
  function rehydrate(batchList) {
    if (!Array.isArray(batchList)) return 0
    var n = 0
    batchList.forEach(function (b) {
      if (!b || !b.batch_id) return
      _byId[b.batch_id]   = b
      _byUniq[_uniqKey(b)] = b.batch_id
      n++
    })
    return n
  }

  function snapshot() {
    var arr = []
    for (var k in _byId) {
      if (Object.prototype.hasOwnProperty.call(_byId, k)) arr.push(_byId[k])
    }
    return arr
  }

  function reset() {
    _byId   = Object.create(null)
    _byUniq = Object.create(null)
  }

  // ── M4: stable_wait ─────────────────────────────────────────────
  // 等待 batch 的 inbound_messages 在 stableMs 内不再新增。
  // 调用方：M4 RuntimeManager 在 BUILDING_BATCH 前等待消息稳定。
  //
  // refetchMessages: 函数 → 返回当前页面用户侧消息数组（adapter.getMessages 过滤 inbound）
  //                  传入则会进入主动拉取模式；否则只等待外部 mergeInbound 触发
  // stableMs:        消息不增量持续多久视为稳定（默认 1500ms）
  // maxWaitMs:       总等待上限（避免饥饿，默认 8000ms）
  function stableWait(batch_id, opts) {
    opts = opts || {}
    var stableMs  = opts.stableMs  || 1500
    var maxWaitMs = opts.maxWaitMs || 8000
    var intervalMs = opts.intervalMs || 200
    var refetch   = typeof opts.refetchMessages === 'function' ? opts.refetchMessages : null
    var start     = Date.now()
    var batch     = _byId[batch_id]
    if (!batch) return Promise.resolve({ stable: false, reason: 'batch-missing' })

    var lastCount = batch.inbound_messages.length
    var lastChangeAt = Date.now()

    Tracer.log({
      lk_code: LK.MSG_STABLE_WAIT, stage: Stage.MESSAGE, status: Status.SUCCESS,
      batchId: batch_id, session_id: batch.session_id,
      message: 'stable_wait started',
      detail:  { stableMs: stableMs, maxWaitMs: maxWaitMs, initialCount: lastCount },
    })

    return new Promise(function (resolve) {
      function _tick() {
        var b = _byId[batch_id]
        if (!b) return resolve({ stable: false, reason: 'batch-disappeared' })

        // 主动拉取：如果 adapter 提供 refetchMessages，每轮调用合并
        if (refetch) {
          try {
            var fresh = refetch() || []
            if (fresh.length > b.inbound_messages.length) {
              var newOnes = fresh.slice(b.inbound_messages.length)
              mergeInbound(batch_id, newOnes)
            }
          } catch (_) {}
        }

        b = _byId[batch_id]
        var curCount = b.inbound_messages.length
        if (curCount !== lastCount) {
          lastCount = curCount
          lastChangeAt = Date.now()
        }

        var sinceChange = Date.now() - lastChangeAt
        if (sinceChange >= stableMs) {
          Tracer.log({
            lk_code: LK.MSG_STABLE_WAIT, stage: Stage.MESSAGE, status: Status.SUCCESS,
            batchId: batch_id, session_id: b.session_id,
            message: 'stable_wait satisfied',
            detail:  { count: curCount, sinceChange: sinceChange },
          })
          return resolve({ stable: true, count: curCount })
        }

        if (Date.now() - start >= maxWaitMs) {
          Tracer.log({
            lk_code: LK.MSG_STABLE_WAIT, stage: Stage.MESSAGE, status: Status.WARNING,
            batchId: batch_id, session_id: b.session_id,
            message: 'stable_wait timeout',
            detail:  { count: curCount, waited: Date.now() - start },
          })
          return resolve({ stable: false, reason: 'max-wait-exceeded', count: curCount })
        }
        setTimeout(_tick, intervalMs)
      }
      _tick()
    })
  }

  // ── M4: 公开的"上报到服务端"辅助 ─────────────────────────────────
  // 把 batch 当前快照通过 chrome.runtime.sendMessage('V19_BATCH_UPSERT') 转发到 background
  // 调用方：RuntimeManager 在状态机迁移到 DECIDING / DONE / FAILED 时主动触发
  function finalizeRemote(batch_id) {
    var batch = _byId[batch_id]
    if (!batch) return Promise.resolve({ ok: false, error: 'batch-missing' })
    if (typeof chrome === 'undefined' || !chrome.runtime) return Promise.resolve({ ok: false, error: 'no-chrome' })

    var payload = {
      batch_id:           batch.batch_id,
      batch_hash:         batch.batch_hash,
      platform:           batch.platform,
      page_key:           batch.pageKey,
      session_id:         batch.session_id,
      status:             batch.status,
      inbound_count:      batch.inbound_messages.length,
      outbound_count:     batch.outbound_messages.length,
      first_message_at:   batch.first_message_at,
      last_message_at:    batch.last_message_at,
      decision_source:    batch.decision_source,
      send_confirm_status: batch.send_confirm_status,
    }
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage({ action: 'V19_BATCH_UPSERT', batch: payload }, function (resp) {
          resolve(resp || { ok: false })
        })
      } catch (err) {
        resolve({ ok: false, error: (err && err.message) || 'send-failed' })
      }
    })
  }

  window.RpaBatchManager = {
    BatchStatus:      BatchStatus,
    TRANSITIONS:      TRANS,
    isTerminal:       isTerminal,
    create:           create,
    get:              get,
    transition:       transition,
    mergeInbound:     mergeInbound,
    recordOutbound:   recordOutbound,
    setConfirm:       setConfirm,
    abort:            abort,
    rehydrate:        rehydrate,
    snapshot:         snapshot,
    reset:            reset,
    // M4
    stableWait:       stableWait,
    finalizeRemote:   finalizeRemote,
  }

})()
