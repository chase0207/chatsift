import request from '../utils/request'

export function getLlmConfig() {
  return request.get('/v1/llm-config')
}

export function updateLlmConfig(data) {
  return request.put('/v1/llm-config', data)
}
