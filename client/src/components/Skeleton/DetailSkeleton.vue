<template>
  <el-skeleton :rows="8" animated v-bind="$attrs">
    <template #template>
      <el-skeleton-item variant="h1" style="width: 50%; margin-bottom: 16px" />
      <el-skeleton-item variant="text" style="width: 60%; margin-bottom: 24px" />
      <div class="detail-skeleton-grid">
        <el-skeleton-item v-for="i in 8" :key="i" variant="text" style="width: 100%" />
      </div>
      <el-skeleton-item variant="text" style="margin-top: 24px; width: 40%" />
      <el-skeleton-item variant="text" style="width: 90%" />
    </template>
  </el-skeleton>
</template>

<style scoped>
.detail-skeleton-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
</style>
