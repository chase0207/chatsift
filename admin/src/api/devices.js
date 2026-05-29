import request from '../utils/request'

export function getDeviceList() {
  return request.get('/devices')
}

export function kickDevice(id) {
  return request.post(`/devices/${id}/kick`)
}
