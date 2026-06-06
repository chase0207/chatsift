// W16 入口模式: 按域名区分"平台入口(admin)"与"租户入口(mychat)"。
// 数据安全靠后端 tenant_id 过滤;此处仅做视角/菜单分离。dev/未知域名不过滤(='all')。

export const PLATFORM_ROUTES = ['/dashboard', '/users', '/tenants', '/service-accounts', '/plugins', '/myplugins', '/platforms', '/roles', '/menus', '/logs']
export const TENANT_ROUTES = ['/home', '/conversations', '/leads', '/workorders', '/analytics', '/aggregate', '/settings']

export function entryMode(hostname) {
  const h = hostname || (typeof window !== 'undefined' ? window.location.hostname : '')
  if (/mychat/i.test(h)) return 'tenant'
  if (/admin/i.test(h)) return 'platform' // admin / test-admin
  return 'all' // localhost / IP / 未知 → 不过滤
}

export function defaultPath(mode) {
  if (mode === 'tenant') return '/home'
  return '/dashboard'
}

function classify(path) {
  if (TENANT_ROUTES.some((p) => path === p || path.startsWith(p + '/'))) return 'tenant'
  if (PLATFORM_ROUTES.some((p) => path === p || path.startsWith(p + '/'))) return 'platform'
  return 'shared'
}

// 路由是否允许在当前入口访问
export function routeAllowed(path, mode) {
  const m = mode || entryMode()
  if (m === 'all') return true
  const c = classify(path)
  if (c === 'shared') return true
  return c === m
}

// 过滤菜单树顶层项(menuTree from server),只保留当前入口该见的
export function filterMenuTree(tree, mode) {
  const m = mode || entryMode()
  if (m === 'all' || !Array.isArray(tree)) return tree
  return tree.filter((item) => {
    const route = item.route || ''
    if (!route) return true // 无 route 的分组项保留(其子项由后端 tree 决定)
    const c = classify(route)
    return c === 'shared' || c === m
  })
}
