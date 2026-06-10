<template>
  <div>
    <el-card shadow="never" class="toolbar-card">
      <el-form :model="filters" inline class="filter-form">
        <el-form-item label="状态">
          <el-select v-model="filters.status" clearable placeholder="全部状态" style="width:150px">
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-select v-model="filters.priority" clearable placeholder="全部优先级" style="width:130px">
            <el-option v-for="item in priorityOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="超时">
          <el-select v-model="filters.overdue" clearable placeholder="全部" style="width:110px">
            <el-option label="已超时" value="true" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" style="margin-top:16px">
      <el-tabs v-model="activeType" @tab-change="handleTabChange">
        <el-tab-pane v-for="t in tabs" :key="t.value" :name="t.value" :label="`${t.label}(${counts[t.value] ?? 0})`" />
      </el-tabs>

      <el-table :data="tableData" v-loading="loading" stripe :row-class-name="rowClassName">
        <el-table-column label="IM昵称" min-width="130">
          <template #default="{ row }">{{ row.customer_nickname || '-' }}</template>
        </el-table-column>
        <el-table-column label="客户姓名" min-width="110">
          <template #default="{ row }">{{ row.customer_name || '-' }}</template>
        </el-table-column>
        <el-table-column label="关键词" min-width="220">
          <template #default="{ row }">
            <div v-if="payloadChips(row.payload).length" class="kw-wrap">
              <el-tag v-for="(kw, i) in payloadChips(row.payload)" :key="i" size="small" type="info" class="kw-tag">{{ kw }}</el-tag>
            </div>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="优先级" width="90">
          <template #default="{ row }">
            <el-tag :type="priorityTag(row.priority)" size="small">P{{ row.priority || '-' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="完整度" width="140">
          <template #default="{ row }">
            <el-progress :percentage="Number(row.completeness_score || 0)" :stroke-width="8" />
          </template>
        </el-table-column>
        <el-table-column label="状态" width="130">
          <template #default="{ row }">
            <el-select
              v-model="row.status"
              size="small"
              :disabled="savingId === row.id"
              @change="(val) => handleStatusChange(row, val)"
            >
              <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column prop="sla_due_at" label="SLA 截止时间" width="170" />
        <el-table-column prop="created_at" label="创建时间" width="170" />
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openDrawer(row)">查看记录</el-button>
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

    <WorkorderDrawer v-model="drawerVisible" :conversation-id="drawerConvId" />
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { listWorkorders, updateWorkorder } from '../api/workorders'
import WorkorderDrawer from '../components/WorkorderDrawer.vue'

const loading = ref(false)
const tableData = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const counts = ref({ all: 0, appointment: 0, inquiry: 0, pricing: 0, complaint: 0 })
const activeType = ref('all')
const savingId = ref(null)

const drawerVisible = ref(false)
const drawerConvId = ref(null)

const filters = reactive({ status: '', priority: '', overdue: '' })

// tab:全部 + 预约/咨询/询价(=pricing 前端文案)/投诉
const tabs = [
  { label: '全部', value: 'all' },
  { label: '预约', value: 'appointment' },
  { label: '咨询', value: 'inquiry' },
  { label: '询价', value: 'pricing' },
  { label: '投诉', value: 'complaint' },
]

const statusOptions = [
  { label: '待处理', value: 'pending' },
  { label: '已派单', value: 'assigned' },
  { label: '处理中', value: 'processing' },
  { label: '已完成', value: 'done' },
  { label: '已取消', value: 'cancelled' },
]

const priorityOptions = [
  { label: 'P1', value: 1 },
  { label: 'P2', value: 2 },
  { label: 'P3', value: 3 },
  { label: 'P4', value: 4 },
  { label: 'P5', value: 5 },
]

// 关键词:工单 payload 的非空结构化字段拼「标签:值」,不新增字段
const keyLabelMap = {
  city: '城市', car_type: '车型', intent_summary: '意向', time: '时间',
  pickup_location: '上车地点', location: '地点', contact: '联系方式', phone: '电话',
  wechat: '微信', name: '姓名', risk_level: '风险等级', complaint_summary: '投诉摘要',
  budget: '预算', product: '产品', product_name: '产品', remark: '备注',
}
function payloadChips(payload) {
  let obj = payload
  if (typeof obj === 'string') { try { obj = JSON.parse(obj) } catch { obj = {} } }
  if (!obj || typeof obj !== 'object') return []
  const chips = []
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === '') continue
    const label = keyLabelMap[k] || k
    const val = typeof v === 'object' ? JSON.stringify(v) : String(v)
    if (!val.trim()) continue
    chips.push(`${label}:${val}`)
  }
  return chips
}

function cleanParams() {
  const params = { page: page.value, page_size: pageSize.value }
  if (activeType.value !== 'all') params.workorder_type = activeType.value
  Object.keys(filters).forEach((key) => { if (filters[key] !== '') params[key] = filters[key] })
  return params
}

async function fetchList() {
  loading.value = true
  try {
    const res = await listWorkorders(cleanParams())
    tableData.value = res.data.list || []
    total.value = res.data.total || 0
    if (res.data.counts) counts.value = res.data.counts
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '加载工单失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() { page.value = 1; fetchList() }
function handleReset() {
  Object.assign(filters, { status: '', priority: '', overdue: '' })
  page.value = 1
  fetchList()
}
function handleTabChange() { page.value = 1; fetchList() }

// 状态下拉:change 即存,防重复提交,成功提示;失败回滚
async function handleStatusChange(row, val) {
  if (savingId.value) return
  savingId.value = row.id
  const prev = row._prevStatus ?? row.status
  try {
    await updateWorkorder(row.id, { status: val })
    row._prevStatus = val
    ElMessage.success('状态修改成功')
    // 状态变化会影响各 tab 计数,刷新当前列表(保持页码)
    fetchList()
  } catch (err) {
    row.status = prev
    ElMessage.error(err?.response?.data?.message || '状态修改失败')
  } finally {
    savingId.value = null
  }
}

function openDrawer(row) {
  drawerConvId.value = row.conversation_id
  drawerVisible.value = true
}

function priorityTag(priority) {
  if (Number(priority) === 1) return 'danger'
  if (Number(priority) >= 3 && Number(priority) <= 4) return 'warning'
  return 'info'
}
function isOverdue(row) {
  return row.status !== 'done' && row.sla_due_at && new Date(row.sla_due_at).getTime() < Date.now()
}
function rowClassName({ row }) { return isOverdue(row) ? 'overdue-row' : '' }

onMounted(fetchList)
</script>

<style scoped>
.toolbar-card :deep(.el-card__body) { padding: 14px 20px; }
.filter-form { display: flex; flex-wrap: wrap; gap: 0 4px; }
.filter-form :deep(.el-form-item) { margin-bottom: 0; }
.pagination { display: flex; justify-content: flex-end; margin-top: 16px; }
.kw-wrap { max-height: 52px; overflow: hidden; display: flex; flex-wrap: wrap; gap: 4px; }
.kw-tag { max-width: 100%; }
:deep(.overdue-row) { --el-table-tr-bg-color: #fef2f2; }
</style>
