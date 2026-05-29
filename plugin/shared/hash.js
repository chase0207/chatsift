;(function () {
  'use strict'

  // V1.9 统一哈希工具。
  // 不使用 crypto.subtle 是因为 content script 在某些受限 frame 中无法访问 SubtleCrypto，
  // 且 V1.9 用途仅为生成稳定指纹（session_id / batch_id / batch_hash），无需密码学强度。

  // FNV-1a 32-bit；用于 session_id 等场景，输出 8 位小写 hex
  function fnv32(str) {
    str = String(str || '')
    var h = 0x811c9dc5
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i)
      h = (h * 0x01000193) >>> 0
    }
    return h.toString(16).padStart(8, '0')
  }

  // FNV-1a 64-bit 模拟（两段 32 位拼接）；用于 batch_id / batch_hash 场景，降低碰撞概率
  function fnv64(str) {
    str = String(str || '')
    var a = 0x811c9dc5
    var b = 0xcbf29ce4
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i)
      a ^= c
      a = (a * 0x01000193) >>> 0
      b ^= c
      b = (b * 0x100000001b3) >>> 0
    }
    return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
  }

  // 将一组字段拼接后 hash，自动用  分隔避免边界歧义
  function joinAndHash(parts, hashFn) {
    var fn = hashFn || fnv64
    var joined = (parts || []).map(function (p) {
      if (p === null || p === undefined) return ''
      return String(p)
    }).join('')
    return fn(joined)
  }

  window.RpaHash = {
    fnv32:       fnv32,
    fnv64:       fnv64,
    joinAndHash: joinAndHash,
  }

})()
