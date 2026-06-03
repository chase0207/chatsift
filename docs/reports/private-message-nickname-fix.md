# 抖音私信(来客)客户昵称误读修复

日期: 2026-06-03
范围: plugin(采集)— A 类实现细节,经 Chase 指派(以 dom-collector 阶段一采集结果为输入)

## 现象
新租户 18651359635(tenant 2)在管理后台"消息聚合"里出现一条客户名为"空月培训教育官方号-2号客服"(= 登录客服账号名)的会话,看起来像"给客服自己建了一条对话"。

## 诊断(线上库只读核实)
- 该会话(conversations.id=6)真实 inbound 客户是"车评老帅",customer_nickname 却被写成登录客服账号名。
- conversation_id `= hash(pageKey|nickname)`,昵称错成客服名后,有把同客服多客户折叠成一条的风险。
- 平台页面:`life.douyin.com/cs/web/clue_private_message/chat/session`(来客私信)。

## 根因(由 dom-collector 采集 douyin-private-message.selectors.json 坐实)
旧 `sessionTitle` 读取兜底里含 `div[class*="userInfo"] [class*="name"]`。该布局下 `div.userInfo` 是**左侧"登录客服自己"的信息区**(`section.windowLeft > div.userInfo`,客服在线状态块)。当会话标题 `div.msgTitle` 未渲染/未选中会话时,兜底读到了客服自己的名字 → customer_nickname 变客服名。

采集确认的正确节点:
- 客户昵称 sessionTitle: `div[class*="msgTitle"] span[class*="name"]`(实测 `span.name-*`,文本=客户名)。
- 客服名 agentAccount / selfMessageSenderName: `p[class*="text-right"][class*="text-gray"]`(文本前缀粘了时间 span,需剔除)。
- 用户/自己消息文本同一选择器 `div.px-3.py-2...`,方向靠容器:inbound 有 `span.name` 发送名、outbound 有 `p.text-right` 发送行(现有 `_isOutbound` 一致)。

## 修复(plugin)
- `private-message.adapter.js` `SELECTORS.sessionTitle`:删除 `div.userInfo` 兜底,客户昵称只从 `div.msgTitle ... span.name` 取。
- `legacy-collector.js` `_readNickname`:同步删除 `div.userInfo` 兜底。
- `legacy-collector.js` `_readAccountNickname`:适配 life.douyin(`p.text-right.text-gray-2`,剔除时间戳);旧 `[class*="imUserName"]` 在该布局不存在。
- `legacy-collector.js` `_buildSessionInfo`:加防护——客户昵称等于登录客服账号名则判误读、跳过,杜绝再生成"客服会话"。

## 验证
- 本地 `node -c` + `build:plugin` 通过,防护逻辑已进 content.js。
- DOM 逻辑需插件更新后真机重采确认(看会话6 是否变回"车评老帅")。

## 待办
- B1: 插件更新 + 重采验证通过后,删除会话 id=6 及其 messages/lead/workorder(删前列清单确认)。
- 方向边界("用户7342403461855"被当 outbound)为 05-22 旧测试数据,重采后复看。

## 给 dom-collector 线的协调说明
本次动了 `private-message.adapter.js` 的 `SELECTORS.sessionTitle`(去除 userInfo 兜底)。若你们在重定该页选择器,请以采集结果为准并保留"客户昵称绝不退回客服信息区"这一约束,避免回归。
