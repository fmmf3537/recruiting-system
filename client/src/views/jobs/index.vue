<script setup lang="ts">
import { ref } from 'vue';

const loading = ref(false);
const jobs = ref([]);

// TODO: 实现职位列表功能
</script>

<template>
  <div class="jobs-page">
    <div class="page-header flex-between">
      <h1 class="page-title">职位管理</h1>
      <el-button type="primary" :icon="Plus">发布职位</el-button>
    </div>

    <el-card shadow="never">
      <el-empty v-if="jobs.length === 0 && !loading" description="暂无职位数据" />
      <div v-else>职位列表开发中...</div>
    </el-card>
  </div>
</template>

<style scoped lang="scss">
.page-header {
  margin-bottom: 20px;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 500;
}
</style>
