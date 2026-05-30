import request from '../utils/request'

export function listConversations(params) {
  return request.get('/v1/conversations', { params })
}

export function getConversation(id) {
  return request.get(`/v1/conversations/${id}`)
}

export function getMessages(id, params) {
  return request.get(`/v1/conversations/${id}/messages`, { params })
}
