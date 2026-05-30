<template>
  <div class="login-wrapper">
    <el-card class="login-card" shadow="always">
      <div class="login-header">
        <img src="/logo.png" class="logo" alt="logo" />
        <h2>Chatsift 会话分拣</h2>
        <p>Conversation Sifting Admin</p>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        size="large"
        @keyup.enter="handleLogin"
      >
        <el-form-item prop="username">
          <el-input
            v-model="form.username"
            placeholder="请输入账号"
            :prefix-icon="User"
            clearable
          />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            :prefix-icon="Lock"
            show-password
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            class="login-btn"
            :loading="loading"
            @click="handleLogin"
          >
            登 录
          </el-button>
        </el-form-item>
      </el-form>

      <el-alert
        v-if="errorMsg"
        :title="errorMsg"
        type="error"
        show-icon
        :closable="false"
        style="margin-top: -8px"
      />
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { User, Lock } from '@element-plus/icons-vue'
import { useUserStore } from '../stores/user'

const router  = useRouter()
const route   = useRoute()
const store   = useUserStore()
const formRef = ref(null)
const loading = ref(false)
const errorMsg = ref('')

const form = reactive({ username: '', password: '' })

const rules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function handleLogin() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value  = true
  errorMsg.value = ''
  try {
    await store.login(form.username, form.password)
    const redirect = route.query.redirect || '/dashboard'
    router.push(redirect)
  } catch (err) {
    errorMsg.value = err?.response?.data?.message || '登录失败，请检查账号密码'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-wrapper {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background:
    radial-gradient(circle at 18% 22%, rgba(94, 106, 210, 0.28), transparent 42%),
    radial-gradient(circle at 82% 78%, rgba(104, 119, 236, 0.22), transparent 46%),
    linear-gradient(135deg, #0f1428 0%, #121a36 55%, #0a1024 100%);
}

.login-card {
  width: 408px;
  border-radius: 16px;
  padding: 16px 12px;
  background: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow:
    0 24px 64px rgba(15, 23, 42, 0.45),
    0 8px 24px rgba(15, 23, 42, 0.25);
}

:deep(.el-card__body) {
  padding: 28px 26px;
}

.login-header {
  text-align: center;
  margin-bottom: 28px;
}

.logo {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  margin-bottom: 14px;
  object-fit: contain;
  display: block;
  margin-left: auto;
  margin-right: auto;
}

.login-header h2 {
  margin: 0 0 6px;
  font-size: 20px;
  font-weight: 600;
  color: #0f172a;
  letter-spacing: -0.01em;
}

.login-header p {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  letter-spacing: 0.5px;
}

:deep(.el-input__wrapper) {
  padding: 1px 12px;
  border-radius: 8px;
  box-shadow: 0 0 0 1px #e5e7eb inset;
  transition: box-shadow .18s ease;
}
:deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px #cbd5e1 inset;
}
:deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #5e6ad2 inset, 0 0 0 3px rgba(94, 106, 210, 0.16) !important;
}
:deep(.el-input__inner) {
  color: #0f172a;
  font-size: 14px;
}
:deep(.el-input__inner::placeholder) {
  color: #94a3b8;
}

.login-btn {
  width: 100%;
  height: 44px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 4px;
  background: #5e6ad2;
  border-color: #5e6ad2;
  border-radius: 8px;
}
.login-btn:hover,
.login-btn:focus {
  background: #4f5bc5 !important;
  border-color: #4f5bc5 !important;
}
</style>
