;(function () {
  'use strict'

  // V1.9 Adapter Registry（V1.9_技术方案 § 6）
  //
  // 与历史 PRAAdapterRuntime 共存：
  //   - PRAAdapterRuntime（runtime/adapter-runtime.js）服务于 V1.x legacy 的 customer_service / live 场景调度
  //   - RpaAdapterRegistry（本文件）服务于 V1.9 PlatformPageAdapter 接口
  //
  // W5 后 Adapter 只保留采集探针接口：
  //   {
  //     adapterKey:   string           — 唯一键，建议 "platform/pageKey"
  //     platform:     string
  //     pageKey:      string
  //     matchPage(location): boolean
  //     detectSessions(): Promise<RawSession[]>
  //     selectTriggerSession(sessions): Promise<RawSession | null>
  //     switchSession(session): Promise<SwitchResult>
  //     confirmActiveSession(session): Promise<boolean>
  //     getMessages(session): Promise<RawMessage[]>
  //     classifyMessage(rawMessage): NormalizedMessage
  //     toConversationEvent(rawMessage, sessionInfo): ConversationEvent
  //     buildRuntimeContext(): RuntimePageContext
  //   }
  //
  // 发送/自动回复链路已于 W5 移除，registry 只负责页面匹配和采集 adapter 分发。

  var Logger = window.RpaLogger
  if (!Logger) throw new Error('[V19] RpaLogger must load before AdapterRegistry')

  var REQUIRED_FIELDS = ['adapterKey', 'platform', 'pageKey']
  var REQUIRED_METHODS = ['getMessages', 'toConversationEvent']
  var OPTIONAL_METHODS = [
    'matchPage',
    'detectSessions',
    'selectTriggerSession',
    'switchSession',
    'confirmActiveSession',
    'getMessages',
    'classifyMessage',
    'toConversationEvent',
    'buildRuntimeContext',
  ]

  var _adapters = []   // 注册顺序，便于 resolve 选择"最先匹配"

  function _validate(adapter) {
    if (!adapter || typeof adapter !== 'object') return 'adapter must be object'
    for (var i = 0; i < REQUIRED_FIELDS.length; i++) {
      var k = REQUIRED_FIELDS[i]
      if (!adapter[k] || typeof adapter[k] !== 'string') return 'missing field: ' + k
    }
    for (var j = 0; j < REQUIRED_METHODS.length; j++) {
      var m = REQUIRED_METHODS[j]
      if (typeof adapter[m] !== 'function') return 'missing method: ' + m
    }
    return null
  }

  function register(adapter) {
    var err = _validate(adapter)
    if (err) {
      Logger.error('AdapterRegistry', 'register rejected:', err, adapter)
      throw new Error('[V19] AdapterRegistry.register: ' + err)
    }
    // 同 key 覆盖
    _adapters = _adapters.filter(function (a) { return a.adapterKey !== adapter.adapterKey })
    _adapters.push(adapter)
    Logger.info('AdapterRegistry', 'registered', adapter.adapterKey)
    return adapter
  }

  function unregister(adapterKey) {
    var before = _adapters.length
    _adapters = _adapters.filter(function (a) { return a.adapterKey !== adapterKey })
    return before !== _adapters.length
  }

  function list() {
    return _adapters.slice()
  }

  function getByKey(adapterKey) {
    for (var i = 0; i < _adapters.length; i++) {
      if (_adapters[i].adapterKey === adapterKey) return _adapters[i]
    }
    return null
  }

  // 按 platform + pageKey 精确匹配；都为空时表示"任意"
  function getByPage(platform, pageKey) {
    for (var i = 0; i < _adapters.length; i++) {
      var a = _adapters[i]
      if (platform && a.platform !== platform) continue
      if (pageKey  && a.pageKey  !== pageKey)  continue
      return a
    }
    return null
  }

  // 让 adapter 自己用 matchPage() 决定是否匹配
  function resolve(location) {
    var loc = location || (typeof window !== 'undefined' ? window.location : null)
    for (var i = 0; i < _adapters.length; i++) {
      var a = _adapters[i]
      if (typeof a.matchPage === 'function') {
        try {
          if (a.matchPage(loc)) return a
        } catch (err) {
          Logger.warn('AdapterRegistry', 'matchPage threw', a.adapterKey, err && err.message)
        }
      }
    }
    return null
  }

  // 工具：检查 adapter 是否实现了某个方法（区分"未实现"与"返回 null"）
  function hasMethod(adapter, methodName) {
    return !!(adapter && typeof adapter[methodName] === 'function')
  }

  window.RpaAdapterRegistry = {
    register:             register,
    unregister:           unregister,
    list:                 list,
    getByKey:             getByKey,
    getByPage:            getByPage,
    resolve:              resolve,
    hasMethod:            hasMethod,
    OPTIONAL_METHODS:     OPTIONAL_METHODS,
  }

})()
