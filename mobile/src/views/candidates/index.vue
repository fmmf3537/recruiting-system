<template>
  <div class="candidates-page">
    <van-nav-bar title="候选人" fixed placeholder />
    <div class="page-content">
      <van-empty description="候选人列表将在 Phase 2 中实现" />
    </div>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.candidates-page {
  min-height: 100%;
  background-color: #f7f8fa;
}

.page-content {
  padding: 16px;
}
</style>
