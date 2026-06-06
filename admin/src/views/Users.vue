<template>
  <div>
    <!-- 顶部操作栏 -->
    <el-card shadow="never" class="toolbar-card">
      <div class="toolbar">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索用户名"
          clearable
          style="width:240px"
          :prefix-icon="Search"
          @input="handleSearch"
        />
        <el-button type="primary" :icon="Plus" @click="openDialog()">新增用户</el-button>
      </div>
    </el-card>

    <!-- 表格 -->
    <el-card shadow="never" style="margin-top:16px">
      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column prop="id"       label="ID"   width="60" />
        <el-table-column prop="username" label="用户名" min-width="120" />
        <el-table-column label="角色" width="100">
          <template #default="{ row }">
            <el-tag :type="row.user_type === 'internal' ? 'danger' : 'info'" size="small">
              {{ row.role_name || '-' }}<span v-if="row.user_type==='external'" style="opacity:.6"> · 租户{{ row.tenant_id ?? '-' }}</span>
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">
              {{ row.status === 1 ? '正常' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="expire_at" label="到期时间" width="160">
          <template #default="{ row }">
            {{ row.expire_at ? row.expire_at.replace('T', ' ').slice(0,19) : '永久' }}
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="160">
          <template #default="{ row }">
            {{ row.created_at?.replace('T', ' ').slice(0,19) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openDialog(row)">编辑</el-button>
            <el-popconfirm title="确定删除该用户吗？" @confirm="handleDelete(row.id)">
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

    <!-- 新增/编辑 Dialog -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑用户' : '新增用户'"
      width="460px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" :disabled="!!editingId" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" show-password
            :placeholder="editingId ? '留空则不修改密码' : '请输入密码'" />
        </el-form-item>
        <el-form-item label="角色" prop="role_id">
          <el-select v-model="form.role_id" style="width:100%" :placeholder="isPlatform ? '选择平台角色' : '选择租户角色'">
            <el-option v-for="r in roles" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-select v-model="form.status" style="width:100%">
            <el-option label="正常" :value="1" />
            <el-option label="禁用" :value="0" />
          </el-select>
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
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Search, Plus } from '@element-plus/icons-vue'
import { getUserList, createUser, updateUser, deleteUser } from '../api/users'
import { getRoleOptions } from '../api/roles'
import { entryMode } from '../utils/entry'

// W19-C2:按端固定身份。平台入口=建内部用户(平台角色);租户入口=建租户用户(租户角色)
// 角色下拉由 /roles/options 按调用者作用域返回(平台→平台角色,租户→租户角色),前端无需再筛
const isPlatform = entryMode() !== 'tenant'
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

const form = reactive({ username: '', password: '', role_id: null, status: 1, expire_at: null, user_type: 'external' })
const roles = ref([])

const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [
    {
      validator(_, value, cb) {
        if (!editingId.value && !value) cb(new Error('请输入密码'))
        else cb()
      },
      trigger: 'blur',
    },
  ],
}

let searchTimer = null
function handleSearch() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; fetchList() }, 400)
}

async function fetchList() {
  loading.value = true
  try {
    const res = await getUserList({ page: page.value, size: pageSize.value, keyword: searchKeyword.value })
    tableData.value = res.data.list
    total.value     = res.data.total
  } finally {
    loading.value = false
  }
}

function openDialog(row = null) {
  editingId.value = row?.id || null
  Object.assign(form, {
    username:  row?.username  || '',
    password:  '',
    role_id:   row?.role_id   ?? null,
    status:    row?.status    ?? 1,
    expire_at: row?.expire_at || null,
    // 按端固定:平台入口=internal,租户入口=external(后端最终以创建者身份为准)
    user_type: row?.user_type || (isPlatform ? 'internal' : 'external'),
  })
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  submitting.value = true
  try {
    const payload = { ...form }
    if (editingId.value && !payload.password) delete payload.password
    if (editingId.value) {
      await updateUser(editingId.value, payload)
    } else {
      await createUser(payload)
    }
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
    await deleteUser(id)
    ElMessage.success('删除成功')
    fetchList()
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '删除失败')
  }
}

onMounted(() => {
  fetchList()
  getRoleOptions().then(res => { roles.value = res.data || [] }).catch(() => {})
})
</script>

<style scoped>
.toolbar-card :deep(.el-card__body) { padding: 14px 20px; }
.toolbar { display: flex; align-items: center; gap: 12px; }
.pagination { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>
