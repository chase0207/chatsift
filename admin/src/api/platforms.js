import request from '../utils/request'

export function getPlatformList(params) {
  return request.get('/platforms', { params })
}

export function createPlatform(data) {
  return request.post('/platforms', data)
}

export function updatePlatform(id, data) {
  return request.put(`/platforms/${id}`, data)
}

export function deletePlatform(id) {
  return request.delete(`/platforms/${id}`)
}
