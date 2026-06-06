<template>
  <div>
    <el-card shadow="never" class="toolbar-card">
      <div class="toolbar">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索企业名/联系人"
          clearable
          style="width:240px"
          :prefix-icon="Search"
          @input="handleSearch"
        />
        <el-button type="primary" :icon="Plus" @click="openDialog()">新增租户</el-button>
      </div>
    </el-card>

    <el-card shadow="never" style="margin-top:16px">
      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column prop="id"       label="ID"     width="60" />
        <el-table-column prop="name"     label="企业名称" min-width="160" />
        <el-table-column prop="contact"  label="联系人/电话" min-width="140" />
        <el-table-column prop="user_count" label="员工数" width="80" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">
              {{ row.status === 1 ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="expire_at" label="到期时间" width="160">
          <template #default="{ row }">{{ row.expire_at ? row.expire_at.slice(0,10) : '永久' }}</template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="160">
          <template #default="{ row }">{{ row.created_at?.slice(0,16) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openDialog(row)">编辑</el-button>
            <el-popconfirm title="确定删除该租户吗？" @confirm="handleDelete(row.id)">
              <template #reference>
                <el-button type="danger" link size="small">删除</el-button>
              </template>
            </el-popconfirm>
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

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑租户' : '新增租户'" width="460px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="企业名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入企业名称" />
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="form.contact" placeholder="联系人/电话" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="form.status" style="width:100%">
            <el-option label="启用" :value="1" />
            <el-option label="停用" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item label="到期时间">
          <el-date-picker v-model="form.expire_at" type="datetime" placeholder="留空表示永久"
            style="width:100%" value-format="YYYY-MM-DD HH:mm:ss" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import { getTenantList, createTenant, updateTenant, deleteTenant } from '../api/tenants'

const loading    = ref(false)
const submitting = ref(false)
const tableData  = ref([])
const total      = ref(0)
const page       = ref(1)
const pageSize   = ref(20)
const searchKeyword = ref('')

const dialogVisible = ref(false)
const editingId     = ref(null)
const formRef       = ref(null)
const form = reactive({ name: '', contact: '', status: 1, expire_at: null, remark: '' })

const rules = { name: [{ required: true, message: '请输入企业名称', trigger: 'blur' }] }

let searchTimer = null
function handleSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; fetchList() }, 400)
}

async function fetchList() {
  loading.value = true
  try {
    const res = await getTenantList({ page: page.value, size: pageSize.value, keyword: searchKeyword.value })
    tableData.value = res.data.list
    total.value     = res.data.total
  } finally {
    loading.value = false
  }
}

function openDialog(row = null) {
  editingId.value = row?.id || null
  Object.assign(form, {
    name:      row?.name      || '',
    contact:   row?.contact   || '',
    status:    row?.status    ?? 1,
    expire_at: row?.expire_at || null,
    remark:    row?.remark    || '',
  })
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    const payload = { ...form }
    if (editingId.value) await updateTenant(editingId.value, payload)
    else await createTenant(payload)
    ElMessage.success(editingId.value ? '修改成功' : '创建成功')
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
    await deleteTenant(id)
    ElMessage.success('删除成功')
    fetchList()
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '删除失败')
  }
}

onMounted(fetchList)
</script>

<style scoped>
.toolbar-card :deep(.el-card__body) { padding: 14px 20px; }
.toolbar { display: flex; align-items: center; gap: 12px; }
.pagination { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
