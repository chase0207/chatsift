import request from '../utils/request'

export function listWorkorders(params) {
  return request.get('/v1/workorders', { params })
}

export function getWorkorder(id) {
  return request.get(`/v1/workorders/${id}`)
}

export function updateWorkorder(id, data) {
  return request.patch(`/v1/workorders/${id}`, data)
}

export function assignWorkorder(id, data) {
  return request.post(`/v1/workorders/${id}/assign`, data)
}
