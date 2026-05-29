import request from '../utils/request'

export function getKeywordReplyList(params) {
  return request.get('/keyword-replies', { params })
}

export function createKeywordReply(data) {
  return request.post('/keyword-replies', data)
}

export function updateKeywordReply(id, data) {
  return request.put(`/keyword-replies/${id}`, data)
}

export function deleteKeywordReply(id) {
  return request.delete(`/keyword-replies/${id}`)
}
