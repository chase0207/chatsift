;(function () {
  'use strict'

  // session-parser.js — DOM → SessionSnapshot 结构化解析
  //
  // 职责: 扫描当前页面的会话列表 DOM，为每个会话节点提取结构化快照。
  // 不判断"是否新消息"，那是 diff-engine 的工作。
  //
  // SessionSnapshot 结构:
  // {
  //   session_id:        string   — 稳定会话指纹 (via SessionIdentityResolver)
  //   platform:          string
  //   platform_account:  string   — 坐席平台账号（TODO: 各平台确认取法）
  //   unstable:          boolean  — session_id 是否来自 L3 兜底
  //   last_message_text: string   — 最后一条消息预览文本
  //   last_timestamp:    string   — 时间戳文本（原始，不做转换）
  //   unread_count:      number   — 未读消息数，0 表示无或未知
  //   node:              Element  — 对应 DOM 节点（不序列化，内存引用）
  //   snapshot_at:       number   — Date.now()
  // }

  // ── 各平台解析实现（STUB）────────────────────────────────────────
  //
  // 每个解析器签名:
  //   function() → SessionSnapshot[]
  //
  // M1 开工后根据真实 DOM 结构补充实现。

  var _parsers = {

    douyinLaike: function () {
      // TODO: 实现抖音来客会话列表解析
      // 预期: 联系人列表每一项 → 提取 lastMsg / timestamp / unreadBadge
      return []
    },

    douyinFeige: function () {
      // TODO: 实现抖音飞鸽会话列表解析
      return []
    },

    kuaishou: function () {
      // TODO: 实现快手会话列表解析
      return []
    },

    meituanJyb: function () {
      // TODO: 实现美团经营宝会话列表解析（注意 ShadowRoot）
      return []
    },

    xiaohongshu: function () {
      // TODO: 实现小红书会话列表解析
      return []
    },
  }

  // ── 公开 API ─────────────────────────────────────────────────────

  // parse(platform, platformAccount) → SessionSnapshot[]
  // 解析当前页面所有可见会话，返回快照数组。空数组表示无会话或解析失败。
  function parse(platform, platformAccount) {
    var parser = _parsers[platform]
    if (!parser) {
      console.warn('[SessionParser] 无此平台解析器:', platform)
      return []
    }
    try {
      var snapshots = parser()
      // 补全公共字段
      var now = Date.now()
      return snapshots.map(function (s) {
        return Object.assign({
          platform:         platform,
          platform_account: platformAccount || '',
          unstable:         false,
          last_message_text: '',
          last_timestamp:   '',
          unread_count:     0,
          node:             null,
          snapshot_at:      now,
        }, s)
      })
    } catch (e) {
      console.error('[SessionParser] 解析异常:', platform, e)
      return []
    }
  }

  // 注册/覆盖平台解析器（M1 正式实现时调用）
  function registerParser(platform, fn) {
    _parsers[platform] = fn
  }

  window.RpaSessionParser = {
    parse:          parse,
    registerParser: registerParser,
  }

})()
