// TODO V2.0 改造: 见 MIGRATED_FROM_CHAT_RPA.md 第 1.2 节 / docs/prd/V2.0/runtime-disposition.md
;(function () {
  'use strict'

  // V1.9 Feature Flags 中心（硬锁默认 deny）
  //
  // 三个 Flag：
  //   - runtime_v19       一级：V1.9 Runtime 启动总开关
  //   - send_runtime_v19  二级：旧 runtime 状态约束
  //   - watchdog_v19      看门狗启动总开关（保留）
  //
  // 解锁路径只有两条：
  //   A. background.js 接收 /api/devices/runtime-config 后，将 response.experimental 字段
  //      通过消息推到 content script，由 content script 调用 setFlags(...)
  //   B. DevTools 调试：window.RpaFeatureFlags.unlockForTesting('send_runtime_v19')
  //      会强烈警告，仅供 QA 在测试账号下灰度
  //
  // 不允许的解锁方式：
  //   ✗ 通过 chrome.storage.local 持久化解锁状态（reload 后保留 = 危险）
  //   ✗ 直接修改 _flags 对象（隐藏在闭包内）

  var C = window.RpaConstants
  if (!C) throw new Error('[V19] RpaConstants must load before FeatureFlags')

  var DEFAULTS = C.FeatureFlagDefaults || {}
  var _flags   = Object.assign({}, DEFAULTS)

  function get(name) {
    if ((name === 'collector_v1_enabled' || name === 'auto_switch_session') &&
        window.ChatsiftContentGate &&
        !window.ChatsiftContentGate.isAllowed()) {
      return false
    }
    return !!_flags[name]
  }

  function snapshot() { return Object.assign({}, _flags) }

  // 从服务端 runtime-config.experimental 字段更新（白名单字段，未知字段忽略）
  function setFlags(serverFlags) {
    if (!serverFlags || typeof serverFlags !== 'object') return
    Object.keys(DEFAULTS).forEach(function (k) {
      if (k in serverFlags) _flags[k] = !!serverFlags[k]
    })
  }

  // DevTools 调试解锁；不会持久化，reload 后回到 default
  function unlockForTesting(name) {
    if (!(name in DEFAULTS)) {
      console.warn('[V19][FeatureFlags] unknown flag:', name)
      return false
    }
    console.warn(
      '[V19][FeatureFlags] ⚠️ unlockForTesting("' + name + '")\n' +
      '  此操作仅供调试期 / 测试账号灰度，不会持久化。\n' +
      '  禁止在生产账号或正常用户会话页面开启此 Flag。'
    )
    _flags[name] = true
    return true
  }

  function lock(name) {
    if (!(name in DEFAULTS)) return false
    _flags[name] = false
    return true
  }

  function _loadStorageFlags() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return
    chrome.storage.local.get(Object.keys(DEFAULTS), function (data) {
      if (chrome.runtime && chrome.runtime.lastError) return
      setFlags(data || {})
    })
    if (chrome.storage.onChanged && !window.__rpaFeatureFlagsStorageBound) {
      window.__rpaFeatureFlagsStorageBound = true
      chrome.storage.onChanged.addListener(function (changes, areaName) {
        if (areaName !== 'local') return
        var next = {}
        var changed = false
        Object.keys(DEFAULTS).forEach(function (k) {
          if (changes[k]) {
            next[k] = changes[k].newValue
            changed = true
          }
        })
        if (changed) setFlags(next)
      })
    }
  }

  _loadStorageFlags()

  window.RpaFeatureFlags = {
    get:              get,
    snapshot:         snapshot,
    setFlags:         setFlags,
    unlockForTesting: unlockForTesting,
    lock:             lock,
  }

})()
