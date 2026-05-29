<template>
  <div>
    <el-card shadow="never" class="toolbar-card">
      <div class="toolbar">
        <span class="total-label">共 {{ total }} 条授权</span>
        <el-button v-perm="'plugin:create'" type="primary" :icon="Plus" @click="openDialog()">新增授权</el-button>
      </div>
    </el-card>

    <el-card shadow="never" style="margin-top:16px">
      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="Plugin Key" min-width="220">
          <template #default="{ row }">
            <div class="key-cell">
              <el-tooltip :content="row.plugin_key" placement="top" :show-after="300">
                <el-text truncated style="max-width:180px;font-size:12px;font-family:monospace;cursor:default">{{ row.plugin_key }}</el-text>
              </el-tooltip>
              <el-button
                type="primary" link size="small"
                :icon="CopyDocument"
                @click="copyKey(row.plugin_key)"
              />
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="username" label="所属用户" width="120" />
        <el-table-column label="平台" width="120">
          <template #default="{ row }">
            {{ getPlatformLabel(row.platform) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">
              {{ row.status === 1 ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="max_online" label="最大在线" width="80" align="center" />
        <el-table-column label="到期时间" width="160">
          <template #default="{ row }">
            {{ row.expire_at ? row.expire_at.replace('T',' ').slice(0,19) : '永久' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="220" fixed="right">
          <template #default="{ row }">
            <div class="action-group">
              <el-button v-perm="'plugin:update'" type="primary" link size="small" @click="openDialog(row)">编辑</el-button>
              <el-button v-perm="'plugin:config-kw'" type="primary" link size="small" @click="openKwDialog(row)">关键词</el-button>
              <el-button v-perm="'plugin:config-ai'" type="primary" link size="small" @click="openAiDialog(row)">AI</el-button>
              <el-button v-perm="'plugin:config-kb'" type="primary" link size="small" @click="openKbDialog(row)">知识库</el-button>
              <el-popconfirm title="确定删除该插件授权吗？" @confirm="handleDelete(row.id)">
                <template #reference>
                  <el-button v-perm="'plugin:delete'" type="danger" link size="small">删除</el-button>
                </template>
              </el-popconfirm>
            </div>
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
          @change="fetchList"
        />
      </div>
    </el-card>

    <!-- Dialog: 新增/编辑授权 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑插件授权' : '新增插件授权'"
      width="480px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="所属用户" prop="user_id">
          <el-select v-model="form.user_id" placeholder="请选择用户" filterable style="width:100%">
            <el-option
              v-for="u in userOptions"
              :key="u.id"
              :label="u.username"
              :value="u.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="平台" prop="platform">
          <el-select v-model="form.platform" style="width:100%" placeholder="请选择平台">
            <el-option
              v-for="p in platformOptions"
              :key="p.runtime_key || p.platform_key"
              :label="p.platform_name"
              :value="p.runtime_key || p.platform_key"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status" style="width:100%">
            <el-option label="启用" :value="1" />
            <el-option label="禁用" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item label="最大在线数">
          <el-input-number v-model="form.max_online" :min="1" :max="100" />
        </el-form-item>
        <el-form-item label="到期时间">
          <el-date-picker
            v-model="form.expire_at"
            type="datetime"
            placeholder="留空表示永久"
            style="width:100%"
            value-format="YYYY-MM-DD HH:mm:ss"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- Dialog: 关键词配置 -->
    <el-dialog
      v-model="kwDialogVisible"
      title="关键词配置"
      width="560px"
      destroy-on-close
      @closed="kwFormReset()"
    >
      <el-form :model="kwForm" label-width="120px">
        <el-form-item label="自动启动">
          <el-switch v-model="kwForm.autoReply" />
        </el-form-item>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="轮询间隔(秒)">
              <el-input-number v-model="kwForm.kefuBreak" :min="3" :max="300" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="发送延迟(秒)">
              <el-input-number v-model="kwForm.speakLimit" :min="1" :max="60" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="关键词话术">
          <el-input
            v-model="kwForm.keywords"
            type="textarea"
            :rows="4"
            placeholder="每行一条：关键词1|关键词2#回复A|回复B"
          />
        </el-form-item>
        <el-form-item label="兜底回复">
          <el-input v-model="kwForm.fallback" placeholder="支持 {昵称} 变量" />
        </el-form-item>
        <el-form-item label="转人工关键词">
          <el-input v-model="kwForm.transfer_keywords" placeholder="逗号分隔，如：人工,客服,投诉,转人工" />
        </el-form-item>
        <el-form-item label="黑名单词">
          <el-input v-model="kwForm.blackWords" placeholder="# 分隔，如：广告#刷单#加微信" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="kwDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="kwSaving" @click="saveKwConfig">保存配置</el-button>
      </template>
    </el-dialog>

    <!-- Dialog: AI 配置 -->
    <el-dialog
      v-model="aiDialogVisible"
      title="AI 配置"
      width="560px"
      destroy-on-close
      @closed="aiFormReset()"
    >
      <el-form :model="aiForm" label-width="120px">
        <el-form-item label="接口地址">
          <el-select v-model="aiForm.baseURL" style="width:100%" @change="onAiBaseURLChange">
            <el-option label="DeepSeek — https://api.deepseek.com" value="https://api.deepseek.com" />
            <el-option label="自定义" value="__custom__" />
          </el-select>
          <el-input
            v-if="aiForm.baseURL === '__custom__'"
            v-model="aiForm.baseURLCustom"
            placeholder="https://api.deepseek.com"
            style="margin-top:6px"
          />
        </el-form-item>
        <el-form-item label="API Key">
          <el-input
            v-model="aiForm.apiKey"
            :type="showAiKey ? 'text' : 'password'"
            placeholder="sk-..."
          >
            <template #suffix>
              <el-icon style="cursor:pointer" @click="showAiKey = !showAiKey">
                <View v-if="!showAiKey" />
                <Hide v-else />
              </el-icon>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="模型名称">
          <template v-if="aiForm.baseURL === '__custom__'">
            <el-input v-model="aiForm.modelCustom" placeholder="deepseek-chat" />
          </template>
          <el-select v-else v-model="aiForm.model" style="width:100%">
            <el-option label="deepseek-v4-flash" value="deepseek-v4-flash" />
            <el-option label="deepseek-v4-pro" value="deepseek-v4-pro" />
          </el-select>
        </el-form-item>
        <el-form-item label="系统提示词">
          <el-input
            v-model="aiForm.system_prompt"
            type="textarea"
            :rows="4"
            placeholder="你是一名专业的电商客服助手..."
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="aiDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="aiSaving" @click="saveAiConfig">保存配置</el-button>
      </template>
    </el-dialog>

    <!-- Dialog: 知识库配置 -->
    <el-dialog
      v-model="kbDialogVisible"
      title="知识库配置"
      width="600px"
      destroy-on-close
      @open="loadKbFiles"
    >
      <el-upload
        :show-file-list="false"
        accept=".txt,.md"
        :before-upload="handleKbUpload"
      >
        <el-button type="primary" :icon="UploadFilled" :loading="kbUploading" style="margin-bottom:12px">上传知识库文件</el-button>
        <el-text type="info" size="small" style="margin-left:8px">支持 .txt / .md</el-text>
      </el-upload>

      <el-table :data="kbFileList" v-loading="kbLoading" stripe empty-text="暂无知识库文件" style="width:100%">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="filename" label="文件名" min-width="200" />
        <el-table-column prop="chunk_count" label="分块数" width="80" align="center" />
        <el-table-column label="上传时间" width="170">
          <template #default="{ row }">{{ row.created_at }}</template>
        </el-table-column>
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-popconfirm title="确定删除该文件？" @confirm="handleKbDelete(row.id)">
              <template #reference>
                <el-button type="danger" link size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="kbDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, CopyDocument, View, Hide, UploadFilled } from '@element-plus/icons-vue'
import { getPluginList, createPlugin, updatePlugin, deletePlugin } from '../api/plugins'
import { getUserList } from '../api/users'
import { getPlatformList } from '../api/platforms'
import { getPluginConfig, savePluginConfig } from '../api/configs'
import { getAiConfig, saveAiConfig as saveAiCfgApi } from '../api/ai'
import { getKnowledgeList, uploadKnowledge, deleteKnowledge } from '../api/knowledge'

const loading        = ref(false)
const submitting     = ref(false)
const tableData      = ref([])
const total          = ref(0)
const page           = ref(1)
const pageSize       = ref(20)
const userOptions    = ref([])
const platformOptions = ref([])

const dialogVisible = ref(false)
const editingId     = ref(null)
const formRef       = ref(null)

const form = reactive({ user_id: null, platform: '', status: 1, max_online: 1, expire_at: null })

const rules = {
  user_id:  [{ required: true, message: '请选择用户',     trigger: 'change' }],
  platform: [{ required: true, message: '请选择平台',     trigger: 'change' }],
}

// 关键词配置
const kwDialogVisible = ref(false)
const kwSaving = ref(false)
const kwPluginId = ref(null)
const kwPlatform = ref('')
const kwForm = reactive({
  autoReply: false,
  kefuBreak: 10,
  speakLimit: 3,
  keywords: '',
  fallback: '',
  transfer_keywords: '',
  blackWords: '',
})

function kwFormReset() {
  kwForm.autoReply = false
  kwForm.kefuBreak = 10
  kwForm.speakLimit = 3
  kwForm.keywords = ''
  kwForm.fallback = ''
  kwForm.transfer_keywords = ''
  kwForm.blackWords = ''
}

// AI 配置
const aiDialogVisible = ref(false)
const aiSaving = ref(false)
const showAiKey = ref(false)
const aiPluginId = ref(null)
const aiPlatform = ref('')
const aiForm = reactive({
  baseURL: 'https://api.deepseek.com',
  baseURLCustom: '',
  apiKey: '',
  model: 'deepseek-v4-flash',
  modelCustom: 'deepseek-chat',
  system_prompt: '',
})

// 知识库配置
const kbDialogVisible = ref(false)
const kbLoading = ref(false)
const kbUploading = ref(false)
const kbPluginId = ref(null)
const kbFileList = ref([])

function aiFormReset() {
  aiForm.baseURL = 'https://api.deepseek.com'
  aiForm.baseURLCustom = ''
  aiForm.apiKey = ''
  aiForm.model = 'deepseek-v4-flash'
  aiForm.modelCustom = 'deepseek-chat'
  aiForm.system_prompt = ''
  showAiKey.value = false
}

function onAiBaseURLChange(val) {
  if (val !== '__custom__') {
    aiForm.baseURLCustom = ''
  }
}

async function fetchList() {
  loading.value = true
  try {
    const res = await getPluginList({ page: page.value, size: pageSize.value })
    tableData.value = res.data.list
    total.value     = res.data.total
  } finally {
    loading.value = false
  }
}

async function fetchUsers() {
  const res = await getUserList({ page: 1, size: 100 })
  userOptions.value = res.data.list
}

async function fetchPlatforms() {
  const res = await getPlatformList({ enabled: 1 })
  platformOptions.value = res.data
}

function getPlatformLabel(platformKey) {
  const normalized = String(platformKey || '').trim().toLowerCase()
  const item = platformOptions.value.find((row) => {
    return (row.runtime_key || row.platform_key) === normalized || row.platform_key === normalized
  })
  return item ? item.platform_name : platformKey
}

function openDialog(row = null) {
  editingId.value = row?.id || null
  Object.assign(form, {
    user_id:    row?.user_id    || null,
    platform:   row?.platform   || '',
    status:     row?.status     ?? 1,
    max_online: row?.max_online ?? 1,
    expire_at:  row?.expire_at  || null,
  })
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    if (editingId.value) {
      await updatePlugin(editingId.value, form)
    } else {
      const res = await createPlugin(form)
      ElMessage.success(`创建成功，Plugin Key：${res.data.plugin_key}`)
      dialogVisible.value = false
      fetchList()
      return
    }
    ElMessage.success('修改成功')
    dialogVisible.value = false
    fetchList()
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

async function handleDelete(id) {
  try {
    await deletePlugin(id)
    ElMessage.success('删除成功')
    fetchList()
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '删除失败')
  }
}

function copyKey(key) {
  navigator.clipboard.writeText(key).then(() => ElMessage.success('已复制'))
}

// 关键词配置
async function openKwDialog(row) {
  kwPluginId.value = row.id
  kwPlatform.value = row.platform
  kwFormReset()
  kwDialogVisible.value = true
  // 异步加载已有配置
  try {
    const res = await getPluginConfig(row.id, row.platform)
    const cfg = res.data?.config_json
    if (cfg) {
      const parsed = typeof cfg === 'string' ? JSON.parse(cfg) : cfg
      kwForm.autoReply = !!parsed.autoReply
      kwForm.kefuBreak = parsed.kefuBreak ?? 10
      kwForm.speakLimit = parsed.speakLimit ?? 3
      kwForm.keywords = parsed.keywords || ''
      kwForm.fallback = parsed.fallback || ''
      kwForm.transfer_keywords = parsed.transfer_keywords || ''
      kwForm.blackWords = parsed.blackWords || ''
    }
  } catch {
    // 无配置时使用默认值
  }
}

async function saveKwConfig() {
  kwSaving.value = true
  try {
    await savePluginConfig(kwPluginId.value, kwPlatform.value, {
      config_json: {
        autoReply: kwForm.autoReply,
        kefuBreak: kwForm.kefuBreak,
        speakLimit: kwForm.speakLimit,
        keywords: kwForm.keywords,
        fallback: kwForm.fallback,
        transfer_keywords: kwForm.transfer_keywords,
        blackWords: kwForm.blackWords,
      },
    })
    ElMessage.success('关键词配置已保存')
    kwDialogVisible.value = false
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '保存失败')
  } finally {
    kwSaving.value = false
  }
}

// AI 配置
async function openAiDialog(row) {
  aiPluginId.value = row.id
  aiPlatform.value = row.platform
  aiFormReset()
  aiDialogVisible.value = true
  // 异步加载已有 AI 配置
  try {
    const res = await getPluginConfig(row.id, row.platform)
    const cfg = res.data?.config_json
    if (cfg) {
      const parsed = typeof cfg === 'string' ? JSON.parse(cfg) : cfg
      const url = parsed.baseURL || 'https://api.deepseek.com'
      if (url !== 'https://api.deepseek.com' && url !== '') {
        aiForm.baseURL = '__custom__'
        aiForm.baseURLCustom = url
        aiForm.modelCustom = parsed.model || 'deepseek-chat'
      } else {
        aiForm.baseURL = url
        aiForm.model = parsed.model || 'deepseek-v4-flash'
      }
      aiForm.apiKey = parsed.apiKey || ''
      aiForm.system_prompt = parsed.system_prompt || ''
    }
  } catch {
    // 无配置时使用默认值
  }
}

async function saveAiConfig() {
  aiSaving.value = true
  try {
    const baseURL = aiForm.baseURL === '__custom__' ? aiForm.baseURLCustom.trim() : aiForm.baseURL
    const model = aiForm.baseURL === '__custom__' ? aiForm.modelCustom.trim() : aiForm.model
    await savePluginConfig(aiPluginId.value, aiPlatform.value, {
      config_json: {
        baseURL: baseURL || 'https://api.deepseek.com',
        apiKey: aiForm.apiKey,
        model: model || 'deepseek-chat',
        system_prompt: aiForm.system_prompt,
      },
    })
    ElMessage.success('AI 配置已保存')
    aiDialogVisible.value = false
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '保存失败')
  } finally {
    aiSaving.value = false
  }
}

// 知识库配置
async function openKbDialog(row) {
  kbPluginId.value = row.id
  kbFileList.value = []
  kbDialogVisible.value = true
}

async function loadKbFiles() {
  if (!kbPluginId.value) return
  kbLoading.value = true
  try {
    const res = await getKnowledgeList(kbPluginId.value)
    kbFileList.value = res.data || []
  } catch {
    kbFileList.value = []
  } finally {
    kbLoading.value = false
  }
}

async function handleKbUpload(file) {
  kbUploading.value = true
  try {
    const res = await uploadKnowledge(kbPluginId.value, file)
    ElMessage.success(`上传成功，共分 ${res.data?.chunk_count || 0} 块`)
    await loadKbFiles()
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '上传失败')
  } finally {
    kbUploading.value = false
  }
  return false
}

async function handleKbDelete(fileId) {
  try {
    await deleteKnowledge(kbPluginId.value, fileId)
    ElMessage.success('删除成功')
    await loadKbFiles()
  } catch {
    ElMessage.error('删除失败')
  }
}

onMounted(() => { fetchList(); fetchUsers(); fetchPlatforms() })
</script>

<style scoped>
.toolbar-card :deep(.el-card__body) { padding: 14px 20px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; }
.total-label { color: #606266; font-size: 14px; }
.key-cell { display: flex; align-items: center; gap: 4px; }
.pagination { display: flex; justify-content: flex-end; margin-top: 16px; }
.action-group { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; }
</style>
