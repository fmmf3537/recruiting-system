<template>
  <div class="card-skeleton">
    <el-skeleton :rows="rows" animated v-bind="$attrs">
      <template #template>
        <el-skeleton-item variant="h1" style="width: 30%; margin-bottom: 16px" />
        <div class="card-skeleton-grid">
          <el-skeleton-item
            v-for="i in displayCount"
            :key="i"
            variant="rect"
            style="height: 80px"
          />
        </div>
        <el-skeleton-item variant="text" style="margin-top: 16px" />
        <el-skeleton-item variant="text" style="width: 80%; margin-bottom: 16px" />
      </template>
    </el-skeleton>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    rows?: number;
    cardCount?: number;
    rowCount?: number;
  }>(),
  {
    rows: 3,
    cardCount: 4,
  }
);

const displayCount = computed(() => props.rowCount ?? props.cardCount);
</script>

<style scoped>
.card-skeleton-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}
</style>
