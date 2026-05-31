<template>
  <div>
    <el-card shadow="never" class="detail-card">
      <div class="detail-header">
        <el-button :icon="ArrowLeft" @click="router.back()">返回</el-button>
        <div class="detail-title">
          <h2>{{ lead.customer_name || lead.customer_nickname || '线索详情' }}</h2>
          <div class="detail-meta">
            <el-tag :type="levelMap[lead.lead_level]?.type || 'info'" size="small">
              {{ levelMap[lead.lead_level]?.label || lead.lead_level || '-' }}
            </el-tag>
            <el-tag :type="statusMap[lead.status]?.type || 'info'" size="small">
              {{ statusMap[lead.status]?.label || lead.status || '-' }}
            </el-tag>
            <el-tag :type="intentMap[lead.intent_label]?.type || 'info'" size="small">
              {{ intentMap[lead.intent_label]?.label || lead.intent_label || '-' }}
            </el-tag>
          </div>
        </div>
      </div>

      <el-descriptions :column="4" border style="margin-top:16px">
        <el-descriptions-item label="抖音昵称">{{ lead.customer_nickname || '-' }}</el-descriptions-item>
        <el-descriptions-item label="真实姓名">{{ lead.customer_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="电话">{{ lead.customer_phone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="微信">{{ lead.customer_wechat || '-' }}</el-descriptions-item>
        <el-descriptions-item label="城市">{{ lead.city || '-' }}</el-descriptions-item>
        <el-descriptions-item label="评分">
          <el-progress :percentage="Number(lead.lead_score || 0)" :stroke-width="8" />
        </el-descriptions-item>
        <el-descriptions-item label="最近跟进">{{ lead.last_followed_at || '-' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatDate(lead.created_at) }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card shadow="never" style="margin-top:16px">
      <template #header>
        <span style="font-weight:600">跟进状态</span>
      </template>
      <el-form :model="form" label-width="90px" class="profile-form">
        <el-form-item label="状态">
          <el-select v-model="form.status" style="width:180px">
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="真实姓名">
          <el-input v-model="form.customer_name" placeholder="客户预约姓名" style="width:240px" />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="form.customer_phone" placeholder="联系电话" style="width:240px" />
        </el-form-item>
        <el-form-item label="微信">
          <el-input v-model="form.customer_wechat" placeholder="微信号" style="width:240px" />
        </el-form-item>
        <el-form-item label="城市">
          <el-input v-model="form.city" placeholder="城市" style="width:180px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="saveProfile">保存</el-button>
          <el-button type="success" :loading="saving" @click="convert">标记成交</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" style="margin-top:16px">
      <template #header>
        <span style="font-weight:600">关联会话</span>
      </template>
      <el-empty v-if="!conversation" description="暂无关联会话" />
      <el-descriptions v-else :column="4" border>
        <el-descriptions-item label="会话ID">
          <el-button type="primary" link @click="router.push(`/conversations/${conversation.id}`)">#{{ conversation.id }}</el-button>
        </el-descriptions-item>
        <el-descriptions-item label="客户">{{ conversation.customer_nickname || '-' }}</el-descriptions-item>
        <el-descriptions-item label="阶段">{{ stageMap[conversation.current_stage] || conversation.current_stage || '-' }}</el-descriptions-item>
        <el-descriptions-item label="完整度">{{ conversation.completeness_score || 0 }}%</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card shadow="never" style="margin-top:16px">
      <template #header>
        <span style="font-weight:600">关联工单</span>
      </template>
      <el-table :data="workorders" stripe>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column label="类型" width="120">
          <template #default="{ row }">{{ typeMap[row.workorder_type] || row.workorder_type || '-' }}</template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="180" />
        <el-table-column label="完整度" width="140">
          <template #default="{ row }">
            <el-progress :percentage="Number(row.completeness_score || 0)" :stroke-width="8" />
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">{{ workorderStatusMap[row.status] || row.status || '-' }}</template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="170" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { convertLead, getLead, updateLead } from '../api/leads'

const route = useRoute()
const router = useRouter()
const lead = ref({})
const conversation = ref(null)
const workorders = ref([])
const saving = ref(false)

const form = reactive({
  status: 'new',
  customer_name: '',
  customer_phone: '',
  customer_wechat: '',
  city: '',
})

const statusOptions = [
  { label: '新线索', value: 'new' },
  { label: '跟进中', value: 'following' },
  { label: '已成交', value: 'converted' },
  { label: '已流失', value: 'lost' },
]

const statusMap = {
  new: { label: '新线索', type: 'info' },
  following: { label: '跟进中', type: 'warning' },
  converted: { label: '已成交', type: 'success' },
  lost: { label: '已流失', type: 'danger' },
}

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

const stageMap = {
  new: '新会话',
  collecting: '收集中',
  completing: '补全中',
  done: '已完成',
}

const typeMap = {
  inquiry: '咨询',
  appointment: '预约',
  complaint: '投诉',
  pricing: '报价',
}

const workorderStatusMap = {
  pending: '待处理',
  in_progress: '处理中',
  done: '已完成',
  cancelled: '已取消',
}

async function fetchDetail() {
  try {
    const res = await getLead(route.params.id)
    lead.value = res.data.lead || {}
    conversation.value = res.data.conversation || null
    workorders.value = res.data.workorders || []
    Object.assign(form, {
      status: lead.value.status || 'new',
      customer_name: lead.value.customer_name || '',
      customer_phone: lead.value.customer_phone || '',
      customer_wechat: lead.value.customer_wechat || '',
      city: lead.value.city || '',
    })
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '加载线索详情失败')
  }
}

async function saveProfile() {
  saving.value = true
  try {
    await updateLead(route.params.id, { ...form })
    ElMessage.success('保存成功')
    fetchDetail()
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function convert() {
  saving.value = true
  try {
    await convertLead(route.params.id)
    ElMessage.success('已标记成交')
    fetchDetail()
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '标记失败')
  } finally {
    saving.value = false
  }
}

function formatDate(value) {
  if (!value) return '-'
  return String(value).replace('T', ' ').slice(0, 19)
}

onMounted(fetchDetail)
</script>

<style scoped>
.detail-card :deep(.el-card__body) { padding: 18px 20px; }
.detail-header { display: flex; align-items: center; gap: 16px; }
.detail-title h2 { margin: 0 0 8px; font-size: 18px; font-weight: 600; color: var(--rpa-ink, #0f172a); }
.detail-meta { display: flex; gap: 8px; align-items: center; }
.profile-form { display: flex; flex-wrap: wrap; gap: 0 12px; }
.profile-form :deep(.el-form-item) { margin-bottom: 16px; }
</style>
