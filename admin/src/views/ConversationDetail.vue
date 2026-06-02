<template>
  <div>
    <el-card shadow="never" class="detail-card">
      <div class="detail-header">
        <el-button :icon="ArrowLeft" @click="router.back()">返回</el-button>
        <div class="detail-title">
          <h2>{{ conversation.customer_nickname || '会话详情' }}</h2>
          <div class="detail-meta">
            <el-tag size="small" type="info">{{ platformLabel(conversation.platform) }}</el-tag>
            <el-tag size="small" :type="intentMap[conversation.intent_label]?.type || 'info'">
              {{ intentMap[conversation.intent_label]?.label || conversation.intent_label || '未识别' }}
            </el-tag>
            <el-tag size="small">{{ stageMap[conversation.current_stage] || conversation.current_stage || '-' }}</el-tag>
          </div>
        </div>
      </div>

      <el-descriptions :column="4" border style="margin-top:16px">
        <el-descriptions-item label="平台页面">{{ conversation.platform_page || '-' }}</el-descriptions-item>
        <el-descriptions-item label="客户ID">{{ conversation.customer_platform_uid || '-' }}</el-descriptions-item>
        <el-descriptions-item label="消息数">{{ conversation.message_count || 0 }}</el-descriptions-item>
        <el-descriptions-item label="最后消息">{{ formatDate(conversation.last_message_at) }}</el-descriptions-item>
        <el-descriptions-item label="完整度">
          <el-progress :percentage="Number(conversation.completeness_score || 0)" :stroke-width="8" />
        </el-descriptions-item>
        <el-descriptions-item label="线索ID">{{ conversation.lead_id || '-' }}</el-descriptions-item>
        <el-descriptions-item label="工单">
          <el-space wrap>
            <el-button
              v-for="id in conversation.workorder_ids || []"
              :key="id"
              type="primary"
              link
              size="small"
              @click="router.push('/workorders')"
            >#{{ id }}</el-button>
            <span v-if="!conversation.workorder_ids || !conversation.workorder_ids.length">-</span>
          </el-space>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card shadow="never" style="margin-top:16px">
      <template #header>
        <span style="font-weight:600">字段诊断</span>
      </template>
      <el-space wrap style="margin-bottom:12px">
        <el-tag
          v-for="tag in diagnosisTags(conversation)"
          :key="`${tag.field}-${tag.label}`"
          :type="tag.color"
          effect="plain"
        >
          {{ tag.label }}{{ tag.reason ? `：${tag.reason}` : '' }}
        </el-tag>
      </el-space>
      <el-table :data="fieldValidityRows(conversation.field_validity)" stripe>
        <el-table-column prop="label" label="字段" width="120" />
        <el-table-column prop="value" label="字段值" min-width="180" />
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="理由" min-width="220" />
      </el-table>
    </el-card>

    <el-card shadow="never" style="margin-top:16px">
      <template #header>
        <span style="font-weight:600">消息流</span>
      </template>
      <div ref="messageListRef" v-loading="loading" class="message-list">
        <el-empty v-if="!messages.length && !loading" description="暂无消息" />
        <template v-for="item in renderItems" :key="item.msg.id">
          <div v-if="item.sep" class="message-time-sep"><span>{{ item.sep }}</span></div>
          <div
            class="message-row"
            :class="item.msg.direction === 'outbound' ? 'message-row-right' : 'message-row-left'"
          >
            <div
              class="message-bubble"
              :class="item.msg.direction === 'outbound' ? 'outbound' : 'inbound'"
              :title="item.hoverTime"
            >
              <div class="message-content">{{ item.msg.content_text || item.msg.content_url || `[${item.msg.content_type || 'unknown'}]` }}</div>
            </div>
          </div>
        </template>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { getConversation, getMessages } from '../api/conversations'
import { diagnosisTags, fieldValidityRows, statusLabel, statusType } from '../utils/diagnosis'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const conversation = ref({})
const messages = ref([])
const messageListRef = ref(null)

const SEP_GAP_MS = 5 * 60 * 1000
function tsOf(v) {
  if (!v) return null
  const d = new Date(String(v).includes('T') ? v : String(v).replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? null : d.getTime()
}
// 抖音式展示:不在每条上显示昵称/时间;按间隔(>5min)或跨天插时间分隔条;
// 有精确时间(raw_snapshot.time_estimated===false)的消息 hover 才显示具体时间。
const renderItems = computed(() => {
  const list = messages.value || []
  const items = []
  let lastTs = null
  let lastDay = null
  for (const m of list) {
    const ts = tsOf(m.occurred_at)
    const day = ts ? new Date(ts).toDateString() : null
    let sep = null
    if (lastTs === null || (ts !== null && ts - lastTs >= SEP_GAP_MS) || (day && day !== lastDay)) {
      sep = formatDate(m.occurred_at).slice(0, 16)
    }
    const precise = !!(m.raw_snapshot && m.raw_snapshot.time_estimated === false)
    items.push({ msg: m, sep, hoverTime: precise ? formatDate(m.occurred_at) : '' })
    if (ts !== null) { lastTs = ts; lastDay = day }
  }
  return items
})

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

function platformLabel(platform) {
  return platform === 'douyin' ? '抖音' : platform || '-'
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

async function fetchDetail() {
  loading.value = true
  try {
    const id = route.params.id
    const [detailRes, messagesRes] = await Promise.all([
      getConversation(id),
      getMessages(id, { page: 1, page_size: 100, latest: 1 }),
    ])
    conversation.value = detailRes.data || {}
    messages.value = messagesRes.data?.list || []
    await nextTick()
    scrollToBottom()
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '加载会话详情失败')
  } finally {
    loading.value = false
  }
}

function scrollToBottom() {
  const el = messageListRef.value
  if (el) el.scrollTop = el.scrollHeight
}

onMounted(fetchDetail)
</script>

<style scoped>
.detail-card :deep(.el-card__body) { padding: 18px 20px; }
.detail-header { display: flex; align-items: center; gap: 16px; }
.detail-title h2 { margin: 0 0 8px; font-size: 18px; font-weight: 600; color: var(--rpa-ink, #0f172a); }
.detail-meta { display: flex; gap: 8px; align-items: center; }
.message-list { min-height: 240px; max-height: calc(100vh - 360px); overflow-y: auto; }
.message-row { display: flex; margin-bottom: 14px; }
.message-row-left { justify-content: flex-start; }
.message-row-right { justify-content: flex-end; }
.message-bubble { max-width: 68%; border-radius: 8px; padding: 10px 12px; border: 1px solid var(--rpa-border, #e5e7eb); }
.message-bubble.inbound { background: #ffffff; }
.message-bubble.outbound { background: var(--rpa-brand-soft, #eef0ff); }
.message-time-sep { text-align: center; margin: 12px 0 8px; }
.message-time-sep span { display: inline-block; font-size: 12px; color: #9ca3af; background: rgba(15, 23, 42, 0.05); padding: 2px 10px; border-radius: 10px; }
.message-content { white-space: pre-wrap; word-break: break-word; line-height: 1.6; color: var(--rpa-ink, #0f172a); }
</style>
