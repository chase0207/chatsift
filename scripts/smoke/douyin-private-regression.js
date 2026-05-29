#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const CONTENT_PATH = path.join(ROOT, 'plugin', 'content.js')
const SNAPSHOT_PATH = path.join(ROOT, 'dom-collector', 'dom-snapshots', 'douyin-1.selectors.json')

function fail(message) {
  throw new Error(message)
}

function assert(condition, message) {
  if (!condition) fail(message)
}

function readText(file) {
  return fs.readFileSync(file, 'utf8')
}

function readJson(file) {
  return JSON.parse(readText(file))
}

function extractFunction(source, name) {
  const marker = 'function ' + name + '('
  const start = source.indexOf(marker)
  if (start === -1) fail('Missing function: ' + name)
  let depth = 0
  let bodyStarted = false
  for (let i = start; i < source.length; i++) {
    const ch = source[i]
    if (ch === '{') {
      depth++
      bodyStarted = true
    } else if (ch === '}') {
      depth--
      if (bodyStarted && depth === 0) return source.slice(start, i + 1)
    }
  }
  fail('Unclosed function: ' + name)
}

function assertSnapshotSemantics(snapshot) {
  const selectors = snapshot.selectors || {}
  const active = selectors.activeContactItem || {}
  const message = selectors.messageText || {}
  const self = selectors.selfMessageText || {}
  const sender = selectors.messageSenderName || {}

  assert(active.primary === 'div.rc-virtual-list-holder-inner',
    'Snapshot activeContactItem currently points to the list inner container; code must not depend on it as a precise active item')
  assert(message.primary === self.primary,
    'Snapshot shows private messageText and selfMessageText share the same bubble selector')
  assert(String(sender.text || '').includes('客服'),
    'Snapshot messageSenderName can be a shop/customer-service name and must not define the user identity')
}

function assertPrivateSelfPreviewGuards(source) {
  const sendFn = extractFunction(source, 'sendDouyinPrivateReply')
  assert(sendFn.includes("if (sent) rememberRecentSelfReply('douyin-private', reply)"),
    'Douyin private send path must remember recent self replies')

  const triggerFn = extractFunction(source, 'findDouyinPrivateMessageTrigger')
  assert(triggerFn.includes("isRecentSelfReplyPreview('douyin-private', txt)"),
    'Douyin private message fallback must skip recent self replies')
  assert(triggerFn.includes("isRecentSelfReplyPreview('douyin-private', text)"),
    'Douyin private contact trigger scan must skip recent self reply previews')
}

function assertPrivateNicknameSource(source) {
  const nicknameFn = extractFunction(source, 'getDouyinPrivateNicknameFromItem')
  assert(!nicknameFn.includes('messageSenderName'), 'Private nickname helper must not use messageSenderName')
  assert(!nicknameFn.includes('chatd-message-userName'), 'Private nickname helper must not use message sender nodes')
  assert(nicknameFn.includes('[title], [data-name]'), 'Private nickname should prefer contact item title/data-name')
}

function assertPrivateDirectionSource(source) {
  const selfFn = extractFunction(source, 'isDouyinPrivateSelfMessageNode')
  const incomingFn = extractFunction(source, 'isDouyinPrivateIncomingMessageNode')
  assert(selfFn.includes('rightMsg') && selfFn.includes('self-end'),
    'Private self classifier must use parent layout direction markers')
  assert(incomingFn.includes('!isDouyinPrivateSelfMessageNode(node)'),
    'Private incoming classifier must exclude self messages first')
}

function main() {
  const source = readText(CONTENT_PATH)
  const snapshot = readJson(SNAPSHOT_PATH)
  assertSnapshotSemantics(snapshot)
  assertPrivateSelfPreviewGuards(source)
  assertPrivateNicknameSource(source)
  assertPrivateDirectionSource(source)
  console.log('douyin-private regression: PASS')
}

try {
  main()
} catch (err) {
  console.error('douyin-private regression: FAIL')
  console.error(err.message)
  process.exit(1)
}
