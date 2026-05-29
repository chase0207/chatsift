import request from '../utils/request'

export function getMessageLogs(params) {
  return request.get('/logs/messages', { params })
}

export function getTransferLogs(params) {
  return request.get('/logs/transfers', { params })
}

export function getRuntimeLogs(params) {
  return request.get('/logs/runtime', { params })
}
