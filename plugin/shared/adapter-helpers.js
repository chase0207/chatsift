;(function () {
  'use strict'

  // V1.9 Adapter 通用辅助：
  //   - 构造统一的 RawSession / NormalizedMessage 结构
  //   - 调用 SessionIdentityResolver 派生 session_id
  //   - 校验 unstable 标志

  var Identity = window.RpaSessionIdentityResolver
  var Logger   = window.RpaLogger
  if (!Identity || !Logger) throw new Error('[V19] AdapterHelpers dependencies missing')

  // RawSession（V1.9_技术方案 § 6.3）：
  //   {
  //     raw_id, nickname, avatar, last_message_text, last_message_time, unread_count,
  //     dom_ref, raw_payload
  //   }
  function buildRawSession(fields) {
    return {
      raw_id:             fields.raw_id            || null,
      nickname:           fields.nickname          || '',
      avatar:             fields.avatar            || null,
      last_message_text:  fields.last_message_text || null,
      last_message_time:  fields.last_message_time || null,
      unread_count:       fields.unread_count      || 0,
      dom_ref:            fields.dom_ref           || null,
      raw_payload:        fields.raw_payload       || null,
    }
  }

  // 派生 IdentityResult（V1.9_技术方案 § 6.3 + § 7）
  //   { session_id, identity_level, identity_source, unstable, raw_identity }
  // V1.9 签名：resolveIdentity(platform, pageKey, platformAccount, rawSession)
  // 兼容三参签名：resolveIdentity(platform, platformAccount, rawSession)
  function resolveIdentity(platform, pageKeyOrAccount, accountOrSession, maybeSession) {
    var pageKey, platformAccount, rawSession
    if (arguments.length >= 4) {
      pageKey         = pageKeyOrAccount
      platformAccount = accountOrSession
      rawSession      = maybeSession
    } else {
      pageKey         = ''
      platformAccount = pageKeyOrAccount
      rawSession      = accountOrSession
    }
    if (!rawSession) return null
    var resolved = Identity.resolve(platform, pageKey, platformAccount || '', rawSession.dom_ref)
    if (!resolved) return null
    return {
      session_id:      resolved.session_id,
      identity_level:  'L' + resolved.level,
      identity_source: resolved.source,
      unstable:        !!resolved.unstable,
      raw_identity:    resolved.session_id,
    }
  }

  // NormalizedMessage（V1.9_技术方案 § 6.3）
  function buildNormalizedMessage(fields) {
    return {
      message_id:   fields.message_id  || null,
      session_id:   fields.session_id  || null,
      batchId:      fields.batchId     || null,
      direction:    fields.direction   || 'inbound',
      owner:        fields.owner       || 'user',
      message_type: fields.message_type || 'user_text',
      content:      String(fields.content || ''),
      timestamp:    fields.timestamp   || null,
      raw_payload:  fields.raw_payload || null,
    }
  }

  function classifyByDirection(rawMessage) {
    // 默认按 direction 字段；adapter 可在 classifyMessage 中覆盖
    if (!rawMessage) return null
    return buildNormalizedMessage({
      session_id:  rawMessage.session_id,
      direction:   rawMessage.direction || 'inbound',
      owner:       rawMessage.owner     || (rawMessage.direction === 'outbound' ? 'self' : 'user'),
      message_type: rawMessage.message_type || 'user_text',
      content:     rawMessage.content,
      timestamp:   rawMessage.timestamp,
      raw_payload: rawMessage.raw_payload,
    })
  }

  // 检查 unstable 是否禁止自动回复（V1.9_技术方案 § 7.2 L3 不允许自动回复）
  function shouldBlockAutoReply(identity) {
    if (!identity) return true
    return identity.unstable === true || identity.identity_level === 'L3'
  }

  window.RpaAdapterHelpers = {
    buildRawSession:        buildRawSession,
    resolveIdentity:        resolveIdentity,
    buildNormalizedMessage: buildNormalizedMessage,
    classifyByDirection:    classifyByDirection,
    shouldBlockAutoReply:   shouldBlockAutoReply,
  }

})()
