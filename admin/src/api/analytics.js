import request from '../utils/request'

export function getFunnel(params) {
  return request.get('/v1/analytics/funnel', { params })
}

export function getIntentDist(params) {
  return request.get('/v1/analytics/intent-distribution', { params })
}

export function getLeadLevel(params) {
  return request.get('/v1/analytics/lead-level', { params })
}

export function getByPage(params) {
  return request.get('/v1/analytics/by-page', { params })
}

export function getTrend(params) {
  return request.get('/v1/analytics/trend', { params })
}
