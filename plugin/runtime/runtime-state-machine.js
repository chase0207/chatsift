// TODO V2.0 改造: 见 MIGRATED_FROM_CHAT_RPA.md 第 1.2 节 / docs/prd/V2.0/runtime-disposition.md
;(function () {
  'use strict'

  // V1.9 RuntimeStateMachine（V1.9_Runtime_Protocol § 第六章）
  //
  // 设计原则：
  //   1. 禁止跨阶段跳转（例如 READING_MESSAGES 不能直接到 SENDING，必须经过 WAITING_STABLE / BUILDING_BATCH / DECIDING）
  //   2. 处于 SENDING/CONFIRMING/SYNCING 的实例不可被强制 STOPPED——只能等待自然结束或转为 ERROR
  //   3. 每次合法转换返回 { ok:true, from, to }；非法转换返回 { ok:false, reason }，调用方应记录 LK-ERROR

  var C = window.RpaConstants
  if (!C) throw new Error('[V19] RpaConstants must load before RuntimeStateMachine')

  var S = C.RuntimeState

  // 状态转换图：from → 允许的 to[]
  // STOPPED 是终态，无后继
  var TRANSITIONS = {}
  TRANSITIONS[S.IDLE]              = [S.SCANNING, S.STOPPED]
  TRANSITIONS[S.SCANNING]          = [S.SESSION_SWITCHING, S.IDLE, S.ERROR, S.STOPPED]
  TRANSITIONS[S.SESSION_SWITCHING] = [S.READING_MESSAGES, S.SCANNING, S.ERROR, S.STOPPED]
  TRANSITIONS[S.READING_MESSAGES]  = [S.WAITING_STABLE, S.ERROR, S.STOPPED]
  TRANSITIONS[S.WAITING_STABLE]    = [S.BUILDING_BATCH, S.READING_MESSAGES, S.ERROR, S.STOPPED]
  TRANSITIONS[S.BUILDING_BATCH]    = [S.DECIDING, S.ERROR, S.STOPPED]
  TRANSITIONS[S.DECIDING]          = [S.SENDING, S.SYNCING, S.ERROR, S.STOPPED]
  // SENDING / CONFIRMING / SYNCING：禁止 STOPPED，避免发送中被强制中断
  TRANSITIONS[S.SENDING]           = [S.CONFIRMING, S.ERROR]
  TRANSITIONS[S.CONFIRMING]        = [S.SYNCING, S.ERROR]
  TRANSITIONS[S.SYNCING]           = [S.IDLE, S.ERROR]
  TRANSITIONS[S.ERROR]             = [S.IDLE, S.STOPPED]
  TRANSITIONS[S.STOPPED]           = []

  function create(initial) {
    var current = initial || S.IDLE
    var listeners = []

    function canTransition(to) {
      var allowed = TRANSITIONS[current] || []
      return allowed.indexOf(to) >= 0
    }

    function transition(to, meta) {
      var from = current
      if (!canTransition(to)) {
        return { ok: false, from: from, to: to, reason: 'illegal-transition' }
      }
      current = to
      var event = { ok: true, from: from, to: to, meta: meta || null }
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](event) } catch (_) {}
      }
      return event
    }

    function onTransition(fn) {
      if (typeof fn === 'function') listeners.push(fn)
    }

    return {
      current:        function () { return current },
      canTransition:  canTransition,
      transition:     transition,
      onTransition:   onTransition,
    }
  }

  // 提供工具：判断某状态是否处于 "禁止中断" 区间（SENDING / CONFIRMING / SYNCING）
  // watchdog / stop 应据此决定是否强制清理
  function isCritical(state) {
    return state === S.SENDING || state === S.CONFIRMING || state === S.SYNCING
  }

  window.RpaRuntimeStateMachine = {
    create:      create,
    isCritical:  isCritical,
    TRANSITIONS: TRANSITIONS,
  }

})()
