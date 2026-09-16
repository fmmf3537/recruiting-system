<template>
  <div class="ui-page-header">
    <div class="ui-page-header__text">
      <h1 class="ui-page-header__title">{{ title }}</h1>
      <p v-if="description" class="ui-page-header__description">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="ui-page-header__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<style scoped lang="scss">
.ui-page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: $ui-space-lg;
  margin-bottom: $ui-space-lg;
}

.ui-page-header__title {
  margin: 0;
  color: $ui-gray-900;
  font-size: 24px;
  font-weight: 500;
  line-height: 1.35;
}

.ui-page-header__description {
  margin: $ui-space-xs 0 0;
  color: $ui-gray-500;
  font-size: $ui-font-md;
}

.ui-page-header__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: $ui-space-sm;
}

@media (max-width: 640px) {
  .ui-page-header {
    flex-direction: column;
  }

  .ui-page-header__actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
