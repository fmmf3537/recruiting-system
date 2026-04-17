<template>
  <div class="detail-page">
    <van-nav-bar title="职位详情" left-arrow fixed placeholder @click-left="$router.back()" />

    <div v-if="loadError" class="error-block">
      <p>加载失败，请检查网络后重试</p>
      <van-button round block type="primary" @click="loadData">重新加载</van-button>
    </div>

    <div v-if="job" class="content">
      <van-cell-group inset class="group">
        <van-cell title="职位名称" :value="job.title" />
        <van-cell title="部门" :value="job.departments.join(' / ')" />
        <van-cell title="职级" :value="job.level" />
        <van-cell title="地点" :value="job.location" />
        <van-cell title="类型" :value="job.type" />
        <van-cell title="状态">
          <template #value>
            <van-tag :type="getStatusType(job.status)">{{ job.status }}</van-tag>
          </template>
        </van-cell>
      </van-cell-group>

      <div class="section-title">职位描述</div>
      <div class="rich-text" v-html="job.description" />

      <div class="section-title">职位要求</div>
      <div class="rich-text" v-html="job.requirements" />

      <div class="section-title">技能要求</div>
      <div class="tags">
        <van-tag v-for="skill in job.skills" :key="skill" class="skill-tag" type="primary">
          {{ skill }}
        </van-tag>
      </div>
    </div>

    <div class="bottom-actions">
      <van-button round block type="primary" icon="share-o" @click="onShare">分享给同事</van-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { showToast, showSuccessToast } from 'vant';
import { getJobById, type JobDetail, type JobStatus } from '@/api/jobs';
import { isFeishu, shareAppMessage } from '@/lib/feishu';

const route = useRoute();
const jobId = route.params.id as string;

const job = ref<JobDetail | null>(null);
const loadError = ref(false);

async function loadData() {
  loadError.value = false;
  try {
    const res = await getJobById(jobId);
    if (res.success) {
      job.value = res.data;
    }
  } catch {
    loadError.value = true;
    showToast('加载详情失败');
  }
}

function getStatusType(status: JobStatus) {
  if (status === 'open') return 'success';
  if (status === 'closed') return 'danger';
  return 'warning';
}

async function onShare() {
  if (!job.value) return;
  const url = `${window.location.origin}/jobs/${jobId}`;
  const {title} = job.value;
  const desc = `${job.value.departments.join(' / ')} | ${job.value.location}`;

  if (isFeishu()) {
    try {
      await shareAppMessage(title, desc, url, '');
      showSuccessToast('分享成功');
    } catch {
      showToast('分享失败');
    }
    return;
  }

  if (navigator.share) {
    try {
      await navigator.share({ title, text: desc, url });
    } catch {
      // 用户取消
    }
    return;
  }

  try {
    await navigator.clipboard.writeText(url);
    showSuccessToast('链接已复制');
  } catch {
    showToast('复制失败');
  }
}

onMounted(() => {
  loadData();
});
</script>

<style scoped>
.detail-page {
  min-height: 100%;
  background-color: #f7f8fa;
  padding-bottom: 80px;
}

.group {
  margin: 8px 0;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  padding: 12px 16px 8px;
}

.rich-text {
  padding: 0 16px 12px;
  font-size: 14px;
  color: #666;
  line-height: 1.6;
  background-color: #fff;
  margin: 0 16px 12px;
  border-radius: 8px;
}

.tags {
  padding: 0 16px 12px;
}

.skill-tag {
  margin-right: 8px;
  margin-bottom: 8px;
}

.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 16px;
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
  background-color: #fff;
  border-top: 1px solid #ebedf0;
}

.error-block {
  text-align: center;
  padding: 48px 24px;
  color: #666;
  font-size: 14px;
}
</style>
