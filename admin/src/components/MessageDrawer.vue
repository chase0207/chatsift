<template>
  <el-drawer
    :model-value="modelValue"
    title="聊天记录"
    size="520px"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
    @open="fetchMessages"
  >
    <div ref="messageListRef" v-loading="loading" class="message-list">
      <el-empty v-if="!messages.length && !loading" description="暂无消息" />
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="message-row"
        :class="msg.direction === 'outbound' ? 'message-row-right' : 'message-row-left'"
      >
        <div class="message-bubble" :class="msg.direction === 'outbound' ? 'outbound' : 'inbound'">
          <div class="message-sender">
            <span>{{ msg.sender_nickname || (msg.direction === 'outbound' ? '客服' : '用户') }}</span>
            <el-text type="info" size="small">{{ formatDate(msg.occurred_at) }}</el-text>
          </div>
          <div class="message-content">{{ msg.content_text || msg.content_url || `[${msg.content_type || 'unknown'}]` }}</div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { nextTick, ref } from 'vue'
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
.message-sender { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 6px; font-size: 12px; color: var(--rpa-ink-2, #475569); }
.message-content { white-space: pre-wrap; word-break: break-word; line-height: 1.6; color: var(--rpa-ink, #0f172a); }
</style>
