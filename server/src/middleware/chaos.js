/**
 * V1.9-QA Chaos 注入中间件
 *
 * 用于 Item 7 QA-4 Send Chaos / QA-5 Watchdog Chaos / QA-6 网络失败测试。
 *
 * 工作原理：
 *   每个请求进来时，检查 _chaosState 是否有针对该 path 的注入规则。
 *   命中规则按 ratio 随机决定是否生效：
 *     - delay: 等待 delay_ms 后才转交下一个 middleware
 *     - failure: 直接返回指定错误码 + 错误信息
 *     - drop: 不响应（模拟网络丢包，超时由客户端处理）
 *
 * 安全：
 *   仅 NODE_ENV !== 'production' 时挂载（在 app.js 控制）。
 *   即使误启用到 prod，所有规则默认空数组，需要显式 POST 才能注入。
 */

'use strict'

// 内存状态。重启清空。
const _chaosState = {
  rules: [],   // { id, endpoint(regex), action: 'delay'|'failure'|'drop', delay_ms?, error_code?, error_message?, ratio, hit_count, created_at }
  enabled: false,
}

let _ruleId = 0

function isProduction() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production'
}

function _matchEndpoint(endpoint, requestPath) {
  if (!endpoint) return true
  try {
    return new RegExp(endpoint).test(requestPath)
  } catch (_) {
    return endpoint === requestPath
  }
}

function _pickRule(requestPath) {
  if (!_chaosState.enabled) return null
  for (const rule of _chaosState.rules) {
    if (!_matchEndpoint(rule.endpoint, requestPath)) continue
    if (Math.random() < rule.ratio) {
      rule.hit_count++
      return rule
    }
  }
  return null
}

// Express middleware
function chaosMiddleware(req, res, next) {
  // 不影响 chaos 控制端点自身
  if (req.path && req.path.indexOf('/_chaos') >= 0) return next()

  const rule = _pickRule(req.path)
  if (!rule) return next()

  const action = rule.action
  if (action === 'delay') {
    return setTimeout(next, rule.delay_ms)
  }
  if (action === 'failure') {
    return res.status(rule.error_code || 500).json({
      code:    rule.error_code || 500,
      message: rule.error_message || 'chaos-injected failure',
      _chaos:  { rule_id: rule.id, hit_count: rule.hit_count },
    })
  }
  if (action === 'drop') {
    // 不调 next，不响应 → 客户端会超时
    return
  }
  next()
}

// 控制 API（仅 dev）
function injectDelay(req, res) {
  const { endpoint, delay_ms, ratio } = req.body || {}
  if (!endpoint) return res.status(400).json({ code: 400, message: 'endpoint required' })
  const rule = {
    id:         ++_ruleId,
    endpoint:   endpoint,
    action:     'delay',
    delay_ms:   parseInt(delay_ms, 10) || 1000,
    ratio:      typeof ratio === 'number' ? Math.max(0, Math.min(1, ratio)) : 1.0,
    hit_count:  0,
    created_at: new Date().toISOString(),
  }
  _chaosState.rules.push(rule)
  _chaosState.enabled = true
  res.json({ code: 0, data: rule })
}

function injectFailure(req, res) {
  const { endpoint, error_code, error_message, ratio } = req.body || {}
  if (!endpoint) return res.status(400).json({ code: 400, message: 'endpoint required' })
  const rule = {
    id:            ++_ruleId,
    endpoint:      endpoint,
    action:        'failure',
    error_code:    parseInt(error_code, 10) || 500,
    error_message: error_message || 'chaos-injected failure',
    ratio:         typeof ratio === 'number' ? Math.max(0, Math.min(1, ratio)) : 1.0,
    hit_count:     0,
    created_at:    new Date().toISOString(),
  }
  _chaosState.rules.push(rule)
  _chaosState.enabled = true
  res.json({ code: 0, data: rule })
}

function injectDrop(req, res) {
  const { endpoint, ratio } = req.body || {}
  if (!endpoint) return res.status(400).json({ code: 400, message: 'endpoint required' })
  const rule = {
    id:         ++_ruleId,
    endpoint:   endpoint,
    action:     'drop',
    ratio:      typeof ratio === 'number' ? Math.max(0, Math.min(1, ratio)) : 1.0,
    hit_count:  0,
    created_at: new Date().toISOString(),
  }
  _chaosState.rules.push(rule)
  _chaosState.enabled = true
  res.json({ code: 0, data: rule })
}

function listRules(req, res) {
  res.json({ code: 0, data: { enabled: _chaosState.enabled, rules: _chaosState.rules } })
}

function clearRules(req, res) {
  const removed = _chaosState.rules.length
  _chaosState.rules = []
  _chaosState.enabled = false
  _ruleId = 0
  res.json({ code: 0, data: { removed: removed } })
}

function removeRule(req, res) {
  const id = parseInt(req.params.id, 10)
  const before = _chaosState.rules.length
  _chaosState.rules = _chaosState.rules.filter(r => r.id !== id)
  if (_chaosState.rules.length === 0) _chaosState.enabled = false
  res.json({ code: 0, data: { removed: before - _chaosState.rules.length } })
}

module.exports = {
  isProduction,
  middleware:    chaosMiddleware,
  injectDelay:   injectDelay,
  injectFailure: injectFailure,
  injectDrop:    injectDrop,
  listRules:     listRules,
  clearRules:    clearRules,
  removeRule:    removeRule,
  // 测试用
  _state:        _chaosState,
}
