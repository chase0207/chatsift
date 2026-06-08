<template>
  <div>
    <el-card shadow="never">
      <div class="bar">
        <div class="hint">客服账号采集到消息后自动出现（待确认）。一个账号同一时间只有一个采集负责人；查看权可分配给多人。</div>
        <el-radio-group v-model="lifecycleFilter" size="small" @change="fetchList">
          <el-radio-button label="">全部</el-radio-button>
          <el-radio-button label="pending">待确认<el-badge v-if="pendingCount" :value="pendingCount" class="badge" /></el-radio-button>
          <el-radio-button label="active">已启用</el-radio-button>
          <el-radio-button label="disabled">已停用</el-radio-button>
        </el-radio-group>
      </div>

      <el-table :data="filteredData" v-loading="loading" stripe>
        <el-table-column prop="id" label="ID" width="56" />
        <el-table-column prop="account_biz_id" label="商家账号ID" min-width="150" show-overflow-tooltip />
        <el-table-column prop="account_nickname" label="坐席昵称" min-width="110" show-overflow-tooltip />
        <el-table-column label="平台/页面" min-width="150">
          <template #default="{ row }">{{ row.platform_name || '-' }} / {{ row.page_name || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="lcType(row.lifecycle)" size="small">{{ lcLabel(row.lifecycle) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="采集负责人" min-width="120">
          <template #default="{ row }">
            <template v-if="row.collector_name">
              {{ row.collector_name }}
              <el-tag size="small" :type="row.collector_kind === 'formal' ? 'success' : 'warning'">
                {{ row.collector_kind === 'formal' ? '正式' : '临时' }}
              </el-tag>
            </template>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="view_count" label="查看人" width="76" />
        <el-table-column label="首次发现" min-width="150">
          <template #default="{ row }">
            <div>{{ row.first_seen_by_name || '-' }}</div>
            <div class="muted">{{ row.first_seen_at?.slice(0, 16) || '' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="最近采集" width="150">
          <template #default="{ row }">{{ row.last_collect_at?.slice(0, 16) || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="{ row }">
            <template v-if="row.lifecycle === 'pending'">
              <el-button type="primary" link size="small" @click="openConfirm(row)">确认</el-button>
              <el-button type="danger" link size="small" @click="doDisable(row)">停用</el-button>
            </template>
            <template v-else-if="row.lifecycle === 'active'">
              <el-button type="primary" link size="small" @click="openCollector(row)">采集人</el-button>
              <el-button link size="small" @click="openViews(row)">查看人</el-button>
              <el-button type="danger" link size="small" @click="doDisable(row)">停用</el-button>
            </template>
            <template v-else>
              <el-button type="success" link size="small" @click="doEnable(row)">恢复</el-button>
            </template>
          </template>
        </el-table-column>
        <template #empty>暂无客服账号（采集到消息后自动出现）</template>
      </el-table>
    </el-card>

    <!-- 确认待确认账号 -->
    <el-dialog v-model="confirmVisible" :title="`确认账号 · ${current?.account_nickname || ''}`" width="460px" destroy-on-close>
      <div v-loading="dlgLoading">
        <el-form label-width="84px">
          <el-form-item label="采集负责人">
            <el-select v-model="form.collectorId" placeholder="选择采集负责人" style="width: 100%">
              <el-option v-for="e in employees" :key="e.id" :label="`${e.username}（${e.role_name || ''}）`" :value="e.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="查看人">
            <el-checkbox-group v-model="form.viewerIds">
              <el-checkbox v-for="e in agents" :key="e.id" :value="e.id">{{ e.username }}</el-checkbox>
            </el-checkbox-group>
            <span v-if="!agents.length" class="muted">本租户暂无客服</span>
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="confirmVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveConfirm">确认并启用</el-button>
      </template>
    </el-dialog>

    <!-- 重分配采集人 -->
    <el-dialog v-model="collectorVisible" :title="`采集负责人 · ${current?.account_nickname || ''}`" width="420px" destroy-on-close>
      <div v-loading="dlgLoading">
        <el-select v-model="form.collectorId" placeholder="选择采集负责人" style="width: 100%">
          <el-option v-for="e in employees" :key="e.id" :label="`${e.username}（${e.role_name || ''}）`" :value="e.id" />
        </el-select>
        <div class="muted tip">采集负责人变更后，原负责人插件继续采集将被拒绝。</div>
      </div>
      <template #footer>
        <el-button @click="collectorVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveCollector">保存</el-button>
      </template>
    </el-dialog>

    <!-- 查看人 -->
    <el-dialog v-model="viewsVisible" :title="`查看人 · ${current?.account_nickname || ''}`" width="420px" destroy-on-close>
      <div v-loading="dlgLoading">
        <el-empty v-if="!agents.length" description="该租户暂无客服" />
        <el-checkbox-group v-else v-model="form.viewerIds">
          <div v-for="e in agents" :key="e.id" class="emp-row">
            <el-checkbox :value="e.id">{{ e.username }}</el-checkbox>
          </div>
        </el-checkbox-group>
        <div class="muted tip">查看人只能查看该账号数据，不能采集。</div>
      </div>
      <template #footer>
        <el-button @click="viewsVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveViews">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getServiceAccountList, getTenantEmployees, getAssignments,
  assignEmployee, unassignEmployee, confirmAccount, setCollector,
  disableAccount, enableAccount,
} from '../api/serviceAccounts'

const loading = ref(false)
const tableData = ref([])
const lifecycleFilter = ref('')

const confirmVisible = ref(false)
const collectorVisible = ref(false)
const viewsVisible = ref(false)
const dlgLoading = ref(false)
const saving = ref(false)
const current = ref(null)
const employees = ref([])
const form = ref({ collectorId: null, viewerIds: [] })
let originalViewerIds = []

const agents = computed(() => employees.value.filter((e) => e.role_code === 'agent'))
const filteredData = computed(() =>
  lifecycleFilter.value ? tableData.value.filter((r) => r.lifecycle === lifecycleFilter.value) : tableData.value
)
const pendingCount = computed(() => tableData.value.filter((r) => r.lifecycle === 'pending').length)

const lcType = (lc) => (lc === 'active' ? 'success' : lc === 'disabled' ? 'info' : 'warning')
const lcLabel = (lc) => (lc === 'active' ? '已启用' : lc === 'disabled' ? '已停用' : '待确认')

async function fetchList() {
  loading.value = true
  try {
    const res = await getServiceAccountList({ page: 1, size: 100 })
    tableData.value = res.data.list
  } finally {
    loading.value = false
  }
}

async function loadEmployees(row) {
  if (!employees.value.length) {
    const res = await getTenantEmployees(row.tenant_id)
    employees.value = res.data || []
  }
}

async function openConfirm(row) {
  current.value = row
  confirmVisible.value = true
  dlgLoading.value = true
  try {
    await loadEmployees(row)
    form.value = { collectorId: row.collector_id || null, viewerIds: [] }
  } finally {
    dlgLoading.value = false
  }
}

async function saveConfirm() {
  if (!form.value.collectorId) return ElMessage.warning('请选择采集负责人')
  saving.value = true
  try {
    await confirmAccount(current.value.id, { collector_id: form.value.collectorId, viewer_ids: form.value.viewerIds })
    ElMessage.success('已确认并启用')
    confirmVisible.value = false
    fetchList()
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '确认失败')
  } finally {
    saving.value = false
  }
}

async function openCollector(row) {
  current.value = row
  collectorVisible.value = true
  dlgLoading.value = true
  try {
    await loadEmployees(row)
    form.value = { collectorId: row.collector_id || null, viewerIds: [] }
  } finally {
    dlgLoading.value = false
  }
}

async function saveCollector() {
  if (!form.value.collectorId) return ElMessage.warning('请选择采集负责人')
  saving.value = true
  try {
    await setCollector(current.value.id, form.value.collectorId)
    ElMessage.success('采集负责人已更新')
    collectorVisible.value = false
    fetchList()
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function openViews(row) {
  current.value = row
  viewsVisible.value = true
  dlgLoading.value = true
  try {
    await loadEmployees(row)
    const asg = await getAssignments(row.id)
    originalViewerIds = (asg.data || []).slice()
    form.value = { collectorId: null, viewerIds: originalViewerIds.slice() }
  } finally {
    dlgLoading.value = false
  }
}

async function saveViews() {
  saving.value = true
  try {
    const toAdd = form.value.viewerIds.filter((id) => !originalViewerIds.includes(id))
    const toRemove = originalViewerIds.filter((id) => !form.value.viewerIds.includes(id))
    for (const id of toAdd) await assignEmployee(current.value.id, id)
    for (const id of toRemove) await unassignEmployee(current.value.id, id)
    ElMessage.success('查看人已保存')
    viewsVisible.value = false
    fetchList()
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function doDisable(row) {
  await ElMessageBox.confirm(`停用「${row.account_nickname}」后将冻结采集，历史数据保留。`, '停用账号', { type: 'warning' })
  try {
    await disableAccount(row.id)
    ElMessage.success('已停用')
    fetchList()
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '停用失败')
  }
}

async function doEnable(row) {
  try {
    await enableAccount(row.id)
    ElMessage.success('已恢复')
    fetchList()
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '恢复失败')
  }
}

onMounted(fetchList)
</script>

<style scoped>
.bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 12px; flex-wrap: wrap; }
.hint { color: #909399; font-size: 13px; }
.muted { color: #909399; font-size: 12px; }
.tip { margin-top: 10px; }
.emp-row { padding: 6px 0; }
.badge { margin-left: 6px; }
</style>
