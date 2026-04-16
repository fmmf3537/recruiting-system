<template>
  <div class="offers-page">
    <van-nav-bar title="Offer" fixed placeholder />
    <ListPage ref="listRef" :fetch-api="fetchApi" :page-size="10" empty-text="暂无 Offer">
      <template #default="{ data }">
        <van-cell
          v-for="item in data as OfferItem[]"
          :key="item.id"
          :title="item.candidate.name"
          is-link
          @click="goDetail(item.candidateId)"
        >
          <template #label>
            <div class="offer-label">
              <p>薪资：{{ item.salary }} | 日期：{{ item.offerDate.slice(0, 10) }}</p>
              <p>
                <van-tag :type="getResultType(item.result)">{{ item.result }}</van-tag>
                <van-tag v-if="item.joined" type="success">已入职</van-tag>
              </p>
            </div>
          </template>
        </van-cell>
      </template>
    </ListPage>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import ListPage from '@/components/ListPage.vue';
import { getOfferList, type OfferItem, type OfferResult } from '@/api/offers';

const router = useRouter();

function fetchApi(params: { page: number; pageSize: number }) {
  return getOfferList(params);
}

function goDetail(candidateId: string) {
  router.push(`/offers/${candidateId}`);
}

function getResultType(result: OfferResult) {
  if (result === 'accepted') return 'success';
  if (result === 'rejected') return 'danger';
  return 'warning';
}
</script>

<style scoped>
.offers-page {
  min-height: 100%;
  background-color: #f7f8fa;
}

.offer-label p {
  margin: 2px 0;
  font-size: 12px;
  color: #666;
}
</style>
