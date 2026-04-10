<script setup lang="ts">
import { ref } from 'vue';

const loading = ref(false);
const interviews = ref([]);

// TODO: 实现面试安排功能
</script>

<template>
  <div class="interviews-page">
    <div class="page-header flex-between">
      <h1 class="page-title">面试安排</h1>
      <el-button type="primary" :icon="Plus">安排面试</el-button>
    </div>

    <el-card shadow="never">
      <el-empty v-if="interviews.length === 0 && !loading" description="暂无面试安排" />
      <div v-else>面试列表开发中...</div>
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
