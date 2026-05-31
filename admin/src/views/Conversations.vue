<template>
  <div>
    <el-card shadow="never" class="toolbar-card">
      <el-form :model="filters" inline class="filter-form">
        <el-form-item label="平台">
          <el-select v-model="filters.platform" clearable placeholder="全部平台" style="width:140px">
            <el-option label="抖音" value="douyin" />
          </el-select>
        </el-form-item>
        <el-form-item label="意图">
          <el-select v-model="filters.intent_label" clearable placeholder="全部意图" style="width:160px">
            <el-option v-for="item in intentOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="阶段">
          <el-select v-model="filters.current_stage" clearable placeholder="全部阶段" style="width:150px">
            <el-option v-for="item in stageOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="诊断">
          <el-select v-model="filters.diagnosis_color" clearable placeholder="全部诊断" style="width:150px">
            <el-option v-for="item in diagnosisOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="filters.keyword"
            placeholder="搜索消息内容"
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
        <el-table-column label="客户昵称" min-width="130">
          <template #default="{ row }">
            <span style="font-weight:600">{{ row.customer_nickname || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="平台" width="110">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ platformLabel(row.platform) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="平台页面" min-width="140">
          <template #default="{ row }">
            <el-text type="info" size="small">{{ row.platform_page || '-' }}</el-text>
          </template>
        </el-table-column>
        <el-table-column label="意图标签" width="130">
          <template #default="{ row }">
            <el-tag :type="intentMap[row.intent_label]?.type || 'info'" size="small">
              {{ intentMap[row.intent_label]?.label || row.intent_label || '未识别' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="当前阶段" width="120">
          <template #default="{ row }">
            <el-tag size="small">{{ stageMap[row.current_stage] || row.current_stage || '-' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="完整度" width="150">
          <template #default="{ row }">
            <el-progress :percentage="Number(row.completeness_score || 0)" :stroke-width="8" />
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
        <el-table-column prop="message_count" label="消息数" width="90" align="center" />
        <el-table-column prop="last_message_at" label="最后消息时间" width="170" />
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openMessages(row)">看记录</el-button>
            <el-button type="primary" link size="small" @click="goDetail(row)">查看</el-button>
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
import { reactive, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import MessageDrawer from '../components/MessageDrawer.vue'
import { listConversations } from '../api/conversations'
import { diagnosisMain, diagnosisOptions, diagnosisTags, diagnosisText } from '../utils/diagnosis'

const router = useRouter()
const loading = ref(false)
const tableData = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const messageDrawerVisible = ref(false)
const activeConversationId = ref(null)

const filters = reactive({
  platform: '',
  intent_label: '',
  current_stage: '',
  diagnosis_color: '',
  keyword: '',
})

const intentOptions = [
  { label: '简单咨询', value: 'simple_inquiry' },
  { label: '预约', value: 'appointment' },
  { label: '投诉', value: 'complaint' },
  { label: '询价', value: 'price_inquiry' },
]

const intentMap = {
  simple_inquiry: { label: '简单咨询', type: 'info' },
  appointment: { label: '预约', type: 'success' },
  complaint: { label: '投诉', type: 'danger' },
  price_inquiry: { label: '询价', type: 'warning' },
}

const stageOptions = [
  { label: '新会话', value: 'new' },
  { label: '收集中', value: 'collecting' },
  { label: '补全中', value: 'completing' },
  { label: '已完成', value: 'done' },
]

const stageMap = {
  new: '新会话',
  collecting: '收集中',
  completing: '补全中',
  done: '已完成',
}

function platformLabel(platform) {
  return platform === 'douyin' ? '抖音' : platform || '-'
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
    const res = await listConversations(cleanParams())
    tableData.value = res.data.list || []
    total.value = res.data.total || 0
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '加载会话失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  page.value = 1
  fetchList()
}

function handleReset() {
  Object.assign(filters, { platform: '', intent_label: '', current_stage: '', diagnosis_color: '', keyword: '' })
  page.value = 1
  fetchList()
}

function goDetail(row) {
  router.push(`/conversations/${row.id}`)
}

function openMessages(row) {
  activeConversationId.value = row.id
  messageDrawerVisible.value = true
}

onMounted(fetchList)
</script>

<style scoped>
.toolbar-card :deep(.el-card__body) { padding: 14px 20px; }
.filter-form { display: flex; flex-wrap: wrap; gap: 0 4px; }
.filter-form :deep(.el-form-item) { margin-bottom: 0; }
.pagination { display: flex; justify-content: flex-end; margin-top: 16px; }
.diagnosis-cell { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
</style>
