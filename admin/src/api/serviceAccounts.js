import request from '../utils/request'

export function getServiceAccountList(params) {
  return request.get('/service-accounts', { params })
}

export function getTenantEmployees(tenantId) {
  return request.get('/service-accounts/employees', { params: { tenant_id: tenantId } })
}

export function getAssignments(saId) {
  return request.get(`/service-accounts/${saId}/assignments`)
}

export function assignEmployee(saId, employeeId) {
  return request.post(`/service-accounts/${saId}/assignments`, { employee_id: employeeId })
}

export function unassignEmployee(saId, employeeId) {
  return request.delete(`/service-accounts/${saId}/assignments/${employeeId}`)
}
