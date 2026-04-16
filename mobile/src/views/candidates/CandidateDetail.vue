<template>
  <div class="detail-page">
    <van-nav-bar title="候选人详情" left-arrow fixed placeholder @click-left="$router.back()" />

    <div v-if="candidate" class="content">
      <!-- 基本信息 -->
      <van-cell-group inset class="group">
        <van-cell title="姓名" :value="candidate.name" />
        <van-cell title="性别" :value="candidate.gender" />
        <van-cell title="年龄" :value="candidate.age ? `${candidate.age}岁` : '-'" />
        <van-cell title="电话" :value="candidate.phone" />
        <van-cell title="邮箱" :value="candidate.email" />
        <van-cell title="学历" :value="candidate.education" />
        <van-cell title="学校" :value="candidate.school || '-'" />
        <van-cell title="工作年限" :value="candidate.workYears ? `${candidate.workYears}年` : '-'" />
        <van-cell title="当前公司" :value="candidate.currentCompany || '-'" />
        <van-cell title="当前职位" :value="candidate.currentPosition || '-'" />
        <van-cell title="期望薪资" :value="candidate.expectedSalary || '-'" />
        <van-cell title="来源" :value="candidate.source" />
      </van-cell-group>

      <!-- 关联职位 -->
      <div class="section-title">关联职位</div>
      <van-cell-group inset class="group">
        <van-cell
          v-for="job in candidate.candidateJobs"
          :key="job.id"
          :title="job.job.title"
          value="查看"
          is-link
          @click="$router.push(`/jobs/${job.job.id}`)"
        />
        <van-empty v-if="!candidate.candidateJobs.length" description="未关联职位" />
      </van-cell-group>

      <!-- 工作经历 -->
      <div class="section-title">工作经历</div>
      <van-collapse v-model="activeCollapse" inset>
        <van-collapse-item
          v-for="(wh, idx) in candidate.workHistory || []"
          :key="idx"
          :title="`${wh.company} - ${wh.position}`"
        >
          <p>{{ wh.startDate }} 至 {{ wh.endDate || '至今' }}</p>
          <p>{{ wh.description || '无描述' }}</p>
        </van-collapse-item>
        <van-empty v-if="!(candidate.workHistory || []).length" description="无工作经历" />
      </van-collapse>

      <!-- 阶段时间轴 -->
      <div class="section-title">招聘阶段</div>
      <van-steps
        direction="vertical"
        :active="candidate.stageRecords.length - 1"
        inactive-icon="circle"
        active-icon="success"
      >
        <van-step v-for="record in candidate.stageRecords" :key="record.id">
          <h4>{{ record.stage }}</h4>
          <p>{{ record.status === 'passed' ? '已通过' : record.status === 'rejected' ? '已淘汰' : '进行中' }}</p>
          <p v-if="record.note">备注：{{ record.note }}</p>
        </van-step>
      </van-steps>

      <!-- 面试反馈 -->
      <div class="section-title">面试反馈</div>
      <van-cell-group inset class="group">
        <van-cell
          v-for="fb in candidate.interviewFeedbacks"
          :key="fb.id"
          :title="fb.round"
          :label="`${fb.interviewerName} | ${fb.conclusion} | ${fb.feedbackContent}`"
        />
        <van-empty v-if="!candidate.interviewFeedbacks.length" description="暂无面试反馈" />
      </van-cell-group>

      <!-- Offer 信息 -->
      <div class="section-title">Offer</div>
      <van-cell-group v-if="candidate.offer" inset class="group">
        <van-cell title="薪资" :value="candidate.offer.salary" />
        <van-cell title="Offer日期" :value="candidate.offer.offerDate.slice(0, 10)" />
        <van-cell title="结果" :value="candidate.offer.result" />
        <van-cell title="入职状态" :value="candidate.offer.joined ? '已入职' : '未入职'" />
      </van-cell-group>
      <van-empty v-else description="暂无 Offer" />
    </div>

    <!-- 底部操作栏 -->
    <div class="bottom-actions">
      <van-action-bar-icon icon="edit" text="编辑" @click="goEdit" />
      <van-action-bar-icon icon="records-o" text="反馈" @click="goFeedback" />
      <van-action-bar-icon icon="upgrade" text="推进" @click="showStage = true" />
      <van-action-bar-icon icon="description" text="简历" @click="goResume" />
      <van-action-bar-button type="danger" text="创建 Offer" @click="goOffer" />
    </div>

    <StageActionSheet v-model:show="showStage" :candidate-id="candidateId" @success="reload" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import { getCandidateById, type CandidateDetail } from '@/api/candidates';
import StageActionSheet from '@/components/StageActionSheet.vue';

const route = useRoute();
const router = useRouter();
const candidateId = route.params.id as string;

const candidate = ref<CandidateDetail | null>(null);
const activeCollapse = ref<number[]>([]);
const showStage = ref(false);

async function loadData() {
  try {
    const res = await getCandidateById(candidateId);
    if (res.success) {
      candidate.value = res.data;
    }
  } catch {
    showToast('加载详情失败');
  }
}

function reload() {
  loadData();
}

function goEdit() {
  router.push(`/candidates/form?id=${candidateId}&mode=edit`);
}

function goFeedback() {
  router.push(`/candidates/${candidateId}/feedback`);
}

function goResume() {
  router.push(`/candidates/${candidateId}/resume`);
}

function goOffer() {
  router.push(`/offers/form?candidateId=${candidateId}`);
}

onMounted(() => {
  loadData();
});
</script>

<style scoped>
.detail-page {
  min-height: 100%;
  background-color: #f7f8fa;
  padding-bottom: 100px;
}

.content {
  padding-top: 8px;
}

.group {
  margin-bottom: 12px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  padding: 12px 16px 8px;
}

.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-around;
  align-items: center;
  background-color: #fff;
  border-top: 1px solid #ebedf0;
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
