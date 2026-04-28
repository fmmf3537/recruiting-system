<template>
  <div class="candidates-page">
    <van-nav-bar title="候选人" fixed placeholder />
    <van-search v-model="keyword" placeholder="搜索姓名/邮箱" @search="onSearch" />

    <div class="filter-bar">
      <van-dropdown-menu>
        <van-dropdown-item v-model="stage" :options="stageOptions" @change="onFilterChange" />
      </van-dropdown-menu>
    </div>

    <ListPage ref="listRef" :fetch-api="fetchApi" :page-size="10" empty-text="暂无候选人">
      <template #default="{ data }">
        <van-cell
          v-for="item in data as CandidateItem[]"
          :key="item.id"
          :title="item.name"
          is-link
          @click="goDetail(item.id)"
        >
          <template #label>
            <div class="candidate-label">
              <p>{{ item.email }} | {{ item.phone }}</p>
              <p>
                <van-tag :type="getStageType(item.stageStatus)">{{ item.currentStage }}</van-tag>
                <span v-if="item.candidateJobs.length" class="job-text">
                  {{ item.candidateJobs.map((j) => j.job.title).join(', ') }}
                </span>
              </p>
            </div>
          </template>
        </van-cell>
      </template>
    </ListPage>

    <van-floating-bubble
      axis="xy"
      icon="plus"
      magnetic="x"
      @click="goCreate"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import ListPage from '@/components/ListPage.vue';
import { getCandidateList, type CandidateItem } from '@/api/candidates';
import { STAGE_ORDER, getStageStatusType } from '@/constants';

const router = useRouter();
const listRef = ref<InstanceType<typeof ListPage> | null>(null);
const keyword = ref('');
const stage = ref('');

const stageOptions = [
  { text: '全部阶段', value: '' },
  ...STAGE_ORDER.map((s) => ({ text: s, value: s })),
];

function fetchApi(params: { page: number; pageSize: number }) {
  return getCandidateList({
    ...params,
    keyword: keyword.value || undefined,
    stage: stage.value || undefined,
  });
}

function onSearch() {
  listRef.value?.reload();
}

function onFilterChange() {
  listRef.value?.reload();
}

function goDetail(id: string) {
  router.push(`/candidates/${id}`);
}

function goCreate() {
  router.push('/candidates/form');
}

function getStageType(status: string) {
  return getStageStatusType(status);
}
</script>

<style scoped>
.candidates-page {
  min-height: 100%;
  background-color: #f7f8fa;
  padding-bottom: 80px;
}

.filter-bar {
  margin-bottom: 8px;
}

.candidate-label p {
  margin: 2px 0;
  font-size: 12px;
  color: #666;
}

.job-text {
  margin-left: 8px;
  color: #999;
}
</style>
