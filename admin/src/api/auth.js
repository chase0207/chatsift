import request from '../utils/request'

export function login(username, password) {
  return request.post('/auth/login', { username, password })
}

export function verify() {
  return request.post('/auth/verify')
}

export function refresh(refreshToken) {
  return request.post('/auth/refresh', { refreshToken })
}

export function logout() {
  return request.post('/auth/logout')
}

export function getUserInfo() {
  return request.get('/auth/userinfo')
}
