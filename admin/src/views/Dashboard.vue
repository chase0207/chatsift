<template>
  <div class="dashboard">
    <el-card class="welcome-card" shadow="never">
      <div class="welcome-inner">
        <el-icon class="welcome-icon"><House /></el-icon>
        <div>
          <h2>欢迎使用 Chatsift 会话分拣后台</h2>
          <p>当前登录账号：<strong>{{ userInfo?.username }}</strong>（角色：{{ roleLabel }}）</p>
        </div>
      </div>
    </el-card>

    <el-row :gutter="16" class="stat-row">
      <el-col :span="6" v-for="item in stats" :key="item.label">
        <el-card class="stat-card" shadow="hover">
          <el-statistic :title="item.label" :value="item.value">
            <template #prefix>
              <el-icon :style="{ color: item.color }">
                <component :is="item.icon" />
              </el-icon>
            </template>
          </el-statistic>
        </el-card>
      </el-col>
    </el-row>

    <!-- 插件更新 -->
    <el-card v-if="pluginUpdate" class="plugin-card" shadow="never">
      <div class="plugin-head">
        <div class="plugin-title">插件更新</div>
      </div>
      <div class="plugin-meta">
        <span>当前版本：v{{ pluginUpdate.version }}</span>
        <span>更新日期：{{ pluginUpdate.releaseDate }}</span>
        <el-tag :type="tagType" size="small" effect="dark">{{ pluginUpdate.suggestionLabel }}</el-tag>
        <el-button type="primary" :icon="Download" size="small" @click="handleDownload">
          下载 ZIP
        </el-button>
      </div>
    </el-card>

  </div>
</template>

<script setup>
import { computed, reactive, ref, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
import { House, User, Connection, ChatDotRound, Monitor, Download } from '@element-plus/icons-vue'
import { getStats } from '../api/dashboard'
import { getPluginUpdate, downloadPluginZip } from '../api/plugin-update'

const store    = useUserStore()
const userInfo = computed(() => store.userInfo)
// W19 两层:内外用 user_type、角色用 role_name(RBAC 第一步,不再用 role===9)
const roleLabel = computed(() => userInfo.value?.role_name || (userInfo.value?.user_type === 'internal' ? '平台方' : '租户方'))

const stats = reactive([
  { label: '用户总数',   value: 0, icon: User,          color: '#409eff' },
  { label: '授权插件',   value: 0, icon: Connection,     color: '#67c23a' },
  { label: '今日消息',   value: 0, icon: ChatDotRound,   color: '#e6a23c' },
  { label: '在线设备',   value: 0, icon: Monitor,        color: '#f56c6c' },
])

const pluginUpdate = ref(null)

const tagType = computed(() => {
  var map = { 'must-update': 'danger', 'suggest-update': 'warning', 'optional-update': 'info' }
  return map[pluginUpdate.value?.suggestion] || 'info'
})

async function handleDownload() {
  try {
    var blob = await downloadPluginZip()
    var url = URL.createObjectURL(blob)
    var a = document.createElement('a')
    a.href = url
    a.download = pluginUpdate.value?.zipName || 'plugin.zip'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (e) {
    console.error('[plugin download]', e)
  }
}

onMounted(async () => {
  try {
    const res = await getStats()
    if (res.code === 0 && res.data) {
      stats[0].value = res.data.users ?? 0
      stats[1].value = res.data.plugins ?? 0
      stats[2].value = res.data.messages ?? 0
      stats[3].value = res.data.devices ?? 0
    }
  } catch (e) {
    // ignore — display 0 on error
  }
  try {
    var up = await getPluginUpdate()
    if (up.code === 0 && up.data) pluginUpdate.value = up.data
  } catch (e) {}
})
</script>

<style scoped>
.dashboard { padding: 0; }

.welcome-card {
  border-radius: 10px;
  margin-bottom: 20px;
  background: linear-gradient(135deg, #ecf5ff, #f0f9eb);
  border: none;
}

.welcome-inner {
  display: flex;
  align-items: center;
  gap: 20px;
}

.welcome-icon {
  font-size: 52px;
  color: #409eff;
}

.welcome-inner h2 {
  margin: 0 0 6px;
  font-size: 20px;
  color: #1d2129;
}

.welcome-inner p {
  margin: 0;
  color: #4e5969;
  font-size: 14px;
}

.stat-row { margin-top: 8px; }

.stat-card {
  border-radius: 10px;
  text-align: center;
}

.plugin-card {
  margin-top: 20px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
}
.plugin-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.plugin-title {
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}
.plugin-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
  color: #64748b;
}
</style>
