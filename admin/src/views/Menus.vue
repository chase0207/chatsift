<template>
  <div>
    <el-card shadow="never" class="filter-card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">菜单管理</h3>
        <el-button type="primary" @click="openCreate(null)">
          <el-icon><Plus /></el-icon> 新增菜单
        </el-button>
      </div>
    </el-card>

    <el-card shadow="never" style="margin-top:12px">
      <el-table :data="flatMenus" v-loading="loading" stripe row-key="id" :tree-props="{ children: 'children' }" :expand-row-keys="defaultExpandKeys">
        <el-table-column label="名称" min-width="120">
          <template #default="{ row }">
            <el-icon style="margin-right:6px;vertical-align:-2px"><component :is="iconComp(row.icon)" /></el-icon>
            {{ row.name }}
          </template>
        </el-table-column>
        <el-table-column label="类型" width="80">
          <template #default="{ row }">
            <el-tag v-if="row.type === 'button'" type="warning" size="small">按钮</el-tag>
            <el-tag v-else type="success" size="small">菜单</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="route" label="路由" width="150" />
        <el-table-column prop="permission_code" label="权限编码" width="160" />
        <el-table-column prop="sort_order" label="排序" width="60" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status ? 'success' : 'info'" size="small">{{ row.status ? '显示' : '隐藏' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <template v-if="row.type !== 'button'">
              <el-button type="primary" link size="small" @click="openCreate(row)">+子菜单</el-button>
            </template>
            <el-button type="primary" link size="small" @click="openEdit(row)">编辑</el-button>
            <template v-if="row.type !== 'button'">
              <el-button type="danger" link size="small" @click="handleDelete(row)">删除</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog v-model="formVisible" :title="isEdit ? '编辑菜单' : '新增菜单'" width="500px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="菜单名称">
          <el-input v-model="form.name" placeholder="控制台" />
        </el-form-item>
        <el-form-item label="类型">
          <el-tag v-if="form.type === 'button'" type="warning">按钮权限节点</el-tag>
          <el-tag v-else type="success">菜单节点</el-tag>
          <span style="margin-left:8px;color:#909399;font-size:12px">类型不可修改</span>
        </el-form-item>
        <el-form-item label="上级菜单">
          <el-select v-model="form.parent_id" clearable placeholder="顶级菜单" style="width:100%">
            <el-option label="顶级菜单" :value="null" />
            <el-option v-for="p in parentOptions" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="图标">
          <el-input v-model="form.icon" placeholder="House">
            <template #append>
              <el-icon v-if="form.icon" style="font-size:18px"><component :is="iconComp(form.icon)" /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        <template v-if="form.type !== 'button'">
          <el-form-item label="路由">
            <el-input v-model="form.route" placeholder="/users" />
          </el-form-item>
          <el-form-item label="组件">
            <el-input v-model="form.component" placeholder="Users" />
          </el-form-item>
        </template>
        <el-form-item label="权限编码">
          <el-input v-model="form.permission_code" placeholder="user:list" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sort_order" :min="0" style="width:100%" />
        </el-form-item>
        <el-form-item label="状态">
          <el-switch v-model="form.status" :active-value="1" :inactive-value="0" active-text="显示" inactive-text="隐藏" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, House, User, Connection, Monitor, Document, Files, Grid, ChatLineSquare, ChatDotRound, Key, Menu as MenuIcon, Reading, Setting } from '@element-plus/icons-vue'
import { getMenuList, createMenu, updateMenu, deleteMenu } from '../api/menus'

var iconComponents = { House, User, Connection, Monitor, Document, Files, Grid, ChatLineSquare, ChatDotRound, Key, Menu: MenuIcon, Reading, Setting }

function iconComp(name) {
  return iconComponents[name] || House
}

var flatMenus = ref([])
var loading = ref(false)
var formVisible = ref(false)
var isEdit = ref(false)
var editingId = ref(null)
var form = ref({
  parent_id: null, name: '', icon: '', route: '', component: '', type: 'menu',
  permission_code: '', sort_order: 0, status: 1,
})
var allMenus = ref([])

var parentOptions = computed(function () {
  return allMenus.value.filter(function (m) { return !m.parent_id && m.id !== editingId.value && m.type !== 'button' })
})

var defaultExpandKeys = computed(function () {
  return allMenus.value.filter(function (m) { return !m.parent_id }).map(function (m) { return m.id })
})

onMounted(fetchMenus)

async function fetchMenus() {
  loading.value = true
  try {
    var res = await getMenuList()
    allMenus.value = res.data || []
    flatMenus.value = buildTree(res.data || [])
  } finally {
    loading.value = false
  }
}

function buildTree(flat) {
  var map = {}
  var roots = []
  flat.forEach(function (item) {
    item.children = []
    item._depth = 0
    map[item.id] = item
  })
  flat.forEach(function (item) {
    if (item.parent_id && map[item.parent_id]) {
      map[item.parent_id].children.push(item)
      item._depth = (map[item.parent_id]._depth || 0) + 1
    } else if (!item.parent_id) {
      roots.push(item)
    }
  })
  return roots
}

function openCreate(parent) {
  isEdit.value = false
  editingId.value = null
  form.value = { parent_id: parent ? parent.id : null, name: '', icon: '', route: '', component: '', type: 'menu', permission_code: '', sort_order: 0, status: 1 }
  formVisible.value = true
}

function openEdit(row) {
  isEdit.value = true
  editingId.value = row.id
  form.value = {
    parent_id: row.parent_id,
    name: row.name,
    icon: row.icon || '',
    route: row.route || '',
    component: row.component || '',
    type: row.type || 'menu',
    permission_code: row.permission_code,
    sort_order: row.sort_order,
    status: row.status,
  }
  formVisible.value = true
}

async function handleSave() {
  if (!form.value.name || !form.value.permission_code) {
    ElMessage.warning('名称和权限编码不能为空')
    return
  }
  try {
    if (isEdit.value) {
      await updateMenu(editingId.value, form.value)
      ElMessage.success('已更新')
    } else {
      await createMenu(form.value)
      ElMessage.success('已创建')
    }
    formVisible.value = false
    fetchMenus()
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '操作失败')
  }
}

async function handleDelete(row) {
  try {
    await ElMessageBox.confirm('确定要删除菜单"' + row.name + '"吗？子菜单将一并删除', '提示', { type: 'warning' })
    var res = await deleteMenu(row.id)
    ElMessage.success('已删除' + (res.data?.deleted ? '（含' + res.data.deleted + '项）' : ''))
    fetchMenus()
  } catch (err) {
    if (err?.response?.data?.message) ElMessage.error(err.response.data.message)
  }
}
</script>

<style scoped>
.filter-card :deep(.el-card__body) { padding: 16px 20px; }
</style>
