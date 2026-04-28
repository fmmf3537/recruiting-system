<template>
  <div class="jobs-page">
    <van-nav-bar title="职位" fixed placeholder />
    <ListPage ref="listRef" :fetch-api="fetchApi" :page-size="10" empty-text="暂无职位">
      <template #default="{ data }">
        <van-cell
          v-for="item in data as JobItem[]"
          :key="item.id"
          :title="item.title"
          is-link
          @click="goDetail(item.id)"
        >
          <template #label>
            <div class="job-label">
              <p>{{ item.departments.join(' / ') }} | {{ item.location }} | {{ item.type }}</p>
              <p>
                <van-tag :type="getStatusType(item.status)">{{ item.status }}</van-tag>
                <span v-if="item._count" class="count-text">在招 {{ item._count.candidateJobs }} 人</span>
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
import { getJobList, type JobItem, type JobStatus } from '@/api/jobs';
import { getJobStatusType } from '@/constants';

const router = useRouter();

function fetchApi(params: { page: number; pageSize: number }) {
  return getJobList(params);
}

function goDetail(id: string) {
  router.push(`/jobs/${id}`);
}

function getStatusType(status: JobStatus) {
  return getJobStatusType(status);
}
</script>

<style scoped>
.jobs-page {
  min-height: 100%;
  background-color: #f7f8fa;
}

.job-label p {
  margin: 2px 0;
  font-size: 12px;
  color: #666;
}

.count-text {
  margin-left: 8px;
  color: #999;
}
</style>
