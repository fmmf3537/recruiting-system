<template>
  <div class="interviews-page">
    <van-nav-bar title="面试反馈" fixed placeholder />
    <ListPage ref="listRef" :fetch-api="fetchApi" :page-size="10" empty-text="暂无面试记录">
      <template #default="{ data }">
        <van-cell
          v-for="item in data as InterviewListItem[]"
          :key="item.id"
          :title="item.candidateName"
          is-link
          @click="goDetail(item)"
        >
          <template #label>
            <div class="interview-label">
              <p>{{ item.round }} | {{ item.interviewerName }}</p>
              <p>
                <van-tag :type="getConclusionType(item.conclusion)">{{ item.conclusion || '未反馈' }}</van-tag>
                <span class="time-text">{{ item.interviewTime.slice(0, 10) }}</span>
              </p>
            </div>
          </template>
        </van-cell>
      </template>
    </ListPage>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import ListPage from '@/components/ListPage.vue';
import { getInterviewList, type InterviewListItem } from '@/api/interviews';
import type { InterviewConclusion } from '@/api/candidates';

const router = useRouter();

function fetchApi(params: { page: number; pageSize: number }) {
  return getInterviewList(params);
}

function goDetail(item: InterviewListItem) {
  router.push(`/interviews/form?candidateId=${item.candidateId}&round=${item.round}`);
}

function getConclusionType(conclusion: InterviewConclusion | null) {
  if (conclusion === 'pass') return 'success';
  if (conclusion === 'reject') return 'danger';
  return 'warning';
}
</script>

<style scoped>
.interviews-page {
  min-height: 100%;
  background-color: #f7f8fa;
}

.interview-label p {
  margin: 2px 0;
  font-size: 12px;
  color: #666;
}

.time-text {
  margin-left: 8px;
  color: #999;
}
</style>
