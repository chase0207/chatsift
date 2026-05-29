import request from '../utils/request'

export function getAiConfig(pluginId) {
  return request.get(`/ai/config/${pluginId}`)
}

export function saveAiConfig(pluginId, data) {
  return request.put(`/ai/config/${pluginId}`, data)
}
