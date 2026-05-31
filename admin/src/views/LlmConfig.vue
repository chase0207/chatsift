<template>
  <div>
    <el-card shadow="never" class="config-card">
      <template #header>
        <div class="card-head">
          <span>LLM 配置</span>
          <el-tag :type="form.enabled ? 'success' : 'info'" size="small">
            {{ form.enabled ? '已启用' : '未启用' }}
          </el-tag>
        </div>
      </template>

      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px" class="config-form">
        <el-form-item label="接口地址" prop="api_base">
          <el-input v-model="form.api_base" placeholder="https://api.deepseek.com" />
        </el-form-item>
        <el-form-item label="模型" prop="model">
          <el-input v-model="form.model" placeholder="deepseek-chat" />
        </el-form-item>
        <el-form-item label="API Key">
          <el-input
            v-model="form.api_key"
            type="password"
            show-password
            :placeholder="maskedKey || '留空表示不修改'"
          />
        </el-form-item>
        <el-form-item label="月度配额" prop="monthly_token_quota">
          <el-input-number
            v-model="form.monthly_token_quota"
            :min="0"
            :step="10000"
            :controls="false"
            style="width:220px"
          />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item label="本月用量">
          <div class="usage-block">
            <el-progress
              :percentage="usagePercent"
              :status="usagePercent >= 90 ? 'exception' : undefined"
              :stroke-width="10"
            />
            <el-text type="info" size="small">
              {{ form.monthly_token_used || 0 }} / {{ form.monthly_token_quota || 0 }} tokens
            </el-text>
          </div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
          <el-button @click="fetchConfig">刷新</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getLlmConfig, updateLlmConfig } from '../api/llmConfig'

const formRef = ref(null)
const saving = ref(false)
const maskedKey = ref('')

const form = reactive({
  api_base: 'https://api.deepseek.com',
  api_key: '',
  model: 'deepseek-chat',
  monthly_token_quota: 1000000,
  monthly_token_used: 0,
  enabled: false,
})

const rules = {
  api_base: [{ required: true, message: '请输入接口地址', trigger: 'blur' }],
  model: [{ required: true, message: '请输入模型', trigger: 'blur' }],
  monthly_token_quota: [{ required: true, message: '请输入月度配额', trigger: 'blur' }],
}

const usagePercent = computed(() => {
  const quota = Number(form.monthly_token_quota || 0)
  if (!quota) return 0
  return Math.min(100, Math.round(Number(form.monthly_token_used || 0) / quota * 100))
})

async function fetchConfig() {
  try {
    const res = await getLlmConfig()
    const data = res.data || {}
    Object.assign(form, {
      api_base: data.api_base || 'https://api.deepseek.com',
      api_key: '',
      model: data.model || data.model_name || 'deepseek-chat',
      monthly_token_quota: Number(data.monthly_token_quota || 1000000),
      monthly_token_used: Number(data.monthly_token_used || 0),
      enabled: Boolean(data.enabled),
    })
    maskedKey.value = data.api_key || ''
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '加载配置失败')
  }
}

async function save() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    const payload = {
      api_base: form.api_base,
      model: form.model,
      monthly_token_quota: form.monthly_token_quota,
      enabled: form.enabled ? 1 : 0,
    }
    if (form.api_key) payload.api_key = form.api_key
    await updateLlmConfig(payload)
    ElMessage.success('保存成功')
    fetchConfig()
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(fetchConfig)
</script>

<style scoped>
.config-card { max-width: 760px; }
.card-head { display: flex; align-items: center; justify-content: space-between; font-weight: 600; }
.config-form { max-width: 640px; }
.usage-block { width: 100%; display: flex; flex-direction: column; gap: 6px; }
</style>
