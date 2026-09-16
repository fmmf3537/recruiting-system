<template>
  <div class="audit-page">
    <div class="page-header"><div><h2 class="page-title">操作审计</h2><span class="page-subtitle">管理员可查询敏感数据与权限变更记录</span></div><el-button @click="fetchList">刷新</el-button></div>
    <el-card shadow="never" class="filter-card"><el-form inline @submit.prevent><el-form-item label="关键词"><el-input v-model="filters.keyword" placeholder="成员姓名或邮箱" clearable /></el-form-item><el-form-item label="操作"><el-select v-model="filters.action" clearable placeholder="全部操作"><el-option v-for="item in actions" :key="item" :label="item" :value="item" /></el-select></el-form-item><el-form-item><el-button type="primary" @click="handleSearch">查询</el-button><el-button @click="handleReset">重置</el-button></el-form-item></el-form></el-card>
    <el-card shadow="never" v-loading="loading"><el-table :data="list" stripe><el-table-column prop="createdAt" label="时间" width="180" /><el-table-column label="成员" width="180"><template #default="{ row }">{{ row.user?.name || '系统' }}<div class="sub">{{ row.user?.email }}</div></template></el-table-column><el-table-column prop="action" label="操作" width="180" /><el-table-column prop="targetType" label="对象类型" width="120" /><el-table-column prop="targetId" label="对象" min-width="180" show-overflow-tooltip /><el-table-column label="详情" min-width="220"><template #default="{ row }">{{ formatDetail(row.detail) }}</template></el-table-column></el-table><el-empty v-if="!loading && !list.length" description="暂无审计记录" /><div class="pagination-wrapper"><el-pagination v-model:current-page="pagination.page" :page-size="pagination.pageSize" :total="pagination.total" layout="total, prev, pager, next" @current-change="fetchList" /></div></el-card>
  </div>
</template>
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { getAuditLogs, type AuditLogItem } from '@/api/audit-log';
const list = ref<AuditLogItem[]>([]); const loading = ref(false); const actions = ['resume_view', 'resume_download', 'offer_approved', 'offer_rejected', 'candidate_anonymized', 'updated', 'deleted'];
const filters = reactive({ keyword: '', action: '' }); const pagination = reactive({ page: 1, pageSize: 20, total: 0, totalPages: 0 });
async function fetchList() { loading.value = true; try { const res = await getAuditLogs({ page: pagination.page, pageSize: pagination.pageSize, keyword: filters.keyword || undefined, action: filters.action || undefined }); if (res.success) { list.value = res.data; Object.assign(pagination, res.pagination); } } catch (e: any) { ElMessage.error(e.message || '加载审计记录失败'); } finally { loading.value = false; } }
function handleSearch() { pagination.page = 1; fetchList(); } function handleReset() { filters.keyword = ''; filters.action = ''; handleSearch(); }
function formatDetail(detail: unknown) { if (!detail) return '-'; try { return JSON.stringify(detail); } catch { return '-'; } }
onMounted(fetchList);
</script>
<style scoped lang="scss">.audit-page{padding:20px}.page-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}.page-title{margin:0;font-size:24px;font-weight:500}.page-subtitle{display:block;color:$ui-gray-500;font-size:$ui-font-md;margin-top:6px}.filter-card{margin-bottom:20px}.sub{font-size:12px;color:$ui-gray-500}.pagination-wrapper{display:flex;justify-content:flex-end;margin-top:20px}</style>
