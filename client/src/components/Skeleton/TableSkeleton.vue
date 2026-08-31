<template>
  <el-skeleton :rows="rows" animated v-bind="$attrs">
    <template #template>
      <el-skeleton-item variant="text" style="width: 50%" />
      <el-skeleton-item variant="text" style="width: 60%; margin-bottom: 16px" />
      <div v-for="i in rowCount" :key="i" class="table-skeleton-row">
        <el-skeleton-item variant="circle" style="width: 32px; height: 32px" />
        <div class="table-skeleton-row-text">
          <el-skeleton-item variant="text" style="width: 40%; margin-bottom: 8px" />
          <el-skeleton-item variant="text" style="width: 70%" />
        </div>
      </div>
    </template>
  </el-skeleton>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    rowCount?: number;
    rows?: number;
  }>(),
  {
    rowCount: 5,
    rows: 6,
  }
);
</script>

<style scoped>
.table-skeleton-row {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.table-skeleton-row-text {
  flex: 1;
}
</style>
