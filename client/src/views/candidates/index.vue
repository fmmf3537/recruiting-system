<template>
  <div class="candidates-page">
    <!-- 页面标题栏 -->
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">候选人管理</h2>
        <span class="page-subtitle">共 {{ pagination.total }} 位候选人</span>
      </div>
      <div class="action-buttons">
        <el-button @click="showResumeUpload = true">
          <el-icon><Upload /></el-icon>上传简历
        </el-button>
        <el-button type="primary" @click="handleAdd">
          <el-icon><Plus /></el-icon>新增候选人
        </el-button>
      </div>
    </div>

    <div class="candidate-views" role="tablist" aria-label="候选人视图">
      <el-button v-for="item in candidateViews" :key="item.value" :type="activeView === item.value ? 'primary' : 'default'" plain size="small" @click="changeView(item.value)">
        {{ item.label }}<span v-if="item.value === 'todo' && todoCount" class="view-count">{{ todoCount }}</span>
      </el-button>
    </div>

    <!-- 数据范围提示：member 仅可见与自己相关的候选人 -->
    <el-alert
      v-if="!authStore.isAdmin"
      class="scope-tip"
      type="info"
      :closable="false"
      show-icon
      title="当前仅展示与您相关的候选人（我创建的、指派给我的、本部门职位下的）"
    />

    <!-- 筛选栏 -->
    <el-card class="filter-card" shadow="never">
      <el-form :model="filterForm" inline class="filter-form">
        <el-form-item label="关键词">
          <el-input
            v-model="filterForm.keyword"
            placeholder="姓名/邮箱/手机号"
            clearable
            @keyup.enter="handleSearch"
            style="width: 200px"
          />
        </el-form-item>

        <el-form-item label="招聘阶段">
          <el-select
            v-model="filterForm.stage"
            placeholder="全部阶段"
            clearable
            style="width: 140px"
            @change="handleSearch"
          >
            <el-option label="入库" value="入库" />
            <el-option label="初筛" value="初筛" />
            <el-option label="复试" value="复试" />
            <el-option label="终面" value="终面" />
            <el-option label="拟录用" value="拟录用" />
            <el-option label="Offer" value="Offer" />
            <el-option label="入职" value="入职" />
          </el-select>
        </el-form-item>

        <el-form-item label="状态">
          <el-select
            v-model="filterForm.status"
            placeholder="全部状态"
            clearable
            style="width: 140px"
            @change="handleSearch"
          >
            <el-option label="进行中" value="in_progress" />
            <el-option label="已通过" value="passed" />
            <el-option label="已淘汰" value="rejected" />
          </el-select>
        </el-form-item>

        <el-form-item label="来源">
          <el-select
            v-model="filterForm.source"
            placeholder="全部来源"
            clearable
            style="width: 140px"
            @change="handleSearch"
          >
            <!-- F5-C：常规来源（字典项） -->
            <el-option-group label="常规来源">
              <el-option
                v-for="item in dictionaryStore.sourceOptions"
                :key="item.code"
                :label="item.name"
                :value="item.name"
              />
            </el-option-group>
            <!-- F5-C：猎头渠道（仅 admin / hr 可见，§3.2-2 不发请求则不发请求） -->
            <el-option-group v-if="agencySourceOptions.length" label="猎头渠道">
              <el-option
                v-for="item in agencySourceOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value"
              />
            </el-option-group>
          </el-select>
        </el-form-item>

        <el-form-item label="标签">
          <el-select
            v-model="filterForm.tagIds"
            placeholder="全部标签"
            clearable
            multiple
            collapse-tags
            style="width: 180px"
            @change="handleSearch"
          >
            <el-option
              v-for="item in tagOptions"
              :key="item.id"
              :label="item.name"
              :value="item.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="handleSearch">
            <el-icon><Search /></el-icon>搜索
          </el-button>
          <el-button @click="handleReset">重置</el-button>
          <el-button
            :type="filterForm.hasNoJob ? 'warning' : 'default'"
            @click="filterForm.hasNoJob = !filterForm.hasNoJob; handleSearch()"
          >
            {{ filterForm.hasNoJob ? '✓ 人才库' : '人才库' }}
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 批量操作栏：既有「批量推进 / 批量打标签 / 取消」保留；加入人才库/导出/批量淘汰因无独立接口不新增 -->
    <div
      v-if="selectedCandidates.length > 0"
      :class="uiNewListLayout ? 'batch-bar ui-batch-bar' : 'batch-bar'"
    >
      <span class="batch-info">{{ uiNewListLayout ? '已选' : '已选择' }} {{ selectedCandidates.length }} 位候选人</span>
      <el-button type="primary" size="small" @click="showBatchAdvance">
        <el-icon><Promotion /></el-icon>批量推进
      </el-button>
      <el-button type="warning" size="small" @click="showBatchTag">
        <el-icon><CollectionTag /></el-icon>批量打标签
      </el-button>
      <el-button size="small" @click="clearSelection">{{ uiNewListLayout ? '取消' : '取消选择' }}</el-button>
    </div>

    <!-- 数据表格 -->
    <el-card v-if="!error" class="table-card" shadow="never">
      <TableSkeleton v-if="loading" :row-count="10" />
      <el-table
        v-else
        v-loading="loading"
        ref="tableRef"
        :data="visibleCandidateList"
        stripe
        style="width: 100%"
        @row-click="handleRowClick"
        @selection-change="handleSelectionChange"
        :row-class-name="uiNewListLayout ? uiCandRowClass : undefined"
        highlight-current-row
      >
        <el-table-column type="selection" width="50" align="center" />
        <!-- UI-S2：序号列无 prop 绑定，新布局移除（数据不受影响）；开关关闭时保留 -->
        <el-table-column v-if="!uiNewListLayout" type="index" label="序号" width="70" align="center" />

        <el-table-column prop="name" label="候选人" :min-width="uiNewListLayout ? 200 : 150">
          <template #default="{ row }">
            <!-- UI-S2：头像 + 姓名 + 手机号，解决姓名竖排断行；未授权标识按 Guard 保留 -->
            <div v-if="uiNewListLayout" class="ui-cand-cell">
              <span class="ui-cand-avatar">{{ row.name?.charAt(0) ?? '?' }}</span>
              <span class="ui-cand-meta">
                <span class="ui-cand-name-row">
                  <span class="ui-cand-name">{{ row.name || '未填写' }}</span>
                  <el-tooltip v-if="!row.consentAt" content="尚未记录授权同意，请在详情页补充" placement="top">
                    <el-tag type="danger" size="small" effect="plain" class="consent-tag">未授权</el-tag>
                  </el-tooltip>
                </span>
                <span class="ui-cand-phone">{{ row.phone || '未填写' }}</span>
              </span>
            </div>
            <div v-else class="candidate-info">
              <el-avatar :size="36" :icon="UserFilled" />
              <div class="candidate-detail">
                <div class="candidate-name">
                  {{ row.name }}
                  <!-- 个保法合规：未记录授权同意的候选人醒目标识 -->
                  <el-tooltip content="尚未记录授权同意，请在详情页补充" placement="top">
                    <el-tag v-if="!row.consentAt" type="danger" size="small" effect="plain" class="consent-tag">
                      未授权
                    </el-tag>
                  </el-tooltip>
                </div>
                <div class="candidate-contact">{{ row.phone }}</div>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="currentStage" label="当前阶段" :width="uiNewListLayout ? 110 : 120" align="center">
          <template #default="{ row }">
            <!-- UI-S2：沿用既有阶段取值，仅改 pill 配色 -->
            <span v-if="uiNewListLayout" class="ui-stage-pill" :class="getStagePillClass(row.currentStage)">
              {{ row.currentStage || '未填写' }}
            </span>
            <el-tag v-else :type="getStageType(row.currentStage)" effect="light" class="stage-tag">
              {{ row.currentStage }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column v-if="!uiNewListLayout" prop="stageStatus" label="状态" width="100" align="center">
          <template #default="{ row }">
            <!-- UI-S2：in_progress 视为正常留空；passed/rejected 显示弱化小标 -->
            <span
              v-if="uiNewListLayout && row.stageStatus && row.stageStatus !== 'in_progress'"
              class="ui-status-muted"
            >
              {{ getStatusText(row.stageStatus) }}
            </span>
            <el-tag v-else-if="!uiNewListLayout" :type="getStatusType(row.stageStatus)" size="small">
              {{ getStatusText(row.stageStatus) }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column v-if="uiNewListLayout" label="负责人" width="110" align="center">
          <template #default="{ row }"><span class="ui-placeholder">{{ row.currentAssignee?.name || '未指派' }}</span></template>
        </el-table-column>

        <el-table-column prop="candidateJobs" label="应聘职位" min-width="150">
          <template #default="{ row }">
            <div class="job-tags">
              <el-tag
                v-for="job in row.candidateJobs?.slice(0, 2)"
                :key="job.id"
                size="small"
                type="info"
                class="job-tag"
              >
                {{ job.job?.title || '未知职位' }}
              </el-tag>
              <span v-if="!row.candidateJobs?.length" :class="uiNewListLayout ? 'ui-placeholder' : 'no-job'">
                {{ uiNewListLayout ? '未填写' : '-' }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column v-if="!uiNewListLayout" prop="tags" label="标签" min-width="120">
          <template #default="{ row }">
            <!-- UI-S2：最多 1 个 chip，其余 +N；空则未填写 -->
            <div v-if="uiNewListLayout" class="ui-tag-list">
              <el-tag
                v-if="row.tags?.length"
                size="small"
                :color="row.tags[0].color"
                effect="light"
                class="candidate-tag"
              >
                {{ row.tags[0].name }}
              </el-tag>
              <el-tooltip
                v-if="row.tags?.length > 1"
                :content="row.tags.slice(1).map((t: Tag) => t.name).join('、')"
                placement="top"
              >
                <span class="ui-tag-more">+{{ row.tags.length - 1 }}</span>
              </el-tooltip>
              <span v-if="!row.tags?.length" class="ui-placeholder">未填写</span>
            </div>
            <div v-else class="tag-list">
              <el-tag
                v-for="tag in row.tags?.slice(0, 3)"
                :key="tag.id"
                size="small"
                :color="tag.color"
                effect="light"
                class="candidate-tag"
              >
                {{ tag.name }}
              </el-tag>
              <span v-if="!row.tags?.length" class="no-tag">-</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column v-if="!uiNewListLayout" prop="source" label="来源" width="120" align="center">
          <template v-if="uiNewListLayout" #default="{ row }">
            <span v-if="!row.source" class="ui-placeholder">未填写</span>
            <span v-else>{{ row.source }}</span>
          </template>
        </el-table-column>

        <el-table-column v-if="!uiNewListLayout" prop="education" label="学历" width="100" align="center">
          <template #default="{ row }">
            <!-- UI-S0：空值展示语义化（数据未改动） -->
            <span v-if="!row.education" class="ui-placeholder">未填写</span>
            <span v-else>{{ row.education }}</span>
          </template>
        </el-table-column>

        <!-- UI-S2：入库时间加原生 sortable（当前页排序，不改请求参数） -->
        <el-table-column prop="updatedAt" :label="uiNewListLayout ? '更新时间' : '入库时间'" width="160" :sortable="uiNewListLayout ? true : false">
          <template #default="{ row }">
            {{ formatDate(uiNewListLayout ? row.updatedAt : row.createdAt) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" :width="uiNewListLayout ? 72 : 220" fixed="right">
          <template #default="{ row }">
            <!-- UI-S2：操作收纳，危险操作进下拉并二次确认（功能一个不少） -->
            <template v-if="uiNewListLayout">
              <el-button type="primary" link size="small" @click.stop="handleDetail(row)">详情</el-button>
              <el-dropdown
                v-if="canAdvance(row) || row.stageStatus !== 'rejected' || canDelete(row)"
                trigger="click"
                @command="(cmd: string) => handleRowCommand(cmd, row)"
              >
                <el-button link size="small" @click.stop>⋯</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="canAdvance(row)" command="advance">推进</el-dropdown-item>
                    <el-dropdown-item
                      v-if="row.stageStatus !== 'rejected'"
                      command="reject"
                      :divided="canAdvance(row)"
                    >淘汰</el-dropdown-item>
                    <el-dropdown-item v-if="canDelete(row)" command="delete">删除</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
            <template v-else>
              <el-button type="primary" link size="small" @click.stop="handleDetail(row)">
                详情
              </el-button>
              <el-button v-if="canAdvance(row)" type="success" link size="small" @click.stop="handleAdvance(row)">
                推进
              </el-button>
              <el-button v-if="row.stageStatus !== 'rejected'" type="danger" link size="small" @click.stop="handleReject(row)">
                淘汰
              </el-button>
              <el-button v-if="canDelete(row)" type="danger" link size="small" @click.stop="handleDelete(row)">
                删除
              </el-button>
            </template>
          </template>
        </el-table-column>
        <!-- UI-S2：空态仅在已加载且 0 条时由 el-table #empty 展示（加载中走 TableSkeleton） -->
        <template v-if="uiNewListLayout" #empty>
          <EmptyState type="empty" title="暂无候选人" action-text="上传简历" @action="showResumeUpload = true" />
        </template>
      </el-table>

      <!-- 分页 -->
      <div v-if="!loading" class="pagination-wrapper">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>

    <!-- 加载错误状态 -->
    <div v-if="error && !loading && candidateList.length === 0" class="error-state">
      <el-result icon="error" title="加载失败" sub-title="无法加载候选人列表，请检查网络连接后重试">
        <template #extra>
          <el-button type="primary" @click="fetchCandidateList">重新加载</el-button>
        </template>
      </el-result>
    </div>

    <!-- 推进流程对话框 -->
    <el-dialog v-model="advanceDialogVisible" title="推进候选人流程" width="500px">
      <el-form ref="advanceFormRef" :model="advanceForm" :rules="advanceRules" label-width="100px">
        <el-form-item label="当前阶段">
          <el-tag>{{ currentCandidate?.currentStage }}</el-tag>
        </el-form-item>

        <el-form-item label="目标阶段" prop="stage">
          <el-select v-model="advanceForm.stage" placeholder="请选择目标阶段" style="width: 100%">
            <el-option v-for="stage in availableStages" :key="stage" :label="stage" :value="stage" />
          </el-select>
        </el-form-item>

        <el-form-item label="阶段结果" prop="status">
          <el-radio-group v-model="advanceForm.status">
            <el-radio-button label="in_progress">进行中</el-radio-button>
            <el-radio-button label="passed">通过</el-radio-button>
            <el-radio-button label="rejected">淘汰</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="淘汰原因" prop="rejectReason" v-if="advanceForm.status === 'rejected'">
          <el-input v-model="advanceForm.rejectReason" type="textarea" :rows="3" placeholder="请填写淘汰原因" />
        </el-form-item>

        <el-form-item label="备注" prop="note">
          <el-input v-model="advanceForm.note" type="textarea" :rows="2" placeholder="选填" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="advanceDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleAdvanceSubmit" :loading="advanceSubmitting">确认推进</el-button>
      </template>
    </el-dialog>

    <!-- 淘汰确认对话框 -->
    <el-dialog v-model="rejectDialogVisible" title="淘汰候选人" width="500px">
      <p style="margin-bottom: 20px">确定要淘汰候选人 <strong>{{ currentCandidate?.name }}</strong> 吗？</p>
      <el-form ref="rejectFormRef" :model="rejectForm" :rules="rejectRules" label-width="100px">
        <el-form-item label="淘汰原因" prop="rejectReason">
          <el-input v-model="rejectForm.rejectReason" type="textarea" :rows="3" placeholder="请填写淘汰原因（必填）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectDialogVisible = false">取消</el-button>
        <el-button type="danger" @click="handleRejectSubmit" :loading="rejectSubmitting">确认淘汰</el-button>
      </template>
    </el-dialog>

    <!-- 批量推进对话框 -->
    <el-dialog v-model="batchAdvanceVisible" title="批量推进候选人" width="500px">
      <p style="margin-bottom: 16px">即将对 <strong>{{ selectedCandidates.length }}</strong> 位候选人进行阶段推进</p>
      <el-form ref="batchAdvanceFormRef" :model="batchAdvanceForm" :rules="advanceRules" label-width="100px">
        <el-form-item label="目标阶段" prop="stage">
          <el-select v-model="batchAdvanceForm.stage" placeholder="请选择目标阶段" style="width: 100%">
            <el-option v-for="stage in defaultStages" :key="stage" :label="stage" :value="stage" />
          </el-select>
        </el-form-item>

        <el-form-item label="阶段结果" prop="status">
          <el-radio-group v-model="batchAdvanceForm.status">
            <el-radio-button label="in_progress">进行中</el-radio-button>
            <el-radio-button label="passed">通过</el-radio-button>
            <el-radio-button label="rejected">淘汰</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="淘汰原因" prop="rejectReason" v-if="batchAdvanceForm.status === 'rejected'">
          <el-input v-model="batchAdvanceForm.rejectReason" type="textarea" :rows="3" placeholder="请填写淘汰原因" />
        </el-form-item>

        <el-form-item label="备注" prop="note">
          <el-input v-model="batchAdvanceForm.note" type="textarea" :rows="2" placeholder="选填" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="batchAdvanceVisible = false">取消</el-button>
        <el-button type="primary" @click="handleBatchAdvanceSubmit" :loading="batchAdvanceSubmitting">确认推进</el-button>
      </template>
    </el-dialog>

    <!-- 批量打标签对话框 -->
    <el-dialog v-model="batchTagVisible" title="批量打标签" width="500px">
      <p style="margin-bottom: 16px">即将对 <strong>{{ selectedCandidates.length }}</strong> 位候选人设置标签</p>
      <el-form label-width="80px">
        <el-form-item label="选择标签">
          <el-select
            v-model="batchTagIds"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="请选择或输入标签"
            style="width: 100%"
          >
            <el-option
              v-for="tag in tagOptions"
              :key="tag.id"
              :label="tag.name"
              :value="tag.id"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="batchTagVisible = false">取消</el-button>
        <el-button type="primary" @click="handleBatchTagSubmit" :loading="batchTagSubmitting">确认设置</el-button>
      </template>
    </el-dialog>

    <!-- 简历上传对话框 -->
    <ResumeUpload v-model="showResumeUpload" @confirm="handleResumeParsed" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onActivated, computed } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import { TableSkeleton } from '@/components/Skeleton';
import EmptyState from '@/components/common/EmptyState.vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Plus, Search, UserFilled, Upload, Promotion, CollectionTag } from '@element-plus/icons-vue';
import {
  getCandidateList,
  advanceStage,
  deleteCandidate,
  batchAdvanceStage,
  batchSetTags,
  type CandidateItem,
  type AdvanceStageParams,
  type ResumeParseResult,
} from '@/api/candidate';
import { getPipelineStages } from '@/api/pipeline-template';
import { getTags, type Tag } from '@/api/tag';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import { useDictionaryStore } from '@/stores/dictionary';
import { useResumeParserStore } from '@/stores/resumeParser';
// F5-C：猎头渠道来源筛选（仅 admin / hr 加载）
import { getAgencyList } from '@/api/agency';
import ResumeUpload from './ResumeUpload.vue';

const router = useRouter();
const authStore = useAuthStore();
const appStore = useAppStore();
const { uiNewListLayout } = storeToRefs(appStore);
const dictionaryStore = useDictionaryStore();

// ============ 数据 ============
const loading = ref(false);
const error = ref(false);
const candidateList = ref<CandidateItem[]>([]);
const pagination = reactive({ page: 1, pageSize: 10, total: 0 });
const filterForm = reactive({ keyword: '', stage: '', status: '', source: '', tagIds: [] as string[], hasNoJob: false });
const activeView = ref<'all' | 'todo' | 'week' | 'rejected'>('all');
const candidateViews = [{ value: 'all', label: '全部' }, { value: 'todo', label: '待我处理' }, { value: 'week', label: '本周新增' }, { value: 'rejected', label: '已淘汰' }] as const;
const todoCount = computed(() => candidateList.value.filter((item) => item.stageStatus === 'in_progress').length);
const visibleCandidateList = computed(() => {
  if (activeView.value === 'todo') return candidateList.value.filter((item) => item.stageStatus === 'in_progress');
  if (activeView.value === 'week') { const start = Date.now() - 7 * 24 * 60 * 60 * 1000; return candidateList.value.filter((item) => new Date(item.createdAt).getTime() >= start); }
  return candidateList.value;
});
const tagOptions = ref<Tag[]>([]);

// 表格引用与多选
const tableRef = ref<any>();
const selectedCandidates = ref<CandidateItem[]>([]);

// ============ 批量推进 ============
const batchAdvanceVisible = ref(false);
const batchAdvanceSubmitting = ref(false);
const batchAdvanceFormRef = ref<FormInstance>();
const batchAdvanceForm = reactive<AdvanceStageParams>({
  stage: '' as any,
  status: 'passed',
  rejectReason: '',
  note: '',
});

// ============ 批量打标签 ============
const batchTagVisible = ref(false);
const batchTagSubmitting = ref(false);
const batchTagIds = ref<string[]>([]);

// ============ 推进流程 ============
const advanceDialogVisible = ref(false);
const advanceSubmitting = ref(false);
const advanceFormRef = ref<FormInstance>();
const currentCandidate = ref<CandidateItem | null>(null);
// 阶段选项不再硬编码：按候选人适用职位的 Pipeline 模板动态获取
const candidateStages = ref<string[]>([]);
// 批量推进针对多个候选人，统一使用全局默认模板阶段
const defaultStages = ref<string[]>([]);

const availableStages = computed(() => {
  if (!currentCandidate.value) return [];
  const currentIndex = candidateStages.value.indexOf(currentCandidate.value.currentStage);
  // Admin 用户可以跳到任意阶段
  if (authStore.isAdmin) {
    return candidateStages.value;
  }
  const stages: string[] = [];
  // 存量老阶段可能不在模板中（index=-1），此时仅提供模板第一个阶段作为推进目标
  const current = candidateStages.value[currentIndex];
  if (current) stages.push(current);
  const nextStage = candidateStages.value[currentIndex + 1];
  if (nextStage) stages.push(nextStage);
  return stages;
});

const advanceForm = reactive<AdvanceStageParams>({
  stage: '',
  status: 'passed',
  rejectReason: '',
  note: '',
});

const advanceRules: FormRules = {
  stage: [{ required: true, message: '请选择目标阶段', trigger: 'change' }],
  status: [{ required: true, message: '请选择阶段结果', trigger: 'change' }],
  rejectReason: [{ required: true, message: '请填写淘汰原因', trigger: 'blur' }],
};

// ============ 淘汰 ============
const rejectDialogVisible = ref(false);
const rejectSubmitting = ref(false);
const rejectFormRef = ref<FormInstance>();
const rejectForm = reactive({ rejectReason: '' });
const rejectRules: FormRules = { rejectReason: [{ required: true, message: '请填写淘汰原因', trigger: 'blur' }] };

// ============ 简历上传 ============
const showResumeUpload = ref(false);

// F5-C：猎头渠道来源筛选选项（值为 `猎头:机构名`，与后端精确匹配 §3.2-1）
const agencySourceOptions = ref<Array<{ value: string; label: string }>>([]);

const resumeParserStore = useResumeParserStore();

function handleResumeParsed(data: ResumeParseResult) {
  // 将解析结果存储到 Pinia Store，跳转到创建页面
  resumeParserStore.setParsedData(data);
  router.push('/candidates/create');
}

// ============ 方法 ============
async function fetchCandidateList() {
  loading.value = true;
  error.value = false;
  try {
    const res = await getCandidateList({
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: filterForm.keyword || undefined,
      stage: filterForm.stage || undefined,
      status: (filterForm.status || undefined) as import('@/api/candidate').StageStatus | undefined,
      source: filterForm.source || undefined,
      tagIds: filterForm.tagIds.length > 0 ? filterForm.tagIds : undefined,
      hasNoJob: filterForm.hasNoJob || undefined,
    });
    if (res.success) {
      candidateList.value = res.data;
      pagination.total = res.pagination.total;
    }
  } catch (err: any) {
    error.value = true;
    // axios 拦截器已显示 toast，此处仅记录状态用于展示重试 UI
    console.error('获取候选人列表失败:', err);
  } finally {
    loading.value = false;
  }
}

async function fetchTags() {
  try {
    const res = await getTags();
    if (res.success) {
      tagOptions.value = res.data;
    }
  } catch {
    // 静默失败
  }
}

// F5-C：仅 admin / hr（member 换算 hr）才发请求拉取猎头机构作为来源筛选；其他角色不发请求（§3.2-2）
async function fetchAgencySourceOptions() {
  const rawRole = authStore.userInfo?.role;
  const role = rawRole === 'member' ? 'hr' : rawRole;
  if (role !== 'admin' && role !== 'hr') return;
  try {
    const res = await getAgencyList();
    if (res.success) {
      agencySourceOptions.value = res.data.map((a) => ({
        value: `猎头:${a.name}`,
        label: `猎头:${a.name}`,
      }));
    }
  } catch {
    // 静默失败，保持空数组（分组 v-if 自动隐藏）
  }
}

function changeView(view: 'all' | 'todo' | 'week' | 'rejected') { activeView.value = view; filterForm.status = view === 'rejected' ? 'rejected' : ''; pagination.page = 1; fetchCandidateList(); }
function handleSearch() { pagination.page = 1; fetchCandidateList(); }
function handleReset() {
  filterForm.keyword = '';
  filterForm.stage = '';
  filterForm.status = '';
  filterForm.source = '';
  filterForm.tagIds = [];
  filterForm.hasNoJob = false;
  handleSearch();
}
function handlePageChange(page: number) { pagination.page = page; fetchCandidateList(); }
function handleSizeChange(size: number) { pagination.pageSize = size; pagination.page = 1; fetchCandidateList(); }
function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '-';
  }
}
function getStageType(stage: string): string {
  const map: Record<string, string> = { '入库': 'info', '初筛': '', '复试': 'warning', '终面': 'warning', '拟录用': 'success', 'Offer': 'success', '入职': 'danger' };
  return map[stage] || '';
}
// UI-S2：阶段 pill class，取值与 getStageType 同一套枚举，只换视觉
function getStagePillClass(stage: string): string {
  if (stage === '入库' || stage === '初筛') return 'ui-stage-pill--new';
  if (stage === '复试' || stage === '终面') return 'ui-stage-pill--interview';
  if (stage === '拟录用' || stage === 'Offer') return 'ui-stage-pill--offer';
  if (stage === '入职') return 'ui-stage-pill--hired';
  return 'ui-stage-pill--new';
}
function getStatusType(status: string): string {
  return { 'in_progress': 'warning', 'passed': 'success', 'rejected': 'danger' }[status] || 'info';
}
function getStatusText(status: string): string {
  return { 'in_progress': '进行中', 'passed': '已通过', 'rejected': '已淘汰' }[status] || status;
}
function canAdvance(row: CandidateItem): boolean {
  return row.stageStatus !== 'rejected' && row.currentStage !== '入职';
}
function canDelete(row: CandidateItem): boolean {
  const currentUser = authStore.userInfo;
  return currentUser?.id === row.createdById || currentUser?.role === 'admin';
}
// UI-S2：已淘汰行弱化（opacity 0.72，不改背景、不加删除线）
function uiCandRowClass({ row }: { row: CandidateItem }) {
  return row.stageStatus === 'rejected' ? 'ui-cand-row--rejected' : '';
}

async function handleDelete(row: CandidateItem) {
  try {
    await ElMessageBox.confirm(
      `确定要删除候选人「${row.name}」吗？此操作不可恢复。`,
      '删除确认',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    );
    const res = await deleteCandidate(row.id);
    if (res.success) {
      ElMessage.success('删除成功');
      fetchCandidateList();
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败');
    }
  }
}

function handleAdd() { router.push('/candidates/create'); }
function handleRowClick(row: CandidateItem) { handleDetail(row); }
function handleDetail(row: CandidateItem) { router.push(`/candidates/${row.id}`); }
// UI-S2：下拉命令分发到既有处理函数，不重写业务逻辑
function handleRowCommand(cmd: string | number, row: CandidateItem) {
  if (cmd === 'advance') handleAdvance(row);
  else if (cmd === 'reject') handleReject(row);
  else if (cmd === 'delete') handleDelete(row);
}

function handleAdvance(row: CandidateItem) {
  currentCandidate.value = row;
  advanceForm.stage = row.currentStage;
  advanceForm.status = 'passed';
  advanceForm.rejectReason = '';
  advanceForm.note = '';
  advanceDialogVisible.value = true;
  // 拉取该候选人适用的 Pipeline 模板阶段（按关联职位的模板/默认模板）
  getPipelineStages(row.id)
    .then((res) => { candidateStages.value = res.data; })
    .catch(() => { candidateStages.value = []; });
}

async function handleAdvanceSubmit() {
  if (!currentCandidate.value) return;
  const valid = await advanceFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  advanceSubmitting.value = true;
  try {
    const res = await advanceStage(currentCandidate.value.id, { ...advanceForm });
    if (res.success) {
      ElMessage.success('阶段推进成功');
      advanceDialogVisible.value = false;
      fetchCandidateList();
    }
  } catch (error: any) {
    ElMessage.error(error.message || '推进失败');
  } finally {
    advanceSubmitting.value = false;
  }
}

function handleReject(row: CandidateItem) {
  currentCandidate.value = row;
  rejectForm.rejectReason = '';
  rejectDialogVisible.value = true;
}

async function handleRejectSubmit() {
  if (!currentCandidate.value) return;
  const valid = await rejectFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  rejectSubmitting.value = true;
  try {
    const res = await advanceStage(currentCandidate.value.id, {
      stage: currentCandidate.value.currentStage as any,
      status: 'rejected',
      rejectReason: rejectForm.rejectReason,
    });
    if (res.success) {
      ElMessage.success('已淘汰该候选人');
      rejectDialogVisible.value = false;
      fetchCandidateList();
    }
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败');
  } finally {
    rejectSubmitting.value = false;
  }
}

// ============ 批量操作 ============
function handleSelectionChange(val: CandidateItem[]) {
  selectedCandidates.value = val;
}

function clearSelection() {
  tableRef.value?.clearSelection();
  selectedCandidates.value = [];
}

function showBatchAdvance() {
  batchAdvanceForm.stage = '';
  batchAdvanceForm.status = 'passed';
  batchAdvanceForm.rejectReason = '';
  batchAdvanceForm.note = '';
  batchAdvanceVisible.value = true;
  // 批量推进不针对单个候选人，使用全局默认模板阶段（后端会按各候选人模板逐条校验）
  getPipelineStages()
    .then((res) => { defaultStages.value = res.data; })
    .catch(() => { defaultStages.value = []; });
}

async function handleBatchAdvanceSubmit() {
  const valid = await batchAdvanceFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  batchAdvanceSubmitting.value = true;
  try {
    const res = await batchAdvanceStage({
      candidateIds: selectedCandidates.value.map((c) => c.id),
      ...batchAdvanceForm,
    });
    if (res.success) {
      const failed = res.data?.failed || 0;
      if (failed > 0) {
        ElMessage.warning(res.message || `批量推进完成，${failed} 人未处理`);
      } else {
        ElMessage.success(res.message || '批量推进完成');
      }
      batchAdvanceVisible.value = false;
      if (failed > 0 && res.data?.failedIds?.length) {
        selectedCandidates.value = selectedCandidates.value.filter((candidate) => res.data?.failedIds?.includes(candidate.id));
      } else {
        clearSelection();
      }
      fetchCandidateList();
    }
  } catch (error: any) {
    ElMessage.error(error.message || '批量推进失败');
  } finally {
    batchAdvanceSubmitting.value = false;
  }
}

function showBatchTag() {
  batchTagIds.value = [];
  batchTagVisible.value = true;
}

async function handleBatchTagSubmit() {
  batchTagSubmitting.value = true;
  try {
    const res = await batchSetTags({
      candidateIds: selectedCandidates.value.map((c) => c.id),
      tagIds: batchTagIds.value,
    });
    if (res.success) {
      ElMessage.success(res.message || '批量设置标签完成');
      batchTagVisible.value = false;
      clearSelection();
      fetchCandidateList();
    }
  } catch (error: any) {
    ElMessage.error(error.message || '批量设置标签失败');
  } finally {
    batchTagSubmitting.value = false;
  }
}

onMounted(() => {
  dictionaryStore.fetchDictionaries('source');
  fetchTags();
  fetchAgencySourceOptions();
  fetchCandidateList();
});
onActivated(() => { fetchCandidateList(); });
</script>

<style scoped lang="scss">
.candidates-page { padding: 4px 0 20px; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;
  .title-section { .page-title { margin: 0; font-size: 24px; font-weight: 500; color: $ui-gray-900; }
    .page-subtitle { margin-top: 8px; font-size: 14px; color: $ui-gray-500; }
  }
}
.candidate-views { display: flex; flex-wrap: wrap; gap: 8px; margin: -4px 0 16px; .view-count { display: inline-flex; margin-left: 5px; min-width: 16px; justify-content: center; font-size: 11px; } }
.scope-tip { margin-bottom: 16px; }
.filter-card { margin-bottom: 16px;
  .filter-form { display: flex; flex-wrap: wrap; gap: $ui-space-sm; :deep(.el-form-item) { margin-bottom: 0; } }
}
.batch-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 16px;
  background-color: #f0f9ff;
  border: 1px solid #b3e0ff;
  border-radius: 6px;

  .batch-info {
    font-size: 14px;
    color: $ui-gray-900;
    font-weight: 500;
    margin-right: auto;
  }
}
.table-card {
  .candidate-info { display: flex; align-items: center; gap: 12px;
    .candidate-detail { .candidate-name { font-weight: 500; color: $ui-gray-900; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
      .candidate-contact { font-size: 12px; color: $ui-gray-500; }
    }
  }
  .stage-tag { min-width: 60px; text-align: center; }
  .job-tags { display: flex; flex-wrap: wrap; gap: 6px; .job-tag { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .no-job { color: $ui-gray-500; } }
  .tag-list { display: flex; flex-wrap: wrap; gap: 4px; .candidate-tag { color: #fff; border: none; } .no-tag { color: $ui-gray-500; } }
  .pagination-wrapper { display: flex; justify-content: flex-end; margin-top: 20px; padding-top: 20px; border-top: 1px solid $ui-border-color-light; }
}
.error-state {
  display: flex;
  justify-content: center;
  padding: 60px 0;
}
// ============ UI-S2：列表信息密度（仅新增 class，不覆写 Element Plus 全局）============
.ui-batch-bar {
  background-color: $ui-gray-50;
  border: $ui-border-width solid $ui-border-color-light;
  border-radius: $ui-radius-sm;
}
.ui-cand-cell {
  display: flex;
  align-items: center;
  gap: $ui-space-sm;
  min-width: 0;
}
.ui-cand-avatar {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: $ui-gray-200;
  color: $ui-gray-700;
  font-size: $ui-font-md;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.ui-cand-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}
.ui-cand-name-row {
  display: flex;
  align-items: center;
  gap: $ui-space-xs;
  min-width: 0;
}
.ui-cand-name {
  font-weight: 600;
  color: $ui-gray-900;
  font-size: $ui-font-md;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ui-cand-phone {
  font-size: $ui-font-xs;
  color: $ui-gray-500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ui-stage-pill {
  display: inline-block;
  min-width: 52px;
  padding: 2px 10px;
  border-radius: $ui-radius-pill;
  font-size: $ui-font-sm;
  line-height: 1.4;
  text-align: center;
  white-space: nowrap;
}
.ui-stage-pill--new {
  background: $ui-stage-bg-new;
  color: $ui-stage-fg-default;
}
.ui-stage-pill--interview {
  background: $ui-stage-bg-interview;
  color: $ui-stage-fg-strong;
}
.ui-stage-pill--offer {
  background: $ui-stage-bg-offer;
  color: $ui-color-success;
}
.ui-stage-pill--hired {
  background: $ui-color-success;
  color: #fff;
}
.ui-status-muted {
  font-size: $ui-font-xs;
  color: $ui-gray-500;
}
.ui-tag-list {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: $ui-space-xs;
  .candidate-tag { color: #fff; border: none; }
}
.ui-tag-more {
  font-size: $ui-font-xs;
  color: $ui-gray-500;
  cursor: default;
}
:deep(.ui-cand-row--rejected) {
  opacity: 0.72;
}
</style>
