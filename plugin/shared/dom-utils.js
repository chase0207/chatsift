;(function () {
  'use strict'

  // V1.9 Adapter 共享 DOM 工具。
  // 不复用 content_legacy 的工具函数（避免 V1.9 路径耦合 legacy）；这里独立实现。
  //
  // 设计原则：选择器候选数组顺序 = 稳定度降序，第一个命中即返回。

  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false
    var rect = el.getBoundingClientRect()
    if (!rect.width || !rect.height) return false
    var style = window.getComputedStyle ? window.getComputedStyle(el) : null
    if (style && (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0)) {
      return false
    }
    return true
  }

  function queryFirst(selectors, root) {
    root = root || document
    if (!selectors) return null
    var list = Array.isArray(selectors) ? selectors : [selectors]
    for (var i = 0; i < list.length; i++) {
      try {
        var el = root.querySelector(list[i])
        if (el) return el
      } catch (_) {}
    }
    return null
  }

  function queryAll(selectors, root) {
    root = root || document
    if (!selectors) return []
    var list = Array.isArray(selectors) ? selectors : [selectors]
    var result = []
    var seen = new WeakSet()
    for (var i = 0; i < list.length; i++) {
      try {
        var nodes = root.querySelectorAll(list[i])
        for (var j = 0; j < nodes.length; j++) {
          var n = nodes[j]
          if (!seen.has(n)) { seen.add(n); result.push(n) }
        }
      } catch (_) {}
    }
    return result
  }

  function getText(el) {
    if (!el) return ''
    return (el.textContent || '').replace(/ /g, ' ').trim()
  }

  function getAttr(el, names) {
    if (!el || !el.getAttribute) return null
    var list = Array.isArray(names) ? names : [names]
    for (var i = 0; i < list.length; i++) {
      var v = el.getAttribute(list[i])
      if (v) return v
    }
    return null
  }

  // 等待一个谓词为真（用于等待 DOM 变化），返回 Promise<true|false>
  function waitFor(predicate, opts) {
    opts = opts || {}
    var timeoutMs = opts.timeoutMs || 3000
    var intervalMs = opts.intervalMs || 100
    var start = Date.now()
    return new Promise(function (resolve) {
      function tick() {
        try {
          if (predicate()) return resolve(true)
        } catch (_) {}
        if (Date.now() - start >= timeoutMs) return resolve(false)
        setTimeout(tick, intervalMs)
      }
      tick()
    })
  }

  // 模拟用户级输入：兼容 React/Vue 受控组件
  function setInputValue(el, value) {
    if (!el) return false
    try {
      var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')
      var inputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
      var nativeSetter = (el.tagName === 'TEXTAREA') ? (setter && setter.set) : (inputSetter && inputSetter.set)
      if (nativeSetter) nativeSetter.call(el, value)
      else el.value = value
      el.dispatchEvent(new Event('input',  { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    } catch (_) {
      el.value = value
      return true
    }
  }

  function simulateClick(el) {
    if (!el) return false
    try {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true }))
      el.dispatchEvent(new MouseEvent('click',     { bubbles: true }))
      return true
    } catch (_) {
      try { el.click() } catch (__) {}
      return false
    }
  }

  // 同步抓快照（用于 detectSessions 内部辅助）
  function readRect(el) {
    if (!el || !el.getBoundingClientRect) return null
    var r = el.getBoundingClientRect()
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
  }

  window.RpaDomUtils = {
    isVisible:       isVisible,
    queryFirst:      queryFirst,
    queryAll:        queryAll,
    getText:         getText,
    getAttr:         getAttr,
    waitFor:         waitFor,
    setInputValue:   setInputValue,
    simulateClick:   simulateClick,
    readRect:        readRect,
  }

})()
