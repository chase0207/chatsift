// TODO V2.0 改造: V1.x 路由替换为 V2.0 路由，见 runtime-disposition 第 7 节
import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '../stores/user'
import { ElMessage } from 'element-plus'
import { routeAllowed, defaultPath, entryMode } from '../utils/entry'

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
      { path: 'home',      name: 'Home',      component: () => import('../views/Home.vue'), meta: { title: '首页' } },
      { path: 'users',     name: 'Users',     component: () => import('../views/Users.vue') },
      { path: 'tenants',   name: 'Tenants',   component: () => import('../views/Tenants.vue'), meta: { title: '租户管理' } },
      { path: 'service-accounts', name: 'ServiceAccounts', component: () => import('../views/ServiceAccounts.vue'), meta: { title: '客服账号' } },
      { path: 'plugins',      name: 'Plugins',   component: () => import('../views/Plugins.vue') },
      { path: 'myplugins',   redirect: '/plugins' },
      { path: 'platforms',  name: 'Platforms',  component: () => import('../views/Platforms.vue') },
      { path: 'roles',    name: 'Roles',    component: () => import('../views/Roles.vue') },
      { path: 'menus',    name: 'Menus',    component: () => import('../views/Menus.vue') },
      { path: 'conversations', name: 'Conversations', component: () => import('../views/Conversations.vue'), meta: { title: '会话中心' } },
      { path: 'conversations/:id', name: 'ConversationDetail', component: () => import('../views/ConversationDetail.vue'), meta: { title: '会话详情' } },
      { path: 'leads', name: 'Leads', component: () => import('../views/Leads.vue'), meta: { title: '线索中心' } },
      { path: 'leads/:id', name: 'LeadDetail', component: () => import('../views/LeadDetail.vue'), meta: { title: '线索详情' } },
      { path: 'workorders', name: 'Workorders', component: () => import('../views/Workorders.vue'), meta: { title: '工单中心' } },
      { path: 'analytics', name: 'Analytics', component: () => import('../views/Analytics.vue'), meta: { title: '运营分析' } },
      { path: 'logs', name: 'Logs', component: () => import('../views/Logs.vue'), meta: { title: '日志中心' } },
      { path: 'aggregate', name: 'Aggregate', component: () => import('../views/Aggregate.vue'), meta: { title: '消息聚合' } },
      { path: 'settings', name: 'Settings', redirect: '/settings/llm', meta: { title: '系统设置' } },
      { path: 'settings/llm', name: 'LlmConfig', component: () => import('../views/LlmConfig.vue'), meta: { title: 'LLM配置' } },
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
    return next(defaultPath(entryMode()))
  }
  // W16 入口域名过滤: 平台(admin)/租户(mychat) 各自只放行对应路由(dev/未知域名='all'不过滤)
  if (store.isLoggedIn && to.path !== '/login' && !routeAllowed(to.path)) {
    const dp = defaultPath(entryMode())
    if (to.path !== dp) return next(dp)
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
  Home: 'home:view',
  Users: 'user:list',
  Tenants: 'tenant:list',
  ServiceAccounts: 'service-account:list',
  Plugins: 'plugin:list',
  Platforms: 'platform:list',
  Roles: 'role:list',
  Menus: 'menu:list',
  Conversations: 'conversation:list',
  ConversationDetail: 'conversation:list',
  Leads: 'lead:manage',
  LeadDetail: 'lead:manage',
  Workorders: 'workorder:handle',
  Analytics: 'analytics:view',
  Logs: 'log:list',
  Aggregate: 'aggregate:view',
  Settings: 'settings',
  LlmConfig: 'llm:config',
}

export default router
