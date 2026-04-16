<template>
  <div class="list-page">
    <van-pull-refresh v-model="refreshing" @refresh="onRefresh">
      <van-list
        v-model:loading="loading"
        :finished="finished"
        finished-text="没有更多了"
        @load="onLoad"
      >
        <slot v-if="data.length" name="default" :data="data" />
        <van-empty v-else-if="!loading && !refreshing" image="search" :description="emptyText" />
      </van-list>
    </van-pull-refresh>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface ListResponse<T> {
  success: boolean;
  data: T[];
  pagination: Pagination;
}

type FetchApi<T> = (params: { page: number; pageSize: number }) => Promise<ListResponse<T>>;

const props = defineProps<{
  fetchApi: FetchApi<unknown>;
  pageSize?: number;
  emptyText?: string;
}>();

const emit = defineEmits<{
  (e: 'update:data', data: unknown[]): void;
}>();

const loading = ref(false);
const refreshing = ref(false);
const finished = ref(false);
const data = ref<unknown[]>([]);
const page = ref(1);
const pageSize = props.pageSize || 10;
const emptyText = props.emptyText || '暂无数据';

async function onLoad() {
  if (refreshing.value) return;
  loading.value = true;
  try {
    const res = await props.fetchApi({ page: page.value, pageSize });
    if (res.success) {
      if (page.value === 1) {
        data.value = res.data;
      } else {
        data.value = [...data.value, ...res.data];
      }
      emit('update:data', data.value);
      finished.value = page.value >= res.pagination.totalPages || res.data.length < pageSize;
      page.value += 1;
    }
  } finally {
    loading.value = false;
  }
}

async function onRefresh() {
  finished.value = false;
  page.value = 1;
  refreshing.value = true;
  try {
    const res = await props.fetchApi({ page: 1, pageSize });
    if (res.success) {
      data.value = res.data;
      emit('update:data', data.value);
      finished.value = page.value >= res.pagination.totalPages || res.data.length < pageSize;
      page.value = 2;
    }
  } finally {
    refreshing.value = false;
  }
}

// 暴露刷新方法给父组件
function reload() {
  finished.value = false;
  page.value = 1;
  onLoad();
}

defineExpose({
  reload,
});

watch(
  () => props.fetchApi,
  () => {
    reload();
  },
  { immediate: true }
);
</script>

<style scoped>
.list-page {
  min-height: 100%;
}
</style>
