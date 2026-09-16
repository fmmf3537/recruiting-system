<template>
  <div class="settings-home">
    <div class="page-header"><div><h2 class="page-title">设置中心</h2><span class="page-subtitle">统一管理招聘流程、字典、自动化和智能能力</span></div></div>
    <el-row :gutter="16">
      <el-col v-for="item in items" :key="item.path" :xs="24" :sm="12" :lg="8"><el-card shadow="never" class="setting-card" @click="router.push(item.path)"><h3>{{ item.title }}</h3><p>{{ item.description }}</p><el-button link type="primary">进入设置 →</el-button></el-card></el-col>
    </el-row>
  </div>
</template>
<script setup lang="ts">
import { useRouter } from 'vue-router';
const router = useRouter();
const items = [{ path: '/settings/dictionary', title: '字典管理', description: '维护来源、部门、地点和技能选项' }, { path: '/settings/pipeline-templates', title: '流程模板', description: '按职位类型配置招聘阶段' }, { path: '/settings/automation-rules', title: '自动化邮件', description: '配置阶段流转时的邮件规则' }, { path: '/settings/ai', title: 'AI 设置', description: '管理简历解析与智能匹配能力' }, { path: '/settings/tags', title: '标签管理', description: '维护候选人与职位标签' }, { path: '/settings/agencies', title: '猎头机构', description: '管理外部招聘渠道与合作机构' }];
</script>
<style scoped lang="scss">.settings-home{padding:20px}.page-header{margin-bottom:20px}.page-title{margin:0;font-size:24px;font-weight:500}.page-subtitle{display:block;margin-top:6px;color:$ui-gray-500;font-size:$ui-font-md}.setting-card{height:150px;margin-bottom:16px;cursor:pointer}.setting-card h3{margin:0 0 8px;font-size:16px}.setting-card p{height:35px;color:$ui-gray-500;font-size:13px}</style>
