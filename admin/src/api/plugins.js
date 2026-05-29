import request from '../utils/request'

export function getPluginList(params) {
  return request.get('/plugins', { params })
}


export function createPlugin(data) {
  return request.post('/plugins', data)
}

export function updatePlugin(id, data) {
  return request.put(`/plugins/${id}`, data)
}

export function deletePlugin(id) {
  return request.delete(`/plugins/${id}`)
}
