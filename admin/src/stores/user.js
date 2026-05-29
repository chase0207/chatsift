import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as authApi from '../api/auth'

export const useUserStore = defineStore('user', () => {
  const token        = ref(localStorage.getItem('token') || '')
  const refreshToken = ref(localStorage.getItem('refreshToken') || '')
  const userInfo     = ref(JSON.parse(localStorage.getItem('userInfo') || 'null'))

  const isLoggedIn = computed(() => !!token.value)

  // null = 超管（全部放行）；数组 = 仅包含的权限码
  const permissions = computed(() => userInfo.value?.permissions ?? null)

  function hasPerm(code) {
    if (permissions.value === null) return true
    return Array.isArray(permissions.value) && permissions.value.includes(code)
  }

  async function login(username, password) {
    const res = await authApi.login(username, password)
    token.value        = res.data.token
    refreshToken.value = res.data.refreshToken
    userInfo.value     = res.data.userInfo
    localStorage.setItem('token',        res.data.token)
    localStorage.setItem('refreshToken', res.data.refreshToken)
    localStorage.setItem('userInfo',     JSON.stringify(res.data.userInfo))
    return res
  }

  async function doRefreshToken() {
    const res = await authApi.refresh(refreshToken.value)
    token.value = res.data.token
    localStorage.setItem('token', res.data.token)
    return res.data.token
  }

  async function logout() {
    try { await authApi.logout() } catch {}
    token.value        = ''
    refreshToken.value = ''
    userInfo.value     = null
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('userInfo')
  }

  return { token, refreshToken, userInfo, isLoggedIn, permissions, hasPerm, login, logout, doRefreshToken }
})
