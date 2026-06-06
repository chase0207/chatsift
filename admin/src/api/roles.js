import request from '../utils/request'

export function getRoleList() {
  return request.get('/roles')
}

// 建用户角色下拉(按作用域;auth 即可)。scope 可选 'tenant'(平台方 bootstrap 建租户管理员用)
export function getRoleOptions(scope) {
  return request.get('/roles/options', { params: scope ? { scope } : {} })
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
