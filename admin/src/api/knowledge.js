import request from '../utils/request'

export function getKnowledgeList(pluginId) {
  return request.get(`/knowledge/${pluginId}`)
}

export function uploadKnowledge(pluginId, file) {
  const form = new FormData()
  form.append('file', file)
  return request.post(`/knowledge/${pluginId}/upload`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function deleteKnowledge(pluginId, fileId) {
  return request.delete(`/knowledge/${pluginId}/${fileId}`)
}
