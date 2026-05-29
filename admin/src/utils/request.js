import axios from 'axios'
import { useUserStore } from '../stores/user'

const request = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 10000,
})

let isRefreshing = false
let pendingQueue = []

request.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

request.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      const refreshToken = localStorage.getItem('refreshToken')
      if (!refreshToken) {
        _redirectLogin()
        return Promise.reject(error)
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({ resolve, reject })
        }).then((token) => {
          original.headers['Authorization'] = `Bearer ${token}`
          return request(original)
        })
      }

      original._retry = true
      isRefreshing = true

      try {
        const res = await axios.post(
          `${import.meta.env.VITE_API_URL || '/api'}/auth/refresh`,
          { refreshToken }
        )
        const newToken = res.data.data.token
        localStorage.setItem('token', newToken)
        const store = useUserStore()
        store.token = newToken

        pendingQueue.forEach(({ resolve }) => resolve(newToken))
        pendingQueue = []

        original.headers['Authorization'] = `Bearer ${newToken}`
        return request(original)
      } catch {
        pendingQueue.forEach(({ reject }) => reject(error))
        pendingQueue = []
        _redirectLogin()
        return Promise.reject(error)
      } finally {
        isRefreshing = false
      }
    }
    return Promise.reject(error)
  }
)

function _redirectLogin() {
  localStorage.removeItem('token')
  localStorage.removeItem('refreshToken')
  if (window.location.pathname !== '/login') {
    window.location.href = '/login'
  }
}

export default request
