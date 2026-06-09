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

// W20 治理
export function confirmAccount(saId, payload) {
  return request.post(`/service-accounts/${saId}/confirm`, payload)
}

export function setCollector(saId, employeeId) {
  return request.put(`/service-accounts/${saId}/collector`, { employee_id: employeeId })
}

export function disableAccount(saId) {
  return request.put(`/service-accounts/${saId}/disable`)
}

export function enableAccount(saId) {
  return request.put(`/service-accounts/${saId}/enable`)
}

export function getConflicts(saId) {
  return request.get(`/service-accounts/${saId}/conflicts`)
}
