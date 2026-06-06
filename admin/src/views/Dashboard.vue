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

    <!-- 运行质量 -->
    <el-card class="quality-card" shadow="never">
      <div class="quality-head">
        <div class="quality-title">运行质量监控</div>
        <div class="quality-filters">
          <el-date-picker
            v-model="qualityDateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            size="small"
            value-format="YYYY-MM-DD"
            style="width: 240px"
            @change="fetchQualityStats"
          />
          <el-select
            v-model="qualityPlatform"
            placeholder="全部平台"
            size="small"
            clearable
            style="width: 130px"
            @change="fetchQualityStats"
          >
            <el-option v-for="p in platformOptions" :key="p" :label="p" :value="p" />
          </el-select>
        </div>
      </div>

      <el-row :gutter="12" class="quality-summary" v-if="qualitySummary">
        <el-col :span="4">
          <div class="qs-item">
            <div class="qs-value">{{ qualitySummary.total }}</div>
            <div class="qs-label">总处理数</div>
          </div>
        </el-col>
        <el-col :span="4">
          <div class="qs-item">
            <div class="qs-value">{{ qualitySummary.success }}</div>
            <div class="qs-label">总成功数</div>
          </div>
        </el-col>
        <el-col :span="4">
          <div class="qs-item">
            <div class="qs-value qs-rate">{{ qualitySummary.successRate }}</div>
            <div class="qs-label">成功率</div>
          </div>
        </el-col>
        <el-col :span="4">
          <div class="qs-item">
            <div class="qs-value">{{ qualitySummary.aiCalls }}</div>
            <div class="qs-label">AI 调用</div>
          </div>
        </el-col>
        <el-col :span="4">
          <div class="qs-item">
            <div class="qs-value">{{ qualitySummary.keywordHits }}</div>
            <div class="qs-label">关键词命中</div>
          </div>
        </el-col>
        <el-col :span="4">
          <div class="qs-item">
            <div class="qs-value">{{ qualitySummary.humanTransfers }}</div>
            <div class="qs-label">转人工</div>
          </div>
        </el-col>
      </el-row>
      <el-row :gutter="12" class="quality-summary quality-summary-2" v-if="qualitySummary">
        <el-col :span="8">
          <div class="qs-item">
            <div class="qs-value">{{ qualitySummary.avgResponseTime }}</div>
            <div class="qs-label">平均响应时长</div>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="qs-item">
            <div class="qs-value qs-error">{{ qualitySummary.errors }}</div>
            <div class="qs-label">错误次数</div>
          </div>
        </el-col>
      </el-row>
    </el-card>
  </div>
</template>

<script setup>
import { computed, reactive, ref, onMounted } from 'vue'
import { useUserStore } from '../stores/user'
import { House, User, Connection, ChatDotRound, Monitor, Download } from '@element-plus/icons-vue'
import { getStats } from '../api/dashboard'
import { getPluginUpdate, downloadPluginZip } from '../api/plugin-update'
import { getAdminStats } from '../api/stats'

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

const qualityDateRange = ref(defaultDateRange())
const qualityPlatform = ref('')
const qualityLoading = ref(false)
const qualitySummary = ref(null)
const platformOptions = ref([])

function defaultDateRange() {
  var end = new Date()
  var start = new Date()
  start.setDate(start.getDate() - 6)
  function fmt(d) {
    return d.toISOString().slice(0, 10)
  }
  return [fmt(start), fmt(end)]
}

function fmtRate(success, total) {
  if (!total) return '0.0%'
  return (success / total * 100).toFixed(1) + '%'
}

function fmtMs(ms) {
  if (ms == null || ms === 0) return '-'
  return (ms / 1000).toFixed(1) + 's'
}

async function fetchQualityStats() {
  qualityLoading.value = true
  try {
    var params = {}
    if (qualityDateRange.value && qualityDateRange.value.length === 2) {
      params.start_date = qualityDateRange.value[0]
      params.end_date = qualityDateRange.value[1]
    }
    if (qualityPlatform.value) params.platform = qualityPlatform.value
    var res = await getAdminStats(params)
    if (res.code === 0 && res.data) {
      var s = res.data.summary || {}
      qualitySummary.value = {
        total: s.total ?? 0,
        success: s.success ?? 0,
        successRate: fmtRate(s.success, s.total),
        aiCalls: s.ai_calls ?? 0,
        keywordHits: s.keyword_hits ?? 0,
        humanTransfers: s.human_transfers ?? 0,
        avgResponseTime: fmtMs(s.avg_response_time),
        errors: s.errors ?? 0,
      }
      var details = res.data.devices || []
      var platforms = [...new Set(details.map(function(d) { return d.platform }).filter(Boolean))]
      if (platforms.length) platformOptions.value = platforms
    }
  } catch (e) {
    // ignore
  } finally {
    qualityLoading.value = false
  }
}
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
  fetchQualityStats()
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

.quality-card {
  margin-top: 20px;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
}
.quality-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.quality-title {
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}
.quality-filters {
  display: flex;
  gap: 10px;
  align-items: center;
}
.quality-summary {
  margin-bottom: 8px;
}
.quality-summary-2 {
  margin-bottom: 16px;
}
.qs-item {
  background: #f8fafc;
  border-radius: 8px;
  padding: 12px 16px;
  text-align: center;
}
.qs-value {
  font-size: 22px;
  font-weight: 600;
  color: #1d2129;
  line-height: 1.2;
}
.qs-rate {
  color: #67c23a;
}
.qs-error {
  color: #f56c6c;
}
.qs-label {
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
}
</style>
