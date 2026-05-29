<template>
  <div>
    <el-card shadow="never" class="toolbar-card">
      <div class="toolbar">
        <span class="total-label">共 {{ tableData.length }} 个平台</span>
        <el-button type="primary" :icon="Plus" @click="openDialog()">新增平台</el-button>
      </div>
    </el-card>

    <el-card shadow="never" style="margin-top:16px">
      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column prop="sort_order" label="排序" width="80" align="center" />
        <el-table-column label="平台名称" min-width="140">
          <template #default="{ row }">
            <span style="font-weight:600">{{ row.platform_name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="平台标识" width="120">
          <template #default="{ row }">
            <el-text type="info" size="small">{{ row.platform_key }}</el-text>
          </template>
        </el-table-column>
        <el-table-column label="页面" min-width="200">
          <template #default="{ row }">
            <div class="page-list">
              <el-tag
                v-for="p in (row.pages || [])"
                :key="p.id"
                size="small"
                style="margin:2px 4px 2px 0"
              >{{ p.page_name }} #{{ p.page_code || p.id }}</el-tag>
              <span v-if="!row.pages || !row.pages.length" class="no-pages">暂无页面</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="DOM状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="DOM_STATUS_MAP[row.dom_status]?.type || 'info'" size="small">
              {{ DOM_STATUS_MAP[row.dom_status]?.label || '未开发' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="80" align="center">
          <template #default="{ row }">
            <el-switch
              v-model="row.enabled"
              :active-value="1"
              :inactive-value="0"
              @change="toggleEnabled(row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <div class="action-group">
              <el-button type="primary" link size="small" @click="openDialog(row)">编辑</el-button>
              <el-button type="primary" link size="small" @click="openPageDialog(row)">页面管理</el-button>
              <el-popconfirm title="确定删除该平台吗？" @confirm="handleDelete(row.id)">
                <template #reference>
                  <el-button type="danger" link size="small">删除</el-button>
                </template>
              </el-popconfirm>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增 / 编辑 Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑平台' : '新增平台'"
      width="480px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item label="平台名称" prop="platform_name">
          <el-input v-model="form.platform_name" placeholder="平台展示名称" />
        </el-form-item>
        <el-form-item label="平台标识码" prop="platform_key">
          <el-input
            v-model="form.platform_key"
            placeholder="如：douyin / xiaohongshu / wechat"
            :disabled="!!editingId"
          />
          <el-text type="info" size="small" style="margin-top:4px">
            英文 + 下划线，新增后不可修改
          </el-text>
        </el-form-item>
        <el-form-item label="DOM状态">
          <el-select v-model="form.dom_status" style="width:100%">
            <el-option v-for="(v, k) in DOM_STATUS_MAP" :key="k" :label="`${k} - ${v.label}`" :value="Number(k)" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort_order" :min="0" :max="999" />
          <el-text type="info" size="small" style="margin-left:8px">数字越小越靠前</el-text>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 页面管理 Dialog -->
    <el-dialog
      v-model="pageDialogVisible"
      :title="'页面管理 — ' + (pagePlatform?.platform_name || '')"
      width="520px"
      destroy-on-close
      @open="fetchPages"
      @closed="onPageDialogClosed"
    >
      <div style="margin-bottom:12px">
        <el-button type="primary" size="small" :icon="Plus" @click="openPageForm()">新增页面</el-button>
      </div>
      <el-table :data="pageList" v-loading="pageLoading" stripe empty-text="暂无页面，请新增">
        <el-table-column prop="page_name" label="页面名称" min-width="130" />
        <el-table-column label="页面编号" width="90">
          <template #default="{ row }">
            <el-text type="info" size="small">{{ row.page_code || row.id }}</el-text>
          </template>
        </el-table-column>
        <el-table-column prop="url" label="URL" min-width="200">
          <template #default="{ row }">
            <el-text type="info" size="small" truncated>{{ row.url }}</el-text>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openPageForm(row)">编辑</el-button>
            <el-popconfirm title="确定删除该页面？" @confirm="handlePageDelete(row.id)">
              <template #reference>
                <el-button type="danger" link size="small">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <!-- 页面新增/编辑子 Dialog -->
    <el-dialog
      v-model="pageFormVisible"
      :title="pageEditingId ? '编辑页面' : '新增页面'"
      width="420px"
      destroy-on-close
    >
      <el-form :model="pageForm" label-width="90px">
        <el-form-item label="页面名称" required>
          <el-input v-model="pageForm.page_name" placeholder="页面展示名称" />
        </el-form-item>
        <el-form-item label="URL地址" required>
          <el-input v-model="pageForm.url" placeholder="https://im.jinritemai.com" />
          <el-text type="info" size="small">输入后自动去除参数部分</el-text>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pageFormVisible = false">取消</el-button>
        <el-button type="primary" :loading="pageSaving" @click="handlePageSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { getPlatformList, createPlatform, updatePlatform, deletePlatform } from '../api/platforms'
import { getPlatformPages, createPlatformPage, updatePlatformPage, deletePlatformPage } from '../api/pages'

const loading    = ref(false)
const submitting = ref(false)
const tableData  = ref([])

const dialogVisible = ref(false)
const editingId     = ref(null)
const formRef       = ref(null)

const DOM_STATUS_MAP = {
  0: { label: '未开发', type: 'info' },
  1: { label: '开发中', type: '' },
  2: { label: '待验证', type: 'warning' },
  3: { label: '已上线', type: 'success' },
  4: { label: '修复中', type: 'danger' },
}

const form = reactive({
  platform_name: '',
  platform_key:  '',
  url:           '',
  dom_status:    0,
  enabled:       1,
  sort_order:    0,
})

const rules = {
  platform_name: [{ required: true, message: '请输入平台名称', trigger: 'blur' }],
  platform_key:  [
    { required: true, message: '请输入平台标识码', trigger: 'blur' },
    { pattern: /^[a-z0-9_]+$/, message: '只允许小写字母、数字和下划线', trigger: 'blur' },
  ],
}

// 页面管理
const pageDialogVisible = ref(false)
const pageLoading = ref(false)
const pagePlatform = ref(null)
const pageList = ref([])

const pageFormVisible = ref(false)
const pageSaving = ref(false)
const pageEditingId = ref(null)
const pagePlatformId = ref(null)
const pageForm = reactive({ page_name: '', url: '' })

async function fetchList() {
  loading.value = true
  try {
    const res = await getPlatformList()
    tableData.value = res.data
  } finally {
    loading.value = false
  }
}

function openDialog(row = null) {
  editingId.value = row?.id || null
  Object.assign(form, {
    platform_name: row?.platform_name || '',
    platform_key:  row?.platform_key  || '',
    url:           row?.url           || '',
    dom_status:    row?.dom_status    ?? 0,
    enabled:       row?.enabled       ?? 1,
    sort_order:    row?.sort_order    ?? 0,
  })
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    if (editingId.value) {
      await updatePlatform(editingId.value, {
        platform_name: form.platform_name,
        url:           form.url,
        dom_status:    form.dom_status,
        enabled:       form.enabled,
        sort_order:    form.sort_order,
      })
      ElMessage.success('修改成功')
    } else {
      await createPlatform({
        ...form,
        url: form.url || 'https://' + form.platform_key + '.com',
      })
      ElMessage.success('新增成功')
    }
    dialogVisible.value = false
    fetchList()
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '操作失败')
  } finally {
    submitting.value = false
  }
}

async function toggleEnabled(row) {
  try {
    await updatePlatform(row.id, { enabled: row.enabled })
    ElMessage.success(row.enabled === 1 ? '已启用' : '已禁用')
  } catch (err) {
    row.enabled = row.enabled === 1 ? 0 : 1
    ElMessage.error('操作失败')
  }
}

async function handleDelete(id) {
  try {
    await deletePlatform(id)
    ElMessage.success('删除成功')
    fetchList()
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '删除失败')
  }
}

// 页面管理
function openPageDialog(row) {
  pagePlatform.value = row
  pagePlatformId.value = row.id
  pageList.value = []
  pageDialogVisible.value = true
}

async function fetchPages() {
  if (!pagePlatformId.value) return
  pageLoading.value = true
  try {
    const res = await getPlatformPages(pagePlatformId.value)
    pageList.value = res.data || []
    // 同步更新父级行，使平台列表立即反映变化
    if (pagePlatform.value) {
      pagePlatform.value.pages = pageList.value
    }
  } catch {
    pageList.value = []
  } finally {
    pageLoading.value = false
  }
}

function onPageDialogClosed() {
  // 关闭页面管理弹窗后重新拉取平台列表，确保主表数据一致
  fetchList()
}

function openPageForm(row = null) {
  pageEditingId.value = row?.id || null
  pageForm.page_name = row?.page_name || ''
  pageForm.url = row?.url || ''
  pageFormVisible.value = true
}

async function handlePageSubmit() {
  if (!pageForm.page_name || !pageForm.url) {
    ElMessage.warning('请填写页面名称和URL')
    return
  }
  pageSaving.value = true
  try {
    if (pageEditingId.value) {
      await updatePlatformPage(pageEditingId.value, {
        page_name: pageForm.page_name,
        url: pageForm.url,
      })
      ElMessage.success('修改成功')
    } else {
      await createPlatformPage({
        platform_id: pagePlatformId.value,
        page_name: pageForm.page_name,
        url: pageForm.url,
      })
      ElMessage.success('新增成功')
    }
    pageFormVisible.value = false
    await fetchPages()
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '操作失败')
  } finally {
    pageSaving.value = false
  }
}

async function handlePageDelete(id) {
  try {
    await deletePlatformPage(id)
    ElMessage.success('删除成功')
    await fetchPages()
  } catch {
    ElMessage.error('删除失败')
  }
}

onMounted(fetchList)
</script>

<style scoped>
.toolbar-card :deep(.el-card__body) { padding: 14px 20px; }
.toolbar { display: flex; align-items: center; justify-content: space-between; }
.total-label { color: #606266; font-size: 14px; }
.page-list { display: flex; flex-wrap: wrap; align-items: center; }
.no-pages { color: #c0c4cc; font-size: 12px; }
.action-group { display: flex; flex-wrap: wrap; gap: 2px; }
</style>
