<template>
  <el-container class="layout-container">
    <!-- 侧边栏 -->
    <el-aside :width="isCollapsed ? '64px' : '220px'" class="sidebar">
      <div class="sidebar-logo">
        <img src="/logo.png" class="logo-icon" alt="logo" />
        <span v-show="!isCollapsed" class="logo-text">管理后台</span>
      </div>

      <el-menu
        :default-active="activeMenu"
        :collapse="isCollapsed"
        :collapse-transition="false"
        background-color="#ffffff"
        text-color="#475569"
        active-text-color="#5e6ad2"
        router
        class="sidebar-menu"
      >
        <template v-for="item in menuTree" :key="item.route || item.id">
          <el-sub-menu v-if="item.children && item.children.length" :index="item.route || 'sub-' + item.id">
            <template #title>
              <el-icon><component :is="iconMap[item.icon] || House" /></el-icon>
              <span>{{ item.name }}</span>
            </template>
            <el-menu-item v-for="child in item.children" :key="child.route" :index="child.route">
              <el-icon><component :is="iconMap[child.icon] || House" /></el-icon>
              <template #title>{{ child.name }}</template>
            </el-menu-item>
          </el-sub-menu>
          <el-menu-item v-else :index="item.route">
            <el-icon><component :is="iconMap[item.icon] || House" /></el-icon>
            <template #title>{{ item.name }}</template>
          </el-menu-item>
        </template>
      </el-menu>

      <div class="sidebar-version">
        <span v-show="!isCollapsed" class="version-label">版本</span>
        <span class="version-num">{{ appVersion }}</span>
      </div>
    </el-aside>

    <el-container>
      <!-- 顶部栏 -->
      <el-header class="topbar">
        <div class="topbar-left">
          <el-icon class="collapse-btn" @click="isCollapsed = !isCollapsed">
            <Fold v-if="!isCollapsed" />
            <Expand v-else />
          </el-icon>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item>RPA系统</el-breadcrumb-item>
            <el-breadcrumb-item>{{ currentTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>

        <div class="topbar-right">
          <el-dropdown @command="handleCommand">
            <div class="user-info">
              <el-avatar :size="32" style="background:#5e6ad2;font-size:13px;font-weight:600">
                {{ userInfo?.username?.charAt(0)?.toUpperCase() }}
              </el-avatar>
              <span class="username">{{ userInfo?.username }}</span>
              <el-icon><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">
                  <el-icon><SwitchButton /></el-icon> 退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- 内容区 -->
      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { version as appVersion } from '../../package.json'
import { useRoute, useRouter } from 'vue-router'
import { ElMessageBox } from 'element-plus'
import { useUserStore } from '../stores/user'
import { getMenuTree } from '../api/menus'
import {
  House, User, Connection, Monitor, Document, Files, Grid, ChatLineSquare, ChatDotRound,
  Fold, Expand, ArrowDown, SwitchButton, Key, Menu as MenuIcon, Reading, Setting,
} from '@element-plus/icons-vue'

// Element Plus 图标名称 → 组件映射
var iconMap = {
  House, User, Connection, Monitor, Document, Files, Grid, ChatLineSquare, ChatDotRound,
  Key, Menu: MenuIcon, Reading, Setting,
}

var route = useRoute()
var router = useRouter()
var store = useUserStore()

var isCollapsed = ref(false)
var userInfo = computed(function () { return store.userInfo })
var activeMenu = computed(function () { return route.path })
var menuTree = ref([])
var menuTitleMap = ref({})

var currentTitle = computed(function () {
  return menuTitleMap.value[route.path] || route.meta?.title || route.name || '控制台'
})

onMounted(async function () {
  await loadMenus()
})

async function loadMenus() {
  try {
    var res = await getMenuTree()
    if (res.code === 0) {
      menuTree.value = res.data || []
      // 构建路由→标题映射
      var map = {}
      function walk(items) {
        items.forEach(function (item) {
          if (item.route) map[item.route] = item.name
          if (item.children) walk(item.children)
        })
      }
      walk(res.data || [])
      menuTitleMap.value = map
    }
  } catch (e) {
    // fallback — 侧边栏为空不阻塞页面
  }
}

async function handleCommand(cmd) {
  if (cmd === 'logout') {
    await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await store.logout()
    router.push('/login')
  }
}
</script>

<style scoped>
.layout-container { height: 100vh; overflow: hidden; }

.sidebar {
  background-color: var(--rpa-sidebar, #ffffff);
  border-right: 1px solid var(--rpa-border, #e5e7eb);
  transition: width 0.2s;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sidebar-logo {
  height: 60px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border-bottom: 1px solid var(--rpa-border, #e5e7eb);
  flex-shrink: 0;
}

.logo-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  flex-shrink: 0;
  object-fit: contain;
}

.logo-text {
  color: var(--rpa-ink, #0f172a);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.sidebar-menu {
  border-right: none;
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.sidebar-version {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  border-top: 1px solid var(--rpa-border, #e5e7eb);
  font-size: 12px;
  color: var(--rpa-ink-3, #94a3b8);
}

.version-label { color: var(--rpa-ink-3, #94a3b8); }
.version-num { font-weight: 600; color: var(--rpa-brand, #5e6ad2); font-family: 'SF Mono','Menlo','Monaco',monospace; }

:deep(.el-menu) { background-color: transparent !important; }

:deep(.el-menu-item),
:deep(.el-sub-menu__title) {
  height: 44px;
  line-height: 44px;
  border-radius: 8px;
  margin: 2px 0;
  font-weight: 500;
  font-size: 13.5px;
  color: var(--rpa-ink-2, #475569) !important;
  transition: background-color .15s ease, color .15s ease;
}

:deep(.el-menu-item:hover),
:deep(.el-sub-menu__title:hover) {
  background-color: var(--rpa-sidebar-hover, #f3f4f9) !important;
  color: var(--rpa-ink, #0f172a) !important;
}

:deep(.el-menu-item.is-active) {
  background-color: var(--rpa-brand-soft, #eef0ff) !important;
  color: var(--rpa-brand, #5e6ad2) !important;
  font-weight: 600;
}

:deep(.el-menu-item.is-active .el-icon),
:deep(.el-menu-item.is-active i) { color: var(--rpa-brand, #5e6ad2) !important; }

.topbar {
  height: 56px;
  background: #fff;
  border-bottom: 1px solid var(--rpa-border, #e5e7eb);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

.topbar-left { display: flex; align-items: center; gap: 16px; }

.collapse-btn {
  font-size: 18px;
  cursor: pointer;
  color: var(--rpa-ink-2, #475569);
  padding: 6px;
  border-radius: 6px;
  transition: background .15s ease, color .15s ease;
}
.collapse-btn:hover {
  background: var(--rpa-sidebar-hover, #f3f4f9);
  color: var(--rpa-ink, #0f172a);
}

:deep(.el-breadcrumb__inner) {
  color: var(--rpa-ink-2, #475569) !important;
  font-weight: 500;
}
:deep(.el-breadcrumb__item:last-child .el-breadcrumb__inner) {
  color: var(--rpa-ink, #0f172a) !important;
  font-weight: 600;
}

.topbar-right { display: flex; align-items: center; }

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 8px;
  transition: background .15s ease;
}
.user-info:hover { background: var(--rpa-sidebar-hover, #f3f4f9); }
.username { font-size: 13.5px; color: var(--rpa-ink, #0f172a); font-weight: 500; }

.main-content {
  background: var(--rpa-canvas, #f7f8fa);
  padding: 20px;
  overflow-y: auto;
}
</style>
