import request from '../utils/request'

export function getPluginUpdate() {
  return request.get('/dashboard/plugin-update')
}

export function downloadPluginZip() {
  return request.get('/dashboard/plugin-update/download', { responseType: 'blob' })
}
