import request from '../utils/request'

export function getTenantList(params) {
  return request.get('/tenants', { params })
}

export function getTenantOptions() {
  return request.get('/tenants/options')
}

export function createTenant(data) {
  return request.post('/tenants', data)
}

export function updateTenant(id, data) {
  return request.put(`/tenants/${id}`, data)
}

export function deleteTenant(id) {
  return request.delete(`/tenants/${id}`)
}
