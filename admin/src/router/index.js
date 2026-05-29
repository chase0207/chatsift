// TODO V2.0 改造: V1.x 路由替换为 V2.0 路由，见 runtime-disposition 第 7 节
import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '../stores/user'
import { ElMessage } from 'element-plus'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
  },
  {
    path: '/',
    component: () => import('../layouts/MainLayout.vue'),
    redirect: '/dashboard',
    meta: { requiresAuth: true },
    children: [
      { path: 'dashboard', name: 'Dashboard', component: () => import('../views/Dashboard.vue') },
      { path: 'users',     name: 'Users',     component: () => import('../views/Users.vue') },
      { path: 'plugins',      name: 'Plugins',   component: () => import('../views/Plugins.vue') },
      { path: 'myplugins',   redirect: '/plugins' },
      { path: 'devices',   name: 'Devices',   component: () => import('../views/Devices.vue') },
      { path: 'logs',      name: 'Logs',      component: () => import('../views/Logs.vue') },
      { path: 'platforms',  name: 'Platforms',  component: () => import('../views/Platforms.vue') },
      { path: 'messages', name: 'Messages', component: () => import('../views/Messages.vue') },
      { path: 'roles',    name: 'Roles',    component: () => import('../views/Roles.vue') },
      { path: 'menus',    name: 'Menus',    component: () => import('../views/Menus.vue') },
      // V1.9 Runtime 可观测
      { path: 'runtime/dashboard',         name: 'RuntimeDashboard', component: () => import('../views/runtime/RuntimeDashboard.vue') },
      { path: 'runtime/batches',           name: 'BatchList',        component: () => import('../views/runtime/Batches.vue') },
      { path: 'runtime/batches/:batchId',  name: 'BatchTrace',       component: () => import('../views/runtime/BatchTrace.vue') },
      { path: 'runtime/sessions',          name: 'SessionList',      component: () => import('../views/runtime/Sessions.vue') },
      { path: 'runtime/sessions/:sessionId', name: 'SessionDetail',  component: () => import('../views/runtime/SessionDetail.vue') },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, _from, next) => {
  const store = useUserStore()
  if (to.meta.requiresAuth && !store.isLoggedIn) {
    return next({ path: '/login', query: { redirect: to.fullPath } })
  }
  if (to.path === '/login' && store.isLoggedIn) {
    return next('/dashboard')
  }
  // 权限检查：非超级管理员，检查是否有该路由的权限
  if (store.isLoggedIn && to.path !== '/login' && to.path !== '/dashboard') {
    var user = store.userInfo
    if (user && !user.is_super && user.permissions && to.name) {
      var permCode = routePermMap[to.name]
      if (permCode && user.permissions.indexOf(permCode) === -1) {
        ElMessage.warning('暂无权限访问 ' + (to.name || '该页面'))
        return next('/dashboard')
      }
    }
  }
  next()
})

// 路由 → 权限编码映射表
var routePermMap = {
  Dashboard: 'dashboard',
  Users: 'user:list',
  Plugins: 'plugin:list',
  Platforms: 'platform:list',
  Devices: 'device:list',
  Logs: 'log:list',
  Messages: 'message:list',
  Roles: 'role:list',
  Menus: 'menu:list',
  RuntimeDashboard: 'runtime:dashboard',
  BatchList:        'runtime:batches',
  BatchTrace:       'runtime:batches',
  SessionList:      'runtime:sessions',
  SessionDetail:    'runtime:sessions',
}

export default router
