import request from '../utils/request'

export function getAdminStats(params) {
  return request.get('/admin/stats', { params })
}
