<template>
  <div class="roles-page">
    <PageHeader title="角色与权限" description="按角色控制页面访问和数据范围" />
    <el-card shadow="never"><template #header><div class="card-title">系统角色 <span>4 个预置角色</span></div></template>
      <div class="role-list"><div v-for="role in rows" :key="role.name" class="role-row"><div class="role-main"><strong>{{ role.name }}</strong><p>{{ role.scope }}</p></div><div class="role-capability"><span>可访问页面</span>{{ role.pages }}</div><div class="role-capability"><span>关键操作</span>{{ role.actions }}</div><el-tag :type="role.name === '管理员' ? 'success' : 'info'" effect="plain">{{ role.name === '管理员' ? '系统角色' : '预置角色' }}</el-tag></div></div>
    </el-card>
  </div>
</template>
<script setup lang="ts">
import PageHeader from '@/components/common/PageHeader.vue';
const rows = [{ name: '管理员', pages: '全部页面', scope: '全部部门与候选人', actions: '用户、权限、审计、审批' }, { name: 'HR', pages: '职位、候选人、Offer、统计', scope: '本人、本部门及指派范围', actions: '创建、推进、发起审批' }, { name: '用人经理', pages: '工作台、面试、候选人', scope: '负责职位及指派候选人', actions: '安排面试、填写评估' }, { name: '面试官', pages: '面试官工作台', scope: '被安排的面试', actions: '提交与修改本人评估' }];
</script>
<style scoped lang="scss">
.roles-page { max-width: 1180px; margin: 0 auto; padding: 4px 0 20px; }.card-title { font-weight: 600; span { margin-left: 8px; color: $ui-gray-500; font-size: 13px; font-weight: 400; } }.role-row { display: grid; grid-template-columns: minmax(140px, .8fr) minmax(180px, 1fr) minmax(180px, 1fr) auto; align-items: center; gap: 20px; padding: 18px 4px; border-bottom: 1px solid $ui-border-color-light; &:last-child { border: 0; } }.role-main strong { font-size: 15px; }.role-main p,.role-capability { margin: 5px 0 0; color: $ui-gray-700; font-size: 13px; }.role-capability span { display:block; margin-bottom: 5px; color: $ui-gray-500; font-size: 12px; } @media (max-width: 760px) { .role-row { grid-template-columns: 1fr; gap: 8px; } }
</style>
