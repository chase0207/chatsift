;(function () {
  'use strict'

  // V1.9 Adapter Registry（V1.9_技术方案 § 6）
  //
  // 与历史 PRAAdapterRuntime 共存：
  //   - PRAAdapterRuntime（runtime/adapter-runtime.js）服务于 V1.x legacy 的 customer_service / live 场景调度
  //   - RpaAdapterRegistry（本文件）服务于 V1.9 PlatformPageAdapter 接口
  //
  // V1.9 Adapter 接口（V1.9_Runtime_Protocol § 第五章）：
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
  //     buildBatch(messages, context): Promise<MessageBatch>
  //     prepareReply(replyText, context): Promise<void>
  //     sendReply(replyText, context): Promise<SendResult>
  //     confirmReply(replyText, context): Promise<ConfirmResult>
  //     buildRuntimeContext(): RuntimePageContext
  //   }
  //
  // 不实现以上方法的实现，注册时仍然允许（接受 partial adapter），
  // 但 RuntimeManager 调用未实现方法时会记录 LK-ERROR 并跳过。

  var Logger = window.RpaLogger
  if (!Logger) throw new Error('[V19] RpaLogger must load before AdapterRegistry')

  var REQUIRED_FIELDS = ['adapterKey', 'platform', 'pageKey']
  var OPTIONAL_METHODS = [
    'matchPage',
    'detectSessions',
    'selectTriggerSession',
    'switchSession',
    'confirmActiveSession',
    'getMessages',
    'classifyMessage',
    'buildBatch',
    'prepareReply',
    'sendReply',
    'confirmReply',
    'buildRuntimeContext',
  ]

  // 高危方法：发送链路相关。注册时会被 send_runtime_v19 Flag 拦截，
  // Flag 关闭时直接返 { ok:false, reason:'send-runtime-v19-locked' }，
  // 物理阻断 V1.9-M4 发送链路。M1-M3 验证期保持关闭状态。
  var SEND_RUNTIME_METHODS = ['prepareReply', 'sendReply', 'confirmReply']

  var _adapters = []   // 注册顺序，便于 resolve 选择"最先匹配"

  function _validate(adapter) {
    if (!adapter || typeof adapter !== 'object') return 'adapter must be object'
    for (var i = 0; i < REQUIRED_FIELDS.length; i++) {
      var k = REQUIRED_FIELDS[i]
      if (!adapter[k] || typeof adapter[k] !== 'string') return 'missing field: ' + k
    }
    return null
  }

  function _wrapSendMethods(adapter) {
    // 不修改原对象（adapter 内部可能引用 this），返回一个包装后的副本。
    var wrapped = Object.assign({}, adapter)
    SEND_RUNTIME_METHODS.forEach(function (m) {
      var orig = adapter[m]
      if (typeof orig !== 'function') return
      wrapped[m] = function () {
        var Flags = window.RpaFeatureFlags
        if (!Flags || !Flags.get('send_runtime_v19')) {
          Logger.warn('AdapterRegistry', 'blocked ' + adapter.adapterKey + '.' + m + ' (send_runtime_v19=false)')
          return Promise.resolve({
            ok:           false,
            confirmed:    false,
            reason:       'send-runtime-v19-locked',
            confirm_type: 'unknown',
            timeout:      false,
            hint:         'V1.9-M4 发送链路默认关闭。开启路径：' +
                          'RpaFeatureFlags.unlockForTesting("send_runtime_v19") 或 ' +
                          '后端 runtime-config.experimental.send_runtime_v19=true（仅测试账号）',
          })
        }
        return orig.apply(adapter, arguments)
      }
    })
    return wrapped
  }

  function register(adapter) {
    var err = _validate(adapter)
    if (err) {
      Logger.error('AdapterRegistry', 'register rejected:', err, adapter)
      throw new Error('[V19] AdapterRegistry.register: ' + err)
    }
    var wrapped = _wrapSendMethods(adapter)
    // 同 key 覆盖
    _adapters = _adapters.filter(function (a) { return a.adapterKey !== adapter.adapterKey })
    _adapters.push(wrapped)
    Logger.info('AdapterRegistry', 'registered', adapter.adapterKey + ' (send methods locked)')
    return wrapped
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
    SEND_RUNTIME_METHODS: SEND_RUNTIME_METHODS,
  }

})()
