<template>
  <div>
    <el-card shadow="never" class="toolbar-card">
      <el-form :model="filters" inline class="filter-form">
        <el-form-item label="状态">
          <el-select v-model="filters.status" clearable placeholder="全部状态" style="width:140px">
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="意向">
          <el-select v-model="filters.lead_level" clearable placeholder="全部意向" style="width:140px">
            <el-option v-for="item in levelOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="城市">
          <el-input v-model="filters.city" clearable placeholder="城市" style="width:120px" />
        </el-form-item>
        <el-form-item label="诊断">
          <el-select v-model="filters.diagnosis_color" clearable placeholder="全部诊断" style="width:150px">
            <el-option v-for="item in diagnosisOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="filters.keyword"
            placeholder="搜索昵称/姓名/电话"
            clearable
            style="width:220px"
            :prefix-icon="Search"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" style="margin-top:16px">
      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column label="客户" min-width="150">
          <template #default="{ row }">
            <div class="customer-cell">
              <span class="customer-name">{{ row.customer_name || row.customer_nickname || '-' }}</span>
              <el-text v-if="row.customer_name && row.customer_nickname" type="info" size="small">
                {{ row.customer_nickname }}
              </el-text>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="意向" width="110">
          <template #default="{ row }">
            <el-tag :type="levelMap[row.lead_level]?.type || 'info'" size="small">
              {{ levelMap[row.lead_level]?.label || row.lead_level || '-' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="评分" width="140">
          <template #default="{ row }">
            <el-progress :percentage="Number(row.lead_score || 0)" :stroke-width="8" />
          </template>
        </el-table-column>
        <el-table-column label="意图" width="120">
          <template #default="{ row }">
            <el-tag :type="intentMap[row.intent_label]?.type || 'info'" size="small">
              {{ intentMap[row.intent_label]?.label || row.intent_label || '-' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="city" label="城市" width="100">
          <template #default="{ row }">{{ row.city || '-' }}</template>
        </el-table-column>
        <el-table-column prop="customer_phone" label="电话" width="130">
          <template #default="{ row }">{{ row.customer_phone || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="140">
          <template #default="{ row }">
            <el-select v-model="row.status" size="small" @change="changeStatus(row)">
              <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="诊断" min-width="220">
          <template #default="{ row }">
            <div class="diagnosis-cell">
              <el-tag size="small" :type="diagnosisMain(row)">{{ diagnosisText[diagnosisMain(row)] }}</el-tag>
              <el-space wrap :size="4">
                <el-tag
                  v-for="tag in diagnosisTags(row).slice(0, 3)"
                  :key="`${tag.field}-${tag.label}`"
                  size="small"
                  effect="plain"
                  :type="tag.color"
                >
                  {{ tag.label }}
                </el-tag>
              </el-space>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="last_followed_at" label="最近跟进" width="170">
          <template #default="{ row }">{{ row.last_followed_at || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openMessages(row)">看记录</el-button>
            <el-button type="primary" link size="small" @click="router.push(`/leads/${row.id}`)">查看</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @size-change="fetchList"
          @current-change="fetchList"
        />
      </div>
    </el-card>

    <MessageDrawer v-model="messageDrawerVisible" :conversation-id="activeConversationId" />
  </div>
</template>

<script setup>
import { reactive, ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import MessageDrawer from '../components/MessageDrawer.vue'
import { listLeads, updateLead } from '../api/leads'
import { diagnosisMain, diagnosisOptions, diagnosisTags, diagnosisText } from '../utils/diagnosis'

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const tableData = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const messageDrawerVisible = ref(false)
const activeConversationId = ref(null)

const filters = reactive({
  ids: '',
  status: '',
  lead_level: '',
  city: '',
  diagnosis_color: '',
  keyword: '',
})

const statusOptions = [
  { label: '新线索', value: 'new' },
  { label: '跟进中', value: 'following' },
  { label: '已成交', value: 'converted' },
  { label: '已流失', value: 'lost' },
]

const levelOptions = [
  { label: '高意向', value: 'high' },
  { label: '中意向', value: 'mid' },
  { label: '低意向', value: 'low' },
]

const levelMap = {
  high: { label: '高意向', type: 'danger' },
  mid: { label: '中意向', type: 'warning' },
  low: { label: '低意向', type: 'info' },
}

const intentMap = {
  simple_inquiry: { label: '简单咨询', type: 'info' },
  appointment: { label: '预约', type: 'success' },
  complaint: { label: '投诉', type: 'danger' },
  price_inquiry: { label: '询价', type: 'warning' },
}

function cleanParams() {
  const params = {
    page: page.value,
    page_size: pageSize.value,
  }
  Object.keys(filters).forEach((key) => {
    if (filters[key]) params[key] = filters[key]
  })
  return params
}

async function fetchList() {
  loading.value = true
  try {
    const res = await listLeads(cleanParams())
    tableData.value = res.data.list || []
    total.value = res.data.total || 0
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '加载线索失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  page.value = 1
  fetchList()
}

function handleReset() {
  Object.assign(filters, { ids: '', status: '', lead_level: '', city: '', diagnosis_color: '', keyword: '' })
  page.value = 1
  fetchList()
}

async function changeStatus(row) {
  try {
    await updateLead(row.id, { status: row.status })
    ElMessage.success('状态已更新')
    fetchList()
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '更新状态失败')
    fetchList()
  }
}

function openMessages(row) {
  activeConversationId.value = row.primary_conversation_id
  messageDrawerVisible.value = true
}

function applyRouteQuery() {
  Object.assign(filters, {
    ids: route.query.ids || '',
    status: route.query.status || '',
    lead_level: route.query.lead_level || '',
    city: route.query.city || '',
    diagnosis_color: route.query.diagnosis_color || '',
    keyword: route.query.keyword || '',
  })
}

onMounted(function () {
  applyRouteQuery()
  fetchList()
})

watch(
  () => route.query,
  function () {
    applyRouteQuery()
    page.value = 1
    fetchList()
  }
)
</script>

<style scoped>
.toolbar-card :deep(.el-card__body) { padding: 14px 20px; }
.filter-form { display: flex; flex-wrap: wrap; gap: 0 4px; }
.filter-form :deep(.el-form-item) { margin-bottom: 0; }
.pagination { display: flex; justify-content: flex-end; margin-top: 16px; }
.customer-cell { display: flex; flex-direction: column; gap: 2px; }
.customer-name { font-weight: 600; color: var(--rpa-ink, #0f172a); }
.diagnosis-cell { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
</style>
