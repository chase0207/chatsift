;(function () {
  'use strict'

  // diff-engine.js — 四信号新消息判定（ADR-005 依赖 session_id 稳定）
  //
  // 四信号（全部来自 SessionSnapshot 字段）:
  //   1. last_message_text 变化
  //   2. last_timestamp    变化
  //   3. unread_count      增加
  //   4. processed         = false（本轮未处理）
  //
  // 设计原则:
  //   - 四信号任意一个命中即判定 hasNew=true
  //   - 自己回复成功后必须立即标记 processed=true，避免 AI 回复被误判为新消息
  //   - unstable session_id（L3 兜底）命中时降低置信度，仅打日志，不自动回复

  // ── DiffResult 结构 ───────────────────────────────────────────────
  // {
  //   hasNew:     boolean
  //   signals:    string[]   — 命中的信号名列表
  //   confidence: 'high' | 'low'   — unstable 时为 low
  // }

  function diff(prev, curr) {
    if (!curr) return { hasNew: false, signals: [], confidence: 'high' }

    // 首次出现（无历史快照）
    if (!prev) {
      var firstSignals = []
      if (curr.unread_count > 0) firstSignals.push('unread_count:new')
      if (curr.last_message_text) firstSignals.push('last_message:new')
      return {
        hasNew:     firstSignals.length > 0,
        signals:    firstSignals,
        confidence: curr.unstable ? 'low' : 'high',
      }
    }

    var signals = []

    // 信号 1: 消息文本变化
    if (curr.last_message_text && curr.last_message_text !== prev.last_message_text) {
      signals.push('last_message:changed')
    }

    // 信号 2: 时间戳变化
    if (curr.last_timestamp && curr.last_timestamp !== prev.last_timestamp) {
      signals.push('last_timestamp:changed')
    }

    // 信号 3: 未读数增加
    if (curr.unread_count > prev.unread_count) {
      signals.push('unread_count:increased')
    }

    // 信号 4: 当前快照未标记已处理
    if (!curr.processed) {
      signals.push('processed:false')
    }

    var hasNew     = signals.length > 0
    var confidence = curr.unstable ? 'low' : 'high'

    if (hasNew && confidence === 'low') {
      console.warn('[DiffEngine] 命中但 session_id 不稳定（L3）:', curr.session_id, signals)
    }

    return { hasNew: hasNew, signals: signals, confidence: confidence }
  }

  // 发送成功后调用，防止 AI 自己的回复被误判为新消息
  // snapshot: SessionSnapshot 引用，直接修改 processed 和 last_message_text
  function markReplied(snapshot, replyText) {
    if (!snapshot) return
    snapshot.processed        = true
    snapshot.last_message_text = replyText || snapshot.last_message_text
  }

  window.RpaDiffEngine = {
    diff:        diff,
    markReplied: markReplied,
  }

})()
