import request from '../utils/request'

export function getPluginConfig(pluginId, platform) {
  return request.get(`/configs/${pluginId}/${encodeURIComponent(platform)}`)
}

export function savePluginConfig(pluginId, platform, data) {
  return request.put(`/configs/${pluginId}/${encodeURIComponent(platform)}`, data)
}
