<template>
  <div class="home">
    <el-card class="welcome-card" shadow="never">
      <div class="welcome-inner">
        <el-icon class="welcome-icon"><House /></el-icon>
        <div>
          <h2>{{ tenant?.name || '我的工作台' }}</h2>
          <p>
            <span v-if="tenant?.contact">联系人：{{ tenant.contact }}　</span>
            <span>到期：{{ tenant?.expire_at || '永久' }}</span>
            <span style="margin-left:12px">登录：<strong>{{ userInfo?.username }}</strong>（{{ roleLabel }}）</span>
          </p>
        </div>
      </div>
    </el-card>

    <el-row :gutter="16" class="stat-row">
      <el-col :span="6" v-for="item in stats" :key="item.label">
        <el-card class="stat-card" shadow="hover">
          <el-statistic :title="item.label" :value="item.value">
            <template #prefix><el-icon :style="{ color: item.color }"><component :is="item.icon" /></el-icon></template>
          </el-statistic>
        </el-card>
      </el-col>
    </el-row>

    <el-card v-if="pluginUpdate" class="plugin-card" shadow="never">
      <div class="plugin-head"><div class="plugin-title">插件下载</div></div>
      <div class="plugin-meta">
        <span>当前版本：v{{ pluginUpdate.version }}</span>
        <span>更新日期：{{ pluginUpdate.releaseDate }}</span>
        <el-button type="primary" :icon="Download" size="small" @click="handleDownload">下载 ZIP</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { computed, reactive, ref, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
import { House, User, ChatDotRound, Tickets, Connection, Download } from '@element-plus/icons-vue'
import { getHome } from '../api/home'
import { getPluginUpdate, downloadPluginZip } from '../api/plugin-update'

const store    = useUserStore()
const userInfo = computed(() => store.userInfo)
const roleLabel = computed(() => userInfo.value?.role_name || (userInfo.value?.user_type === 'internal' ? '平台方' : '租户方'))

const tenant = ref(null)
const isTenantAdmin = ref(false)
const stats = reactive([
  { key: 'conversations', label: '对话数', value: 0, icon: ChatDotRound, color: '#409eff' },
  { key: 'leads',         label: '线索数', value: 0, icon: Connection,   color: '#67c23a' },
  { key: 'workorders',    label: '工单数', value: 0, icon: Tickets,      color: '#e6a23c' },
])
const pluginUpdate = ref(null)

async function handleDownload() {
  try {
    const blob = await downloadPluginZip()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = pluginUpdate.value?.zipName || 'plugin.zip'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (e) { console.error('[plugin download]', e) }
}

onMounted(async () => {
  try {
    const res = await getHome()
    if (res.code === 0 && res.data) {
      tenant.value = res.data.tenant
      const b = res.data.board || {}
      stats[0].value = b.conversations ?? 0
      stats[1].value = b.leads ?? 0
      stats[2].value = b.workorders ?? 0
      if (b.level === 'tenant') {
        isTenantAdmin.value = true
        stats.push({ key: 'employees', label: '员工数', value: b.employees ?? 0, icon: User, color: '#f56c6c' })
      }
    }
  } catch (e) { /* ignore */ }
  try {
    const up = await getPluginUpdate()
    if (up.code === 0 && up.data) pluginUpdate.value = up.data
  } catch (e) { /* ignore */ }
})
</script>

<style scoped>
.welcome-card { border-radius: 10px; margin-bottom: 20px; background: linear-gradient(135deg, #ecf5ff, #f0f9eb); border: none; }
.welcome-inner { display: flex; align-items: center; gap: 20px; }
.welcome-icon { font-size: 52px; color: #409eff; }
.welcome-inner h2 { margin: 0 0 6px; font-size: 20px; color: #1d2129; }
.welcome-inner p { margin: 0; color: #4e5969; font-size: 14px; }
.stat-row { margin-top: 8px; }
.stat-card { border-radius: 10px; text-align: center; }
.plugin-card { margin-top: 20px; border-radius: 10px; border: 1px solid #e5e7eb; }
.plugin-head { margin-bottom: 12px; }
.plugin-title { font-size: 16px; font-weight: 600; color: #0f172a; }
.plugin-meta { display: flex; align-items: center; gap: 16px; font-size: 13px; color: #64748b; }
</style>
