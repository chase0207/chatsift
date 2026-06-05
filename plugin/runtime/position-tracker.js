/*
 * W17 位置标识:锚点窗口对齐(替代旧 _seqMap)
 *
 * 目标:给每条消息一个"会话内位置号 position"(纯位置不含内容),满足:
 *   - 幂等:同一条消息跨采集 → 锚点匹配 → position 不变(D5 message_id 幂等的基础)
 *   - 有几条存几条:重复连发(1/1/1)各自 position 不同 → 都保留
 *   - 稳定:chrome.storage 持久化每会话已采序列,掉线/重启后续编不从头乱编
 *
 * 排序不靠 position(滚动加载的旧段 position 反而更大);段间排序靠 segment_at(见 Task3)。
 * position 只做"身份(去重)+段内相对序"。
 *
 * 纯函数 computeAssignments / findOffset 不依赖 window/chrome,便于 node 单测。
 */
;(function () {
  'use strict'

  // 自包含的 key 哈希(仅用于已采序列内部匹配,与 message_id 的 Dom.simpleHash 无关)
  function keyOf(direction, content) {
    var s = (direction === 'outbound' ? 'o' : 'i') + '' + String(content == null ? '' : content)
    var h = 5381
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
    return (h >>> 0).toString(36)
  }

  // 在已采序列 Sk 中为当前 DOM 序列 cur 找对齐偏移:cur[i] 对应 Sk[off + i]
  // 取连续锚点窗口(先宽后窄 5→4→3),从 cur 末尾向前扫,返回"唯一匹配"的偏移;歧义/无重叠返回 null
  function findOffset(cur, Sk) {
    var sizes = [5, 4, 3]
    for (var w = 0; w < sizes.length; w++) {
      var W = sizes[w]
      if (cur.length < W || Sk.length < W) continue
      for (var a = cur.length - W; a >= 0; a--) {
        var found = -1
        var dup = false
        for (var m = 0; m + W <= Sk.length; m++) {
          var ok = true
          for (var x = 0; x < W; x++) {
            if (Sk[m + x] !== cur[a + x]) { ok = false; break }
          }
          if (ok) {
            if (found === -1) found = m
            else { dup = true; break }
          }
        }
        if (found !== -1 && !dup) return found - a
      }
    }
    return null
  }

  // 输入:cur = 当前 DOM 序列的 key 数组(按 DOM 顺序);state = {nextPos, seq:[{k,p}]}(seq 按时间顺序)
  // 输出:{positions:[每条的position], state:新state, mode}
  function computeAssignments(cur, state) {
    state = state || { nextPos: 0, seq: [] }
    var seq = (state.seq || []).slice()
    var nextPos = state.nextPos || 0
    var positions = new Array(cur.length)

    // 冷启动:首次采该会话
    if (seq.length === 0) {
      var newSeq0 = []
      for (var i0 = 0; i0 < cur.length; i0++) {
        positions[i0] = nextPos++
        newSeq0.push({ k: cur[i0], p: positions[i0] })
      }
      return { positions: positions, state: { nextPos: nextPos, seq: newSeq0 }, mode: 'cold' }
    }

    var Sk = seq.map(function (e) { return e.k })
    var off = findOffset(cur, Sk)

    // 降级:无唯一锚点(无重叠/冷滚动/全重复歧义)→ 全部续编新 position,追加进 seq(时序由 segment_at 解决)
    if (off === null) {
      var addD = []
      for (var iD = 0; iD < cur.length; iD++) {
        positions[iD] = nextPos++
        addD.push({ k: cur[iD], p: positions[iD] })
      }
      return { positions: positions, state: { nextPos: nextPos, seq: seq.concat(addD) }, mode: 'degrade' }
    }

    // 已对齐:cur[i] ↔ Sk[off+i]
    var prepend = []   // off+i<0:滚动加载出的更早消息(新身份)
    var appendNew = [] // off+i>=len:底部新到消息
    for (var i = 0; i < cur.length; i++) {
      var sIdx = off + i
      if (sIdx >= 0 && sIdx < seq.length && seq[sIdx].k === cur[i]) {
        positions[i] = seq[sIdx].p                       // 命中:复用旧 position(幂等)
      } else if (sIdx < 0) {
        positions[i] = nextPos++; prepend.push({ k: cur[i], p: positions[i] })
      } else if (sIdx >= seq.length) {
        positions[i] = nextPos++; appendNew.push({ k: cur[i], p: positions[i] })
      } else {
        positions[i] = nextPos++                         // 区间内错配(撤回/编辑/错位):给新身份,绝不误并
      }
    }
    var newSeq = prepend.concat(seq, appendNew)
    return { positions: positions, state: { nextPos: nextPos, seq: newSeq }, mode: 'aligned', off: off }
  }

  // ---- chrome.storage 持久化封装(浏览器运行时) ----
  var STORAGE_PREFIX = 'w17_pos_'

  function _get(key) {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get([key], function (r) { resolve((r && r[key]) || null) })
      } catch (_) { resolve(null) }
    })
  }
  function _set(key, val) {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.set({ [key]: val }, function () { resolve() })
      } catch (_) { resolve() }
    })
  }

  // 给一批 events(同会话,按 DOM 顺序)赋 position;就地写 event.position 并返回 events
  async function assign(conversationId, events) {
    if (!events || !events.length) return events
    var key = STORAGE_PREFIX + conversationId
    var state = await _get(key)
    var cur = events.map(function (e) { return keyOf(e.direction, e.content_text) })
    var out = computeAssignments(cur, state)
    for (var i = 0; i < events.length; i++) {
      events[i].position = out.positions[i]
      // W17-C:记录 position 来源(锚点 pass mode),便于排查 + 阶段二判 position 可信度
      var rs = events[i].raw_snapshot || (events[i].raw_snapshot = {})
      rs.position_source = out.mode               // cold / aligned / degrade
      if (out.off !== undefined) rs.anchor_off = out.off
    }
    await _set(key, out.state)
    return events
  }

  var api = {
    keyOf: keyOf,
    findOffset: findOffset,
    computeAssignments: computeAssignments,
    assign: assign,
    STORAGE_PREFIX: STORAGE_PREFIX,
  }

  if (typeof window !== 'undefined') window.RpaPositionTracker = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})()
