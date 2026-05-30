<template>
  <div>
    <el-card shadow="never" class="toolbar-card">
      <el-form :model="filters" inline class="filter-form">
        <el-form-item label="类型">
          <el-select v-model="filters.workorder_type" clearable placeholder="全部类型" style="width:150px">
            <el-option v-for="item in typeOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
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
      <el-table :data="tableData" v-loading="loading" stripe :row-class-name="rowClassName">
        <el-table-column label="标题" min-width="220">
          <template #default="{ row }">
            <span style="font-weight:600">{{ row.title || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="120">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ typeMap[row.workorder_type] || row.workorder_type || '-' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="优先级" width="100">
          <template #default="{ row }">
            <el-tag :type="priorityTag(row.priority)" size="small">P{{ row.priority || '-' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="完整度" width="150">
          <template #default="{ row }">
            <el-progress :percentage="Number(row.completeness_score || 0)" :stroke-width="8" />
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusMap[row.status]?.type || 'info'" size="small">
              {{ statusMap[row.status]?.label || row.status || '-' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sla_due_at" label="SLA 截止时间" width="170" />
        <el-table-column prop="created_at" label="创建时间" width="170" />
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openDialog(row)">查看/处理</el-button>
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

    <el-dialog v-model="dialogVisible" title="工单处理" width="720px" destroy-on-close>
      <div v-loading="detailLoading">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="标题">{{ current.title || '-' }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ typeMap[current.workorder_type] || current.workorder_type || '-' }}</el-descriptions-item>
          <el-descriptions-item label="优先级">P{{ current.priority || '-' }}</el-descriptions-item>
          <el-descriptions-item label="完整度">{{ current.completeness_score || 0 }}%</el-descriptions-item>
          <el-descriptions-item label="关联会话">
            <el-button
              v-if="current.conversation_id"
              type="primary"
              link
              size="small"
              @click="goConversation(current.conversation_id)"
            >#{{ current.conversation_id }}</el-button>
            <span v-else>-</span>
          </el-descriptions-item>
          <el-descriptions-item label="SLA 截止">{{ formatDate(current.sla_due_at) }}</el-descriptions-item>
          <el-descriptions-item label="缺失字段" :span="2">
            <el-space wrap>
              <el-tag v-for="item in current.missing_fields || []" :key="item" size="small" type="warning">{{ item }}</el-tag>
              <span v-if="!current.missing_fields || !current.missing_fields.length">-</span>
            </el-space>
          </el-descriptions-item>
          <el-descriptions-item label="处理建议" :span="2">{{ current.suggestion || '-' }}</el-descriptions-item>
        </el-descriptions>

        <div class="json-section">
          <div class="section-title">结构化字段</div>
          <pre>{{ formatJson(current.payload || {}) }}</pre>
        </div>

        <el-form :model="processForm" label-width="90px" style="margin-top:16px">
          <el-form-item label="状态">
            <el-select v-model="processForm.status" style="width:220px">
              <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleStatusUpdate">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getWorkorder, listWorkorders, updateWorkorder } from '../api/workorders'

const router = useRouter()
const loading = ref(false)
const detailLoading = ref(false)
const saving = ref(false)
const tableData = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const dialogVisible = ref(false)
const current = ref({})

const filters = reactive({
  workorder_type: '',
  status: '',
  priority: '',
  overdue: '',
})

const processForm = reactive({
  status: '',
})

const typeOptions = [
  { label: '咨询', value: 'inquiry' },
  { label: '预约', value: 'appointment' },
  { label: '投诉', value: 'complaint' },
  { label: '报价', value: 'pricing' },
]

const typeMap = {
  inquiry: '咨询',
  appointment: '预约',
  complaint: '投诉',
  pricing: '报价',
}

const statusOptions = [
  { label: '待处理', value: 'pending' },
  { label: '已派单', value: 'assigned' },
  { label: '处理中', value: 'processing' },
  { label: '已完成', value: 'done' },
  { label: '已取消', value: 'cancelled' },
]

const statusMap = {
  pending: { label: '待处理', type: 'warning' },
  assigned: { label: '已派单', type: '' },
  processing: { label: '处理中', type: 'primary' },
  done: { label: '已完成', type: 'success' },
  cancelled: { label: '已取消', type: 'info' },
}

const priorityOptions = [
  { label: 'P1', value: 1 },
  { label: 'P2', value: 2 },
  { label: 'P3', value: 3 },
  { label: 'P4', value: 4 },
  { label: 'P5', value: 5 },
]

function cleanParams() {
  const params = {
    page: page.value,
    page_size: pageSize.value,
  }
  Object.keys(filters).forEach((key) => {
    if (filters[key] !== '') params[key] = filters[key]
  })
  return params
}

async function fetchList() {
  loading.value = true
  try {
    const res = await listWorkorders(cleanParams())
    tableData.value = res.data.list || []
    total.value = res.data.total || 0
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '加载工单失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  page.value = 1
  fetchList()
}

function handleReset() {
  Object.assign(filters, { workorder_type: '', status: '', priority: '', overdue: '' })
  page.value = 1
  fetchList()
}

async function openDialog(row) {
  dialogVisible.value = true
  detailLoading.value = true
  current.value = { ...row }
  processForm.status = row.status || 'pending'
  try {
    const res = await getWorkorder(row.id)
    current.value = res.data || {}
    processForm.status = current.value.status || 'pending'
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '加载工单详情失败')
  } finally {
    detailLoading.value = false
  }
}

async function handleStatusUpdate() {
  if (!current.value.id) return
  saving.value = true
  try {
    await updateWorkorder(current.value.id, { status: processForm.status })
    ElMessage.success('保存成功')
    dialogVisible.value = false
    fetchList()
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

function goConversation(id) {
  dialogVisible.value = false
  router.push(`/conversations/${id}`)
}

function priorityTag(priority) {
  if (Number(priority) === 1) return 'danger'
  if (Number(priority) >= 3 && Number(priority) <= 4) return 'warning'
  return 'info'
}

function isOverdue(row) {
  return row.status !== 'done' && row.sla_due_at && new Date(row.sla_due_at).getTime() < Date.now()
}

function rowClassName({ row }) {
  return isOverdue(row) ? 'overdue-row' : ''
}

function formatJson(value) {
  return JSON.stringify(value || {}, null, 2)
}

function formatDate(value) {
  if (!value) return '-'
  const text = String(value)
  if (!text.includes('T')) return text.slice(0, 19)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return text.slice(0, 19)
  const pad = (num) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

onMounted(fetchList)
</script>

<style scoped>
.toolbar-card :deep(.el-card__body) { padding: 14px 20px; }
.filter-form { display: flex; flex-wrap: wrap; gap: 0 4px; }
.filter-form :deep(.el-form-item) { margin-bottom: 0; }
.pagination { display: flex; justify-content: flex-end; margin-top: 16px; }
.json-section { margin-top: 16px; }
.section-title { margin-bottom: 8px; font-weight: 600; color: var(--rpa-ink, #0f172a); }
pre {
  margin: 0;
  padding: 12px;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid var(--rpa-border, #e5e7eb);
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.6;
}
:deep(.overdue-row) {
  --el-table-tr-bg-color: #fef2f2;
}
</style>
