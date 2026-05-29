;(function () {
  'use strict'

  // V1.9 统一日志器。
  // 仅做 console 输出格式化，不上报服务端（上报由 lk-tracer 负责）。
  // 设计目的：让 V1.9 路径的日志在 DevTools 中容易被一眼识别，方便和 V1.x legacy 日志区分。

  var DEBUG_DEFAULT = false   // V1.9 默认关闭 debug，避免污染 console；通过 setDebug 打开

  var _state = {
    debug: DEBUG_DEFAULT,
  }

  function _ts() {
    var d = new Date()
    var pad = function (n) { return n < 10 ? '0' + n : n }
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()) + '.' + String(d.getMilliseconds()).padStart(3, '0')
  }

  function _fmt(tag) {
    return '[V19][' + _ts() + '][' + (tag || '?') + ']'
  }

  function info(tag) {
    var args = Array.prototype.slice.call(arguments, 1)
    console.log.apply(console, [_fmt(tag)].concat(args))
  }
  function warn(tag) {
    var args = Array.prototype.slice.call(arguments, 1)
    console.warn.apply(console, [_fmt(tag)].concat(args))
  }
  function error(tag) {
    var args = Array.prototype.slice.call(arguments, 1)
    console.error.apply(console, [_fmt(tag)].concat(args))
  }
  function debug(tag) {
    if (!_state.debug) return
    var args = Array.prototype.slice.call(arguments, 1)
    console.log.apply(console, [_fmt(tag) + '[DEBUG]'].concat(args))
  }

  function setDebug(on) { _state.debug = !!on }
  function isDebug() { return _state.debug }

  window.RpaLogger = {
    info:     info,
    warn:     warn,
    error:    error,
    debug:    debug,
    setDebug: setDebug,
    isDebug:  isDebug,
  }

})()
