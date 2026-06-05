<template>
  <el-drawer
    :model-value="modelValue"
    :title="drawerTitle"
    size="520px"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
    @open="fetchMessages"
  >
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
            <div v-if="item.nick" class="message-sender-name">{{ item.nick }}</div>
            <div class="message-content">{{ item.msg.content_text || item.msg.content_url || `[${item.msg.content_type || 'unknown'}]` }}</div>
          </div>
        </div>
      </template>
    </div>
  </el-drawer>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getMessages } from '../api/conversations'

const props = defineProps({
  modelValue: Boolean,
  conversationId: [Number, String],
})

const emit = defineEmits(['update:modelValue'])
const loading = ref(false)
const messages = ref([])
const messageListRef = ref(null)

// 分隔条与抖音平台一致:直接展示采集到的抖音时间分隔条(raw_snapshot.divider_text),
// 不自己按阈值合成。outbound 显示客服昵称(可能多客服接待),inbound 不显示昵称。
// 精确时间(raw_snapshot.time_estimated===false)hover 才显示。
const renderItems = computed(() => {
  return (messages.value || []).map((m) => {
    const precise = !!(m.raw_snapshot && m.raw_snapshot.time_estimated === false)
    return {
      msg: m,
      sep: (m.raw_snapshot && m.raw_snapshot.divider_text) || null,
      hoverTime: (precise && m.occurred_at) ? formatDate(m.occurred_at) : '',
      nick: m.direction === 'outbound' ? (m.sender_nickname || '客服') : '',
    }
  })
})
const customerName = computed(() => {
  const inb = (messages.value || []).find((m) => m.direction === 'inbound' && m.sender_nickname)
  return inb ? inb.sender_nickname : ''
})
const drawerTitle = computed(() => (customerName.value ? `聊天记录 · ${customerName.value}` : '聊天记录'))

async function fetchMessages() {
  if (!props.conversationId) {
    messages.value = []
    return
  }
  loading.value = true
  try {
    const res = await getMessages(props.conversationId, { page: 1, page_size: 100, latest: 1 })
    messages.value = res.data?.list || []
    await nextTick()
    scrollToBottom()
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '加载聊天记录失败')
  } finally {
    loading.value = false
  }
}

function scrollToBottom() {
  const el = messageListRef.value
  if (el) el.scrollTop = el.scrollHeight
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
</script>

<style scoped>
.message-list { min-height: 240px; max-height: calc(100vh - 140px); overflow-y: auto; }
.message-row { display: flex; margin-bottom: 14px; }
.message-row-left { justify-content: flex-start; }
.message-row-right { justify-content: flex-end; }
.message-bubble { max-width: 82%; border-radius: 8px; padding: 10px 12px; border: 1px solid var(--rpa-border, #e5e7eb); }
.message-bubble.inbound { background: #ffffff; }
.message-bubble.outbound { background: var(--rpa-brand-soft, #eef0ff); }
.message-time-sep { text-align: center; margin: 12px 0 8px; }
.message-time-sep span { display: inline-block; font-size: 12px; color: #9ca3af; background: rgba(15, 23, 42, 0.05); padding: 2px 10px; border-radius: 10px; }
.chat-header { padding: 4px 2px 12px; font-weight: 600; color: var(--rpa-ink, #0f172a); border-bottom: 1px solid var(--rpa-border, #e5e7eb); margin-bottom: 10px; }
.message-sender-name { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
.message-content { white-space: pre-wrap; word-break: break-word; line-height: 1.6; color: var(--rpa-ink, #0f172a); }
</style>
