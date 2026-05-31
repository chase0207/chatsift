<template>
  <div>
    <el-card shadow="never" class="toolbar-card">
      <el-form :model="filters" inline class="filter-form">
        <el-form-item label="日期">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
            style="width:260px"
            @change="fetchAll"
          />
        </el-form-item>
        <el-form-item label="平台页面">
          <el-select v-model="filters.platform_page" clearable placeholder="全部页面" style="width:190px" @change="fetchAll">
            <el-option v-for="item in pageOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="fetchAll">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" style="margin-top:16px" v-loading="loading">
      <template #header>
        <span style="font-weight:600">转化漏斗</span>
      </template>
      <div class="funnel-grid">
        <div class="funnel-item inquiry">
          <div class="funnel-label">咨询</div>
          <div class="funnel-value">{{ funnel.inquiry }}</div>
          <el-progress :percentage="100" :stroke-width="10" />
        </div>
        <div class="funnel-item lead">
          <div class="funnel-label">留资</div>
          <div class="funnel-value">{{ funnel.lead }}</div>
          <el-progress :percentage="Number(funnel.leadRate || 0)" :stroke-width="10" status="success" />
          <el-text type="info" size="small">留资率 {{ funnel.leadRate || 0 }}%</el-text>
        </div>
        <div class="funnel-item appointment">
          <div class="funnel-label">预约</div>
          <div class="funnel-value">{{ funnel.appointment }}</div>
          <el-progress :percentage="Number(funnel.appointmentRate || 0)" :stroke-width="10" status="warning" />
          <el-text type="info" size="small">预约率 {{ funnel.appointmentRate || 0 }}%</el-text>
        </div>
      </div>
    </el-card>

    <el-row :gutter="16" style="margin-top:16px">
      <el-col :span="12">
        <el-card shadow="never" v-loading="loading">
          <template #header>
            <span style="font-weight:600">意图分布</span>
          </template>
          <div class="dist-list">
            <div v-for="item in intentRows" :key="item.intent_label" class="dist-row">
              <div class="dist-name">
                <el-tag :type="intentMap[item.intent_label]?.type || 'info'" size="small">
                  {{ intentMap[item.intent_label]?.label || item.intent_label || 'unknown' }}
                </el-tag>
                <span>{{ item.count }}</span>
              </div>
              <el-progress :percentage="ratio(item.count, intentTotal)" :stroke-width="8" />
            </div>
            <el-empty v-if="!intentRows.length" description="暂无数据" />
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="never" v-loading="loading">
          <template #header>
            <span style="font-weight:600">意向度分布</span>
          </template>
          <div class="dist-list">
            <div v-for="item in levelRows" :key="item.lead_level" class="dist-row">
              <div class="dist-name">
                <el-tag :type="levelMap[item.lead_level]?.type || 'info'" size="small">
                  {{ levelMap[item.lead_level]?.label || item.lead_level || 'unknown' }}
                </el-tag>
                <span>{{ item.count }}</span>
              </div>
              <el-progress :percentage="ratio(item.count, levelTotal)" :stroke-width="8" />
            </div>
            <el-empty v-if="!levelRows.length" description="暂无数据" />
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" style="margin-top:16px" v-loading="loading">
      <template #header>
        <span style="font-weight:600">平台页面对比</span>
      </template>
      <el-table :data="byPageRows" stripe>
        <el-table-column prop="platform_page" label="平台页面" min-width="180" />
        <el-table-column prop="inquiry" label="咨询" width="110" />
        <el-table-column prop="lead" label="留资" width="110" />
        <el-table-column prop="appointment" label="预约" width="110" />
        <el-table-column label="留资率" width="160">
          <template #default="{ row }">
            <el-progress :percentage="Number(row.leadRate || 0)" :stroke-width="8" />
          </template>
        </el-table-column>
        <el-table-column label="预约率" width="160">
          <template #default="{ row }">
            <el-progress :percentage="Number(row.appointmentRate || 0)" :stroke-width="8" />
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never" style="margin-top:16px" v-loading="loading">
      <template #header>
        <span style="font-weight:600">时间趋势</span>
      </template>
      <el-table :data="trendRows" stripe>
        <el-table-column prop="date" label="日期" width="140" />
        <el-table-column prop="inquiry" label="咨询" width="110" />
        <el-table-column prop="lead" label="留资" width="110" />
        <el-table-column prop="appointment" label="预约" width="110" />
        <el-table-column label="咨询趋势" min-width="220">
          <template #default="{ row }">
            <el-progress :percentage="ratio(row.inquiry, trendMax)" :stroke-width="8" />
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getByPage, getFunnel, getIntentDist, getLeadLevel, getTrend } from '../api/analytics'

const loading = ref(false)
const dateRange = ref(defaultDateRange())
const filters = reactive({ platform_page: '' })
const funnel = ref({ inquiry: 0, lead: 0, appointment: 0, leadRate: 0, appointmentRate: 0 })
const intentRows = ref([])
const levelRows = ref([])
const byPageRows = ref([])
const trendRows = ref([])

const intentMap = {
  simple_inquiry: { label: '简单咨询', type: 'info' },
  appointment: { label: '预约', type: 'success' },
  complaint: { label: '投诉', type: 'danger' },
  price_inquiry: { label: '询价', type: 'warning' },
}

const levelMap = {
  high: { label: '高意向', type: 'danger' },
  mid: { label: '中意向', type: 'warning' },
  low: { label: '低意向', type: 'info' },
}

const intentTotal = computed(() => intentRows.value.reduce((sum, item) => sum + Number(item.count || 0), 0))
const levelTotal = computed(() => levelRows.value.reduce((sum, item) => sum + Number(item.count || 0), 0))
const trendMax = computed(() => Math.max(1, ...trendRows.value.map((row) => Number(row.inquiry || 0))))
const pageOptions = computed(() => byPageRows.value.map((row) => row.platform_page).filter(Boolean))

function defaultDateRange() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 29)
  return [formatDate(start), formatDate(end)]
}

function formatDate(date) {
  const pad = (num) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function params() {
  const result = {}
  if (dateRange.value?.length === 2) {
    result.from = dateRange.value[0]
    result.to = dateRange.value[1]
  }
  if (filters.platform_page) result.platform_page = filters.platform_page
  return result
}

async function fetchAll() {
  loading.value = true
  try {
    const query = params()
    const [funnelRes, intentRes, levelRes, pageRes, trendRes] = await Promise.all([
      getFunnel(query),
      getIntentDist(query),
      getLeadLevel(query),
      getByPage(query),
      getTrend(query),
    ])
    funnel.value = funnelRes.data || {}
    intentRows.value = intentRes.data || []
    levelRows.value = levelRes.data || []
    byPageRows.value = pageRes.data || []
    trendRows.value = trendRes.data || []
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '加载运营分析失败')
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  dateRange.value = defaultDateRange()
  filters.platform_page = ''
  fetchAll()
}

function ratio(value, total) {
  const base = Number(total || 0)
  if (!base) return 0
  return Math.min(100, Math.round(Number(value || 0) / base * 100))
}

onMounted(fetchAll)
</script>

<style scoped>
.toolbar-card :deep(.el-card__body) { padding: 14px 20px; }
.filter-form { display: flex; flex-wrap: wrap; gap: 0 4px; }
.filter-form :deep(.el-form-item) { margin-bottom: 0; }
.funnel-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.funnel-item { border: 1px solid var(--rpa-border, #e5e7eb); border-radius: 8px; padding: 16px; background: #fff; }
.funnel-label { color: var(--rpa-ink-2, #475569); font-size: 13px; margin-bottom: 8px; }
.funnel-value { font-size: 30px; font-weight: 700; color: var(--rpa-ink, #0f172a); margin-bottom: 10px; }
.dist-list { display: flex; flex-direction: column; gap: 14px; min-height: 180px; }
.dist-row { display: grid; grid-template-columns: 140px 1fr; gap: 12px; align-items: center; }
.dist-name { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
</style>
