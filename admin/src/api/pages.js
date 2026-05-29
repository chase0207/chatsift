import request from '../utils/request'

export function getPlatformPages(platformId) {
  return request.get('/pages', { params: { platform_id: platformId } })
}

export function createPlatformPage(data) {
  return request.post('/pages', data)
}

export function updatePlatformPage(id, data) {
  return request.put(`/pages/${id}`, data)
}

export function deletePlatformPage(id) {
  return request.delete(`/pages/${id}`)
}
