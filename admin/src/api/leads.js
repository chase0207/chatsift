import request from '../utils/request'

export function listLeads(params) {
  return request.get('/v1/leads', { params })
}

export function getLead(id) {
  return request.get(`/v1/leads/${id}`)
}

export function updateLead(id, data) {
  return request.patch(`/v1/leads/${id}`, data)
}

export function convertLead(id) {
  return request.post(`/v1/leads/${id}/convert`)
}
