<template>
  <div>
    <el-card shadow="never" class="toolbar-card">
      <div class="toolbar">
        <span class="lbl">租户</span>
        <el-select v-model="tenantId" placeholder="选择租户" style="width:240px" @change="fetchList">
          <el-option v-for="t in tenants" :key="t.id" :label="t.name" :value="t.id" />
        </el-select>
      </div>
    </el-card>

    <el-card shadow="never" style="margin-top:16px">
      <el-table :data="tableData" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="account_biz_id" label="商家账号ID" min-width="160" />
        <el-table-column prop="account_nickname" label="坐席昵称" min-width="120" />
        <el-table-column label="平台/页面" min-width="160">
          <template #default="{ row }">{{ row.platform_name || '-' }} / {{ row.page_name || '-' }}</template>
        </el-table-column>
        <el-table-column prop="assigned_count" label="已分配员工" width="100" />
        <el-table-column prop="first_seen_at" label="首次出现" width="160">
          <template #default="{ row }">{{ row.first_seen_at?.slice(0,16) || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openAssign(row)">分配</el-button>
          </template>
        </el-table-column>
        <template #empty>{{ tenantId ? '该租户暂无客服账号（采集后自动出现）' : '请先选择租户' }}</template>
      </el-table>
    </el-card>

    <el-dialog v-model="assignVisible" :title="`分配客服账号 · ${current?.account_nickname || ''}`" width="420px" destroy-on-close>
      <div v-loading="assignLoading">
        <el-empty v-if="!employees.length" description="该租户暂无员工" />
        <el-checkbox-group v-else v-model="checkedIds">
          <div v-for="e in employees" :key="e.id" class="emp-row">
            <el-checkbox :value="e.id">
              {{ e.username }} <el-tag size="small" type="info">{{ e.role_name || '-' }}</el-tag>
            </el-checkbox>
          </div>
        </el-checkbox-group>
      </div>
      <template #footer>
        <el-button @click="assignVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveAssign">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getTenantOptions } from '../api/tenants'
import { getServiceAccountList, getTenantEmployees, getAssignments, assignEmployee, unassignEmployee } from '../api/serviceAccounts'

const tenants  = ref([])
const tenantId = ref(null)
const loading  = ref(false)
const tableData = ref([])

const assignVisible = ref(false)
const assignLoading = ref(false)
const saving = ref(false)
const current = ref(null)
const employees = ref([])
const checkedIds = ref([])
let originalIds = []

async function fetchList() {
  if (!tenantId.value) { tableData.value = []; return }
  loading.value = true
  try {
    const res = await getServiceAccountList({ tenant_id: tenantId.value, page: 1, size: 100 })
    tableData.value = res.data.list
  } finally {
    loading.value = false
  }
}

async function openAssign(row) {
  current.value = row
  assignVisible.value = true
  assignLoading.value = true
  try {
    const [empRes, asgRes] = await Promise.all([
      getTenantEmployees(row.tenant_id),
      getAssignments(row.id),
    ])
    employees.value = empRes.data || []
    originalIds = (asgRes.data || []).slice()
    checkedIds.value = originalIds.slice()
  } finally {
    assignLoading.value = false
  }
}

async function saveAssign() {
  saving.value = true
  try {
    const toAdd = checkedIds.value.filter((id) => !originalIds.includes(id))
    const toRemove = originalIds.filter((id) => !checkedIds.value.includes(id))
    for (const id of toAdd) await assignEmployee(current.value.id, id)
    for (const id of toRemove) await unassignEmployee(current.value.id, id)
    ElMessage.success('保存成功')
    assignVisible.value = false
    fetchList()
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    const res = await getTenantOptions()
    tenants.value = res.data || []
    if (tenants.value.length) { tenantId.value = tenants.value[0].id; fetchList() }
  } catch (e) { /* ignore */ }
})
</script>

<style scoped>
.toolbar-card :deep(.el-card__body) { padding: 14px 20px; }
.toolbar { display: flex; align-items: center; gap: 12px; }
.lbl { color: #606266; font-size: 14px; }
.emp-row { padding: 6px 0; }
</style>
