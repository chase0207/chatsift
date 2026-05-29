import request from '../utils/request'

export function get(pageKey) {
  return request.get(`/users/column-prefs/${pageKey}`)
}

export function set(pageKey, columnPrefs) {
  return request.put(`/users/column-prefs/${pageKey}`, { column_prefs: columnPrefs })
}
