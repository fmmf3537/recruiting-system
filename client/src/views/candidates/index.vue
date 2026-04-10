<script setup lang="ts">
import { ref } from 'vue';

const loading = ref(false);
const candidates = ref([]);

// TODO: 实现候选人列表功能
</script>

<template>
  <div class="candidates-page">
    <div class="page-header flex-between">
      <h1 class="page-title">候选人管理</h1>
      <el-button type="primary" :icon="Plus">添加候选人</el-button>
    </div>

    <el-card shadow="never">
      <el-empty v-if="candidates.length === 0 && !loading" description="暂无候选人数据" />
      <div v-else>候选人列表开发中...</div>
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
