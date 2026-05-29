import request from '../utils/request'

export function getRoleList() {
  return request.get('/roles')
}

export function createRole(data) {
  return request.post('/roles', data)
}

export function updateRole(id, data) {
  return request.put(`/roles/${id}`, data)
}

export function deleteRole(id) {
  return request.delete(`/roles/${id}`)
}

export function getRolePermissions(id) {
  return request.get(`/roles/${id}/permissions`)
}

export function setRolePermissions(id, menuIds) {
  return request.put(`/roles/${id}/permissions`, { menu_ids: menuIds })
}
