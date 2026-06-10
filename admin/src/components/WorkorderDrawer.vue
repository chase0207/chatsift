<template>
  <el-drawer
    :model-value="modelValue"
    title="查看记录"
    direction="rtl"
    size="900px"
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
    @open="load"
  >
    <div class="wo-drawer" v-loading="loading">
      <!-- 左:对话内容 -->
      <div class="col col-mid">
        <div class="col-head">{{ conv.customer_nickname ? '消息 · ' + conv.customer_nickname : '对话内容' }}</div>
        <div ref="msgRef" class="message-list">
          <el-empty v-if="!messages.length && !loading" description="暂无消息" :image-size="80" />
          <template v-for="item in renderItems" :key="item.msg.id">
            <div v-if="item.sep" class="message-time-sep"><span>{{ item.sep }}</span></div>
            <div class="message-row" :class="item.msg.direction === 'outbound' ? 'message-row-right' : 'message-row-left'">
              <div class="message-bubble" :class="item.msg.direction === 'outbound' ? 'outbound' : 'inbound'" :title="item.hoverTime">
                <div v-if="item.nick" class="message-sender-name">{{ item.nick }}</div>
                <div class="message-content">{{ item.msg.content_text || item.msg.content_url || `[${item.msg.content_type || 'unknown'}]` }}</div>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- 右:客户全貌 -->
      <div class="col col-right">
        <div class="col-head">客户全貌</div>
        <div class="right-body">
          <div class="block">
            <div class="block-title">意向 / 阶段 / 完整度</div>
            <el-space wrap>
              <el-tag :type="intentMap[conv.intent_label]?.type || 'info'">{{ intentMap[conv.intent_label]?.label || '未识别' }}</el-tag>
              <el-tag>{{ stageMap[conv.current_stage] || conv.current_stage || '-' }}</el-tag>
            </el-space>
            <el-progress :percentage="Number(conv.completeness_score || 0)" :stroke-width="8" style="margin-top:8px" />
          </div>

          <div v-if="lead" class="block">
            <div class="block-title">线索</div>
            <el-space wrap>
              <el-tag :type="leadLevelType(lead.lead_level)">{{ leadLevelMap[lead.lead_level] || lead.lead_level || '-' }}</el-tag>
              <span class="muted">评分 {{ lead.lead_score ?? '-' }}</span>
              <span class="muted">状态 {{ leadStatusMap[lead.status] || lead.status || '-' }}</span>
            </el-space>
          </div>

          <div class="block">
            <div class="block-title">诊断标签</div>
            <el-space wrap>
              <el-tag v-for="t in diagnosisTags(conv)" :key="t.field + t.label" :type="t.color" effect="plain" size="small">{{ t.label }}</el-tag>
              <span v-if="!diagnosisTags(conv).length" class="muted">-</span>
            </el-space>
          </div>

          <div class="block">
            <div class="block-title">字段诊断</div>
            <div v-for="row in fieldRows" :key="row.field" class="fv-row">
              <span class="fv-label">{{ row.label }}</span>
              <span class="fv-value" :title="row.value">{{ row.value }}</span>
              <el-tag size="small" :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
            </div>
            <div v-if="!fieldRows.length" class="muted">暂无字段</div>
          </div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getConversation, getMessages } from '../api/conversations'
import { getLead } from '../api/leads'
import { diagnosisTags, fieldValidityRows, statusType, statusLabel } from '../utils/diagnosis'

const props = defineProps({
  modelValue: Boolean,
  conversationId: [Number, String],
})
const emit = defineEmits(['update:modelValue'])

const intentMap = {
  simple_inquiry: { label: '简单咨询', type: 'info' },
  appointment: { label: '预约', type: 'success' },
  complaint: { label: '投诉', type: 'danger' },
  price_inquiry: { label: '询价', type: 'warning' },
}
const stageMap = { new: '新会话', collecting: '收集中', completing: '补全中', done: '已完成' }
const leadLevelMap = { high: '高意向', mid: '中意向', low: '低意向' }
const leadStatusMap = { new: '新线索', following: '跟进中', converted: '已成交', lost: '已流失' }
function leadLevelType(l) { return l === 'high' ? 'danger' : (l === 'mid' ? 'warning' : 'info') }

const loading = ref(false)
const conv = ref({})
const lead = ref(null)
const messages = ref([])
const msgRef = ref(null)

const fieldRows = computed(() => fieldValidityRows(conv.value.field_validity))
const renderItems = computed(() => (messages.value || []).map((m) => {
  const precise = !!(m.raw_snapshot && m.raw_snapshot.time_estimated === false)
  return {
    msg: m,
    sep: (m.raw_snapshot && m.raw_snapshot.divider_text) || null,
    hoverTime: (precise && m.occurred_at) ? m.occurred_at : '',
    nick: m.direction === 'outbound' ? (m.sender_nickname || '客服') : '',
  }
}))

async function load() {
  conv.value = {}
  lead.value = null
  messages.value = []
  if (!props.conversationId) return
  loading.value = true
  try {
    const [cRes, mRes] = await Promise.all([
      getConversation(props.conversationId),
      getMessages(props.conversationId, { page: 1, page_size: 100, latest: 1 }),
    ])
    conv.value = cRes.data || {}
    messages.value = mRes.data?.list || []
    if (conv.value.lead_id) {
      try { const lr = await getLead(conv.value.lead_id); lead.value = lr.data?.lead || lr.data || null } catch (_) { /* ignore */ }
    }
    await nextTick()
    if (msgRef.value) msgRef.value.scrollTop = msgRef.value.scrollHeight
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.wo-drawer { display: flex; gap: 16px; height: calc(100vh - 120px); }
.col { display: flex; flex-direction: column; min-height: 0; }
.col-mid { flex: 1 1 58%; }
.col-right { flex: 1 1 42%; border-left: 1px solid var(--rpa-border, #e5e7eb); padding-left: 16px; }
.col-head { font-weight: 600; color: var(--rpa-ink, #0f172a); padding-bottom: 10px; border-bottom: 1px solid var(--rpa-border, #e5e7eb); margin-bottom: 10px; }
.message-list { flex: 1; overflow-y: auto; }
.message-row { display: flex; margin-bottom: 14px; }
.message-row-left { justify-content: flex-start; }
.message-row-right { justify-content: flex-end; }
.message-bubble { max-width: 82%; border-radius: 8px; padding: 10px 12px; border: 1px solid var(--rpa-border, #e5e7eb); }
.message-bubble.inbound { background: #fff; }
.message-bubble.outbound { background: var(--rpa-brand-soft, #eef0ff); }
.message-time-sep { text-align: center; margin: 12px 0 8px; }
.message-time-sep span { display: inline-block; font-size: 12px; color: #9ca3af; background: rgba(15,23,42,.05); padding: 2px 10px; border-radius: 10px; }
.message-sender-name { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
.message-content { white-space: pre-wrap; word-break: break-word; line-height: 1.6; color: var(--rpa-ink, #0f172a); }
.right-body { flex: 1; overflow-y: auto; }
.block { margin-bottom: 16px; }
.block-title { font-weight: 600; font-size: 13px; color: #374151; margin-bottom: 8px; }
.muted { color: #9ca3af; font-size: 13px; }
.fv-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; }
.fv-label { width: 80px; color: #6b7280; flex-shrink: 0; }
.fv-value { flex: 1; color: var(--rpa-ink, #0f172a); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
