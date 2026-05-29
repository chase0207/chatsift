import request from '../utils/request'

export function getMessages(params) {
  return request.get('/messages', { params })
}

export function exportMessages(params) {
  return request({
    url: '/messages/export',
    method: 'get',
    params,
    responseType: 'blob',
  })
}
