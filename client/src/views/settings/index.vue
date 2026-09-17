<template>
  <div class="settings-home">
    <PageHeader title="设置中心" description="管理招聘流程、字典、自动化和智能能力" />
    <div class="settings-layout">
      <el-card shadow="never" class="settings-nav">
        <div class="nav-title">设置导航</div>
        <el-menu :default-active="activePath" @select="goTo">
          <el-menu-item v-for="item in items" :key="item.path" :index="item.path">{{ item.title }}</el-menu-item>
        </el-menu>
      </el-card>
      <el-card shadow="never" class="settings-overview">
        <div class="overview-head"><div><h3>配置概览</h3><p>从左侧进入具体配置页面，查看并维护当前规则。</p></div></div>
        <div class="setting-summary" v-for="item in items" :key="item.path" @click="goTo(item.path)">
          <div><strong>{{ item.title }}</strong><p>{{ itemSummary(item) || item.description }}</p></div><el-button link type="primary">进入设置</el-button>
        </div>
      </el-card>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '@/components/common/PageHeader.vue';
import { getPipelineTemplates, type PipelineTemplate } from '@/api/pipeline-template';
import { getAutomationRules, type AutomationRule } from '@/api/automation-rule';
const router = useRouter(); const route = useRoute();
const activePath = computed(() => route.path);
const templates = ref<PipelineTemplate[]>([]); const rules = ref<AutomationRule[]>([]);
const items = [{ path: '/settings/dictionary', title: '字典管理', description: '维护来源、部门、地点和技能选项' }, { path: '/settings/pipeline-templates', title: '流程模板', description: '按职位类型配置招聘阶段与默认流程' }, { path: '/settings/automation-rules', title: '自动化邮件', description: '配置阶段流转时的邮件规则' }, { path: '/settings/ai', title: 'AI 设置', description: '管理简历解析与智能匹配能力' }, { path: '/settings/tags', title: '标签管理', description: '维护候选人与职位标签' }, { path: '/settings/agencies', title: '猎头机构', description: '管理外部招聘渠道与合作机构' }];
function goTo(path: string) { router.push(path); }
function itemSummary(item: { path: string }): string {
  if (item.path === '/settings/pipeline-templates') { const active = templates.value.filter((template) => template.enabled); const defaultTemplate = active.find((template) => template.isDefault); return defaultTemplate ? `${active.length} 个启用模板 · 默认：${defaultTemplate.name}（${defaultTemplate.stages.length} 个阶段）` : `${active.length} 个启用模板`; }
  if (item.path === '/settings/automation-rules') return `${rules.value.filter((rule) => rule.enabled).length} 条启用规则`;
  return '';
}
onMounted(async () => { const [templateResult, ruleResult] = await Promise.allSettled([getPipelineTemplates(), getAutomationRules()]); if (templateResult.status === 'fulfilled' && templateResult.value.success) templates.value = templateResult.value.data; if (ruleResult.status === 'fulfilled' && ruleResult.value.success) rules.value = ruleResult.value.data; });
</script>
<style scoped lang="scss">
.settings-home { max-width: 1180px; margin: 0 auto; padding: 4px 0 20px; }
.settings-layout { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 16px; }
.settings-nav { height: fit-content; .nav-title { padding: 4px 8px 12px; font-weight: 600; } :deep(.el-menu) { border-right: 0; } }
.settings-overview { .overview-head { padding-bottom: 12px; border-bottom: 1px solid $ui-border-color-light; h3 { margin: 0; font-size: 16px; } p { margin: 6px 0 0; color: $ui-gray-500; font-size: 13px; } } }
.setting-summary { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 4px; border-bottom: 1px solid $ui-border-color-light; cursor: pointer; &:last-child { border: 0; } &:hover strong { color: $ui-color-primary; } p { margin: 5px 0 0; color: $ui-gray-500; font-size: 13px; } }
@media (max-width: 760px) { .settings-layout { grid-template-columns: 1fr; } .settings-nav :deep(.el-menu) { display: flex; overflow-x: auto; } }
</style>
