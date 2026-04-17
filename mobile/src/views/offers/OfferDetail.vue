<template>
  <div class="detail-page">
    <van-nav-bar title="Offer 详情" left-arrow fixed placeholder @click-left="$router.back()" />

    <div v-if="loadError" class="error-block">
      <p>加载失败，请检查网络后重试</p>
      <van-button round block type="primary" @click="loadData">重新加载</van-button>
    </div>

    <div v-if="offer" class="content">
      <van-cell-group inset class="group">
        <van-cell title="候选人" :value="offer.candidate.name" />
        <van-cell title="邮箱" :value="offer.candidate.email" />
        <van-cell title="电话" :value="offer.candidate.phone" />
        <van-cell title="薪资" :value="offer.salary" />
        <van-cell title="Offer 日期" :value="offer.offerDate.slice(0, 10)" />
        <van-cell title="预计入职" :value="offer.expectedJoinDate ? offer.expectedJoinDate.slice(0, 10) : '-'" />
        <van-cell title="结果">
          <template #value>
            <van-tag :type="getResultType(offer.result)">{{ offer.result }}</van-tag>
          </template>
        </van-cell>
        <van-cell title="入职状态" :value="offer.joined ? '已入职' : '未入职'" />
        <van-cell v-if="offer.actualJoinDate" title="实际入职" :value="offer.actualJoinDate.slice(0, 10)" />
        <van-cell v-if="offer.note" title="备注" :label="offer.note" />
      </van-cell-group>
    </div>

    <div class="bottom-actions">
      <van-button round block type="primary" @click="showResult = true">变更结果</van-button>
      <van-button round block type="success" @click="showJoin = true">标记入职</van-button>
    </div>

    <van-action-sheet
      v-model:show="showResult"
      :actions="resultActions"
      cancel-text="取消"
      close-on-click-action
      @select="onResultSelect"
    />

    <van-popup v-model:show="showJoin" round position="bottom">
      <van-date-picker title="选择入职日期" @confirm="onJoinConfirm" @cancel="showJoin = false" />
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { showToast } from 'vant';
import { getOfferByCandidateId, updateOfferResult, markOfferAsJoined, type OfferResult, type OfferDetailData } from '@/api/offers';

const route = useRoute();
const candidateId = route.params.candidateId as string;

const offer = ref<OfferDetailData['data'] | null>(null);
const showResult = ref(false);
const showJoin = ref(false);
const loadError = ref(false);

const resultActions = [
  { name: 'pending', text: '待定' },
  { name: 'accepted', text: '已接受' },
  { name: 'rejected', text: '已拒绝' },
];

async function loadData() {
  loadError.value = false;
  try {
    const res = await getOfferByCandidateId(candidateId);
    if (res.success) {
      offer.value = res.data;
    }
  } catch {
    loadError.value = true;
    showToast('加载详情失败');
  }
}

function getResultType(result: OfferResult) {
  if (result === 'accepted') return 'success';
  if (result === 'rejected') return 'danger';
  return 'warning';
}

async function onResultSelect(action: { name: string }) {
  try {
    const res = await updateOfferResult(candidateId, { result: action.name as OfferResult });
    if (res.success) {
      showToast('结果已更新');
      loadData();
    }
  } catch {
    showToast('操作失败');
  }
}

async function onJoinConfirm({ selectedValues }: { selectedValues: string[] }) {
  const dateStr = `${selectedValues[0]}-${selectedValues[1]}-${selectedValues[2]}T00:00:00.000Z`;
  try {
    const res = await markOfferAsJoined(candidateId, { actualJoinDate: dateStr });
    if (res.success) {
      showToast('已标记入职');
      showJoin.value = false;
      loadData();
    }
  } catch {
    showToast('操作失败');
  }
}

onMounted(() => {
  loadData();
});
</script>

<style scoped>
.detail-page {
  min-height: 100%;
  background-color: #f7f8fa;
  padding-bottom: 100px;
}

.group {
  margin: 8px 0;
}

.bottom-actions {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
  background-color: #fff;
  border-top: 1px solid #ebedf0;
}

.error-block {
  text-align: center;
  padding: 48px 24px;
  color: #666;
  font-size: 14px;
}
</style>
