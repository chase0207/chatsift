<template>
  <div>
    <el-card shadow="never" class="filter-card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">角色管理</h3>
        <el-button type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon> 新增角色
        </el-button>
      </div>
    </el-card>

    <el-card shadow="never" style="margin-top:12px">
      <el-table :data="roles" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="name" label="角色名称" min-width="120" />
        <el-table-column prop="description" label="描述" min-width="160" />
        <el-table-column prop="user_count" label="用户数" width="70" />
        <el-table-column label="数据范围" width="110">
          <template #default="{ row }">
            <el-tag v-if="row.data_scope === 'all'" type="warning" size="small">全部数据</el-tag>
            <el-tag v-else-if="row.data_scope === 'dept'" type="info" size="small">本部门</el-tag>
            <el-tag v-else size="small">仅本人</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.is_super" type="danger" size="small">超级管理员</el-tag>
            <el-tag v-else type="info" size="small">普通角色</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openEdit(row)">编辑</el-button>
            <el-button type="primary" link size="small" @click="openPermissions(row)">权限</el-button>
            <el-button type="danger" link size="small" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑角色弹窗 -->
    <el-dialog v-model="formVisible" :title="isEdit ? '编辑角色' : '新增角色'" width="420px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="角色名称">
          <el-input v-model="form.name" placeholder="请输入角色名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" placeholder="角色描述（可选）" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="数据范围">
          <el-select v-model="form.data_scope" style="width:100%">
            <el-option label="仅本人数据" value="self" />
            <el-option label="本部门数据（占位，暂不实现）" value="dept" disabled />
            <el-option label="全部数据" value="all" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 权限分配弹窗 -->
    <el-dialog v-model="permVisible" title="分配权限" width="520px">
      <el-tree
        ref="permTreeRef"
        :data="menuTree"
        show-checkbox
        node-key="id"
        :props="{ label: 'name', children: 'children' }"
        default-expand-all
      >
        <template #default="{ data }">
          <span>
            <el-tag v-if="data.type === 'button'" type="warning" size="small" style="margin-right:4px;scale:0.85">按钮</el-tag>
            {{ data.name }}
          </span>
        </template>
      </el-tree>
      <template #footer>
        <el-button @click="permVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSavePermissions">保存权限</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { getRoleList, createRole, updateRole, deleteRole, getRolePermissions, setRolePermissions } from '../api/roles'
import { getMenuTreeWithButtons } from '../api/menus'

var roles = ref([])
var loading = ref(false)
var formVisible = ref(false)
var isEdit = ref(false)
var editingId = ref(null)
var form = ref({ name: '', description: '', data_scope: 'self' })

var permVisible = ref(false)
var permRoleId = ref(null)
var menuTree = ref([])
var permTreeRef = ref(null)

onMounted(function () {
  fetchRoles()
  loadMenuTree()
})

async function fetchRoles() {
  loading.value = true
  try {
    var res = await getRoleList()
    roles.value = res.data || []
  } finally {
    loading.value = false
  }
}

async function loadMenuTree() {
  try {
    var res = await getMenuTreeWithButtons()
    menuTree.value = res.data || []
  } catch {}
}

function openCreate() {
  isEdit.value = false
  editingId.value = null
  form.value = { name: '', description: '', data_scope: 'self' }
  formVisible.value = true
}

function openEdit(row) {
  isEdit.value = true
  editingId.value = row.id
  form.value = { name: row.name, description: row.description || '', data_scope: row.data_scope || 'self' }
  formVisible.value = true
}

async function handleSave() {
  if (!form.value.name) {
    ElMessage.warning('请输入角色名称')
    return
  }
  try {
    if (isEdit.value) {
      await updateRole(editingId.value, form.value)
      ElMessage.success('已更新')
    } else {
      await createRole(form.value)
      ElMessage.success('已创建')
    }
    formVisible.value = false
    fetchRoles()
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '操作失败')
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm('确定要删除角色"' + row.name + '"吗？', '提示', { type: 'warning' })
    await deleteRole(row.id)
    ElMessage.success('已删除')
    fetchRoles()
  } catch (err) {
    if (err?.response?.data?.message) ElMessage.error(err.response.data.message)
  }
}

async function openPermissions(row) {
  permRoleId.value = row.id
  permVisible.value = true
  await nextTick()
  try {
    var res = await getRolePermissions(row.id)
    if (res.code === 0 && permTreeRef.value) {
      permTreeRef.value.setCheckedKeys(res.data || [])
    }
  } catch {}
}

async function handleSavePermissions() {
  if (!permTreeRef.value || !permRoleId.value) return
  // 标准 el-tree 权限保存:勾选节点 + 半选父节点(分组),精确反映勾选,不展开未勾选后代
  var menuIds = permTreeRef.value.getCheckedKeys(false).concat(permTreeRef.value.getHalfCheckedKeys())
  try {
    await setRolePermissions(permRoleId.value, menuIds)
    ElMessage.success('权限已保存')
    permVisible.value = false
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '保存失败')
  }
}

function nextTick() {
  return new Promise(function (resolve) { setTimeout(resolve, 50) })
}
</script>

<style scoped>
.filter-card :deep(.el-card__body) { padding: 16px 20px; }
</style>
