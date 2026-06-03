<template>
  <div class="aggregate-page">
    <!-- 顶部筛选栏:平台→页面→客服 三级联动 + 用户/消息/工单/诊断色 -->
    <div class="filter-bar">
      <div class="fb-item"><label>平台</label>
        <el-select v-model="sel.platform" @change="onPlatformChange" style="width:130px" placeholder="平台">
          <el-option v-for="p in platformOptions" :key="p" :label="platformLabel(p)" :value="p" />
        </el-select>
      </div>
      <div class="fb-item"><label>页面</label>
        <el-select v-model="sel.page" @change="onPageChange" style="width:150px" placeholder="页面">
          <el-option v-for="pg in pageOptions" :key="pg" :label="pageLabel(pg)" :value="pg" />
        </el-select>
      </div>
      <div class="fb-item"><label>客服</label>
        <el-select v-model="sel.agent" @change="reload" clearable placeholder="全部" style="width:180px">
          <el-option v-for="a in agentOptions" :key="a" :label="a" :value="a" />
        </el-select>
      </div>
      <div class="fb-item"><label>用户</label>
        <el-input v-model="sel.nickname" placeholder="搜索用户昵称" clearable style="width:150px" @keyup.enter="reload" />
      </div>
      <div class="fb-item"><label>消息</label>
        <el-input v-model="sel.keyword" placeholder="搜索关键词" clearable style="width:150px" @keyup.enter="reload" />
      </div>
      <div class="fb-item"><label>工单</label>
        <el-select v-model="sel.worktype" clearable placeholder="全部" style="width:120px" @change="reload">
          <el-option v-for="o in workorderOptions" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
      </div>
      <div class="fb-item"><label>诊断色</label>
        <el-select v-model="sel.color" clearable placeholder="全部" style="width:120px" @change="reload">
          <el-option v-for="o in diagnosisOptions" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
      </div>
      <el-button type="primary" @click="reload">查询</el-button>
    </div>

    <div class="aggregate">
      <!-- 左:会话列表 -->
      <div class="col col-left">
        <div class="col-head">会话</div>
        <div v-loading="listLoading" class="conv-list">
          <el-empty v-if="!conversations.length && !listLoading" description="无会话" :image-size="50" />
          <div
            v-for="c in conversations"
            :key="c.id"
            class="conv-item"
            :class="{ active: c.id === activeId }"
            @click="selectConversation(c.id)"
          >
            <span class="dot" :class="'dot-' + diagnosisMain(c)" />
            <div class="conv-main">
              <div class="conv-top">
                <span class="conv-name">{{ c.customer_nickname || '未知客户' }}</span>
                <span class="conv-time">{{ relativeTime(c.last_message_at) }}</span>
              </div>
              <div class="conv-last-text">{{ lastMsgPreview(c) }}</div>
            </div>
          </div>
        </div>
        <div class="list-pager">
          <el-pagination small layout="prev, pager, next" :total="total" :page-size="pageSize" :current-page="page" @current-change="onPage" />
        </div>
      </div>

      <!-- 中:消息流(纯只读,无任何发送入口) -->
      <div class="col col-mid">
        <div class="col-head">{{ activeConv.customer_nickname ? '消息 · ' + activeConv.customer_nickname : '消息' }}</div>
        <div ref="msgRef" v-loading="msgLoading" class="message-list">
          <el-empty v-if="!activeId" description="选择左侧会话查看对话" :image-size="80" />
          <el-empty v-else-if="!messages.length && !msgLoading" description="暂无消息" :image-size="80" />
          <template v-for="item in renderItems" :key="item.msg.id">
            <div v-if="item.sep" class="message-time-sep"><span>{{ item.sep }}</span></div>
            <div class="message-row" :class="item.msg.direction === 'outbound' ? 'message-row-right' : 'message-row-left'">
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
      </div>

      <!-- 右:客户全貌(纯只读) -->
      <div class="col col-right">
        <div class="col-head">客户全貌</div>
        <div v-if="!activeId" class="right-empty"><el-empty description="选择会话查看全貌" :image-size="80" /></div>
        <div v-else v-loading="detailLoading" class="right-body">
          <div class="block">
            <div class="block-title">意向 / 阶段 / 完整度</div>
            <el-space wrap>
              <el-tag :type="intentMap[activeConv.intent_label]?.type || 'info'">{{ intentMap[activeConv.intent_label]?.label || '未识别' }}</el-tag>
              <el-tag>{{ stageMap[activeConv.current_stage] || activeConv.current_stage || '-' }}</el-tag>
            </el-space>
            <el-progress :percentage="Number(activeConv.completeness_score || 0)" :stroke-width="8" style="margin-top:8px" />
          </div>

          <div v-if="lead" class="block">
            <div class="block-title">线索</div>
            <el-space wrap>
              <el-tag :type="leadLevelType(lead.lead_level)">{{ leadLevelLabel(lead.lead_level) }}</el-tag>
              <span class="muted">评分 {{ lead.lead_score }}</span>
              <span class="muted">状态 {{ leadStatusLabel(lead.status) }}</span>
            </el-space>
          </div>

          <div class="block">
            <div class="block-title">诊断标签</div>
            <el-space wrap>
              <el-tag v-for="t in diagnosisTags(activeConv)" :key="t.field + t.label" :type="t.color" effect="plain" size="small">{{ t.label }}</el-tag>
              <span v-if="!diagnosisTags(activeConv).length" class="muted">-</span>
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

          <div class="block">
            <div class="block-title">关联工单</div>
            <div v-for="w in workorders" :key="w.id" class="wo-row">
              <el-tag size="small" type="info">{{ woTypeLabel(w.workorder_type) }}</el-tag>
              <span class="wo-title" :title="w.title">{{ w.title || '#' + w.id }}</span>
              <span class="muted">{{ w.status }}</span>
            </div>
            <div v-if="!workorders.length" class="muted">无工单</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { listConversations, getConversation, getMessages, getConversationFacets } from '../api/conversations'
import { getLead } from '../api/leads'
import {
  diagnosisOptions, diagnosisTags, diagnosisMain, fieldValidityRows, statusType, statusLabel,
} from '../utils/diagnosis'

const intentMap = {
  simple_inquiry: { label: '简单咨询', type: 'info' },
  appointment: { label: '预约', type: 'success' },
  complaint: { label: '投诉', type: 'danger' },
  price_inquiry: { label: '询价', type: 'warning' },
}
const stageMap = { new: '新会话', collecting: '收集中', completing: '补全中', done: '已完成' }
const woTypeMap = { inquiry: '线索跟进', appointment: '预约确认', complaint: '投诉处理', pricing: '报价回复' }
const leadLevelMap = { high: '高意向', mid: '中意向', low: '低意向' }
const leadStatusMap = { new: '新线索', following: '跟进中', converted: '已成交', lost: '已流失' }
const platformNameMap = { douyin: '抖音', xiaohongshu: '小红书', kuaishou: '快手', meituan: '美团', taobao: '淘宝/天猫', wechat: '微信/视频号' }
const pageNameMap = { 'private-message': '抖音私信', 'laike-message': '来客私信', feige: '飞鸽' }
const workorderOptions = [
  { label: '线索跟进', value: 'inquiry' },
  { label: '预约确认', value: 'appointment' },
  { label: '投诉处理', value: 'complaint' },
  { label: '报价回复', value: 'pricing' },
]

const facets = ref({ platforms: [], pages: [], agents: [] })
const sel = ref({ platform: '', page: '', agent: '', nickname: '', keyword: '', worktype: '', color: '' })

const platformOptions = computed(() => facets.value.platforms || [])
const pageOptions = computed(() => (facets.value.pages || []).filter((p) => p.platform === sel.value.platform).map((p) => p.platform_page))
const agentOptions = computed(() => (facets.value.agents || [])
  .filter((a) => a.platform === sel.value.platform && a.platform_page === sel.value.page)
  .map((a) => a.agent))

function platformLabel(p) { return platformNameMap[p] || p }
function pageLabel(pg) { return pageNameMap[pg] || pg }

const contentTypeLabel = { image: '[图片]', card: '[卡片]', file: '[文件]', video: '[视频]', audio: '[语音]', emoji: '[表情]' }
function lastMsgPreview(c) {
  if (c.last_message_text) return c.last_message_text
  if (c.last_message_type) return contentTypeLabel[c.last_message_type] || '[' + c.last_message_type + ']'
  return ''
}
function relativeTime(value) {
  if (!value) return ''
  const t = new Date(String(value).replace(' ', 'T')).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  if (diff < 60000) return '刚刚'
  const min = Math.floor(diff / 60000)
  if (min < 60) return min + '分钟前'
  const hr = Math.floor(min / 60)
  if (hr < 24) return hr + '小时前'
  return Math.floor(hr / 24) + '天前'
}

const conversations = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const listLoading = ref(false)

const activeId = ref(null)
const activeConv = ref({})
const messages = ref([])
const lead = ref(null)
const workorders = ref([])
const msgLoading = ref(false)
const detailLoading = ref(false)
const msgRef = ref(null)

const fieldRows = computed(() => fieldValidityRows(activeConv.value.field_validity))

const renderItems = computed(() => (messages.value || []).map((m) => {
  const precise = !!(m.raw_snapshot && m.raw_snapshot.time_estimated === false)
  return {
    msg: m,
    sep: (m.raw_snapshot && m.raw_snapshot.divider_text) || null,
    hoverTime: precise ? formatDate(m.occurred_at) : '',
    nick: m.direction === 'outbound' ? (m.sender_nickname || '客服') : '',
  }
}))

function woTypeLabel(t) { return woTypeMap[t] || t || '工单' }
function leadLevelLabel(l) { return leadLevelMap[l] || l || '-' }
function leadLevelType(l) { return l === 'high' ? 'danger' : (l === 'mid' ? 'warning' : 'info') }
function leadStatusLabel(s) { return leadStatusMap[s] || s || '-' }

function formatDate(value) {
  if (!value) return '-'
  const text = String(value)
  if (!text.includes('T')) return text.slice(0, 19)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return text.slice(0, 19)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

async function loadFacets() {
  try {
    const res = await getConversationFacets()
    facets.value = res.data || { platforms: [], pages: [], agents: [] }
    // 默认:第一个平台 + 该平台第一个页面 + 客服全部
    sel.value.platform = facets.value.platforms[0] || ''
    sel.value.page = pageOptions.value[0] || ''
    sel.value.agent = ''
  } catch (_) { /* 无 facets 不阻塞,仍可加载全部会话 */ }
}

async function loadList() {
  listLoading.value = true
  try {
    const params = { page: page.value, page_size: pageSize }
    if (sel.value.platform) params.platform = sel.value.platform
    if (sel.value.page) params.platform_page = sel.value.page
    if (sel.value.agent) params.agent = sel.value.agent
    if (sel.value.nickname) params.nickname = sel.value.nickname
    if (sel.value.keyword) params.keyword = sel.value.keyword
    if (sel.value.worktype) params.workorder_type = sel.value.worktype
    if (sel.value.color) params.diagnosis_color = sel.value.color
    const res = await listConversations(params)
    conversations.value = res.data?.list || []
    total.value = res.data?.total || 0
    if (conversations.value.length && !conversations.value.some((c) => c.id === activeId.value)) {
      selectConversation(conversations.value[0].id)
    }
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '加载会话列表失败')
  } finally {
    listLoading.value = false
  }
}

function reload() { page.value = 1; loadList() }
function onPage(p) { page.value = p; loadList() }
function onPlatformChange() { sel.value.page = pageOptions.value[0] || ''; sel.value.agent = ''; reload() }
function onPageChange() { sel.value.agent = ''; reload() }

async function selectConversation(id) {
  activeId.value = id
  lead.value = null
  workorders.value = []
  detailLoading.value = true
  msgLoading.value = true
  try {
    const [detailRes, msgRes] = await Promise.all([
      getConversation(id),
      getMessages(id, { page: 1, page_size: 100, latest: 1 }),
    ])
    activeConv.value = detailRes.data || {}
    messages.value = msgRes.data?.list || []
    await nextTick()
    scrollToBottom()
    const leadId = activeConv.value.lead_id
    if (leadId) {
      try {
        const lr = await getLead(leadId)
        lead.value = lr.data?.lead || null
        workorders.value = lr.data?.workorders || []
      } catch (_) { /* 无 lead 不阻塞 */ }
    }
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '加载客户全貌失败')
  } finally {
    detailLoading.value = false
    msgLoading.value = false
  }
}

function scrollToBottom() {
  const el = msgRef.value
  if (el) el.scrollTop = el.scrollHeight
}

async function init() {
  await loadFacets()
  await loadList()
}
init()
</script>

<style scoped>
.aggregate-page { display: flex; flex-direction: column; gap: 12px; height: calc(100vh - 88px); }
.filter-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; background: #fff; border: 1px solid var(--rpa-border, #e5e7eb); border-radius: 8px; padding: 12px 16px; }
.fb-item { display: flex; align-items: center; gap: 6px; }
.fb-item label { font-size: 13px; color: var(--rpa-ink-2, #475569); white-space: nowrap; }
.aggregate { display: flex; gap: 12px; flex: 1 1 auto; min-height: 0; }
.col { background: #fff; border: 1px solid var(--rpa-border, #e5e7eb); border-radius: 8px; display: flex; flex-direction: column; min-height: 0; }
.col-left { width: 300px; flex: 0 0 300px; }
.col-mid { flex: 1 1 auto; min-width: 0; }
.col-right { width: 360px; flex: 0 0 360px; }
.col-head { padding: 10px 14px; font-weight: 600; border-bottom: 1px solid var(--rpa-border, #e5e7eb); color: var(--rpa-ink, #0f172a); }
.conv-list { flex: 1 1 auto; overflow-y: auto; }
.conv-item { display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f1f5f9; }
.conv-item:hover { background: #f8fafc; }
.conv-item.active { background: var(--rpa-brand-soft, #eef0ff); }
.dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex: 0 0 8px; }
.dot-danger { background: #f56c6c; }
.dot-warning { background: #e6a23c; }
.dot-success { background: #67c23a; }
.dot-info { background: #c0c4cc; }
.conv-main { min-width: 0; flex: 1; }
.conv-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.conv-name { flex: 1; min-width: 0; font-size: 14px; color: var(--rpa-ink, #0f172a); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.conv-time { flex: 0 0 auto; font-size: 12px; color: #94a3b8; }
.conv-last-text { margin-top: 4px; font-size: 13px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.list-pager { padding: 8px; border-top: 1px solid var(--rpa-border, #e5e7eb); text-align: center; }
.message-list { flex: 1 1 auto; overflow-y: auto; padding: 12px 16px; }
.message-row { display: flex; margin-bottom: 14px; }
.message-row-left { justify-content: flex-start; }
.message-row-right { justify-content: flex-end; }
.message-bubble { max-width: 70%; border-radius: 8px; padding: 10px 12px; border: 1px solid var(--rpa-border, #e5e7eb); }
.message-bubble.inbound { background: #ffffff; }
.message-bubble.outbound { background: var(--rpa-brand-soft, #eef0ff); }
.message-time-sep { text-align: center; margin: 12px 0 8px; }
.message-time-sep span { display: inline-block; font-size: 12px; color: #9ca3af; background: rgba(15, 23, 42, 0.05); padding: 2px 10px; border-radius: 10px; }
.message-sender-name { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
.message-content { white-space: pre-wrap; word-break: break-word; line-height: 1.6; color: var(--rpa-ink, #0f172a); }
.right-body { flex: 1 1 auto; overflow-y: auto; padding: 12px 14px; }
.right-empty { flex: 1; display: flex; align-items: center; justify-content: center; }
.block { margin-bottom: 16px; }
.block-title { font-size: 13px; font-weight: 600; color: var(--rpa-ink-2, #475569); margin-bottom: 8px; }
.fv-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; }
.fv-label { width: 64px; color: #64748b; flex: 0 0 64px; }
.fv-value { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--rpa-ink, #0f172a); }
.wo-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: 13px; }
.wo-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.muted { color: #94a3b8; font-size: 12px; }
</style>
