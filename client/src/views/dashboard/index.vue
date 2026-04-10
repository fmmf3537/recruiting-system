<script setup lang="ts">
import { ref, onMounted } from 'vue';

interface StatCard {
  title: string;
  value: number;
  icon: string;
  color: string;
}

const stats = ref<StatCard[]>([
  { title: '开放职位', value: 12, icon: 'Briefcase', color: '#409eff' },
  { title: '候选人', value: 86, icon: 'User', color: '#67c23a' },
  { title: '待面试', value: 24, icon: 'Calendar', color: '#e6a23c' },
  { title: '本周入职', value: 5, icon: 'CircleCheck', color: '#f56c6c' },
]);

const recentInterviews = ref([
  { candidate: '张三', position: '前端工程师', time: '2024-01-15 10:00', status: 'scheduled' },
  { candidate: '李四', position: '后端工程师', time: '2024-01-15 14:00', status: 'confirmed' },
  { candidate: '王五', position: '产品经理', time: '2024-01-16 09:30', status: 'scheduled' },
]);

onMounted(() => {
  // 加载仪表盘数据
});
</script>

<template>
  <div class="dashboard-container">
    <h1 class="page-title">仪表盘</h1>

    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="6" v-for="item in stats" :key="item.title">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-content flex">
            <div class="stat-icon" :style="{ backgroundColor: item.color + '20', color: item.color }">
              <el-icon :size="32">
                <component :is="item.icon" />
              </el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value">{{ item.value }}</div>
              <div class="stat-title">{{ item.title }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 最近面试 -->
    <el-card class="recent-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span>即将开始的面试</span>
          <el-button text type="primary" @click="$router.push('/interviews')">
            查看全部
          </el-button>
        </div>
      </template>

      <el-table :data="recentInterviews" stripe>
        <el-table-column prop="candidate" label="候选人" />
        <el-table-column prop="position" label="职位" />
        <el-table-column prop="time" label="时间" />
        <el-table-column prop="status" label="状态">
          <template #default="{ row }">
            <el-tag v-if="row.status === 'scheduled'" type="info">待确认</el-tag>
            <el-tag v-else-if="row.status === 'confirmed'" type="success">已确认</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default>
            <el-button link type="primary">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped lang="scss">
.page-title {
  margin: 0 0 24px;
  font-size: 24px;
  font-weight: 500;
  color: #303133;
}

.stats-row {
  margin-bottom: 24px;
}

.stat-card {
  .stat-content {
    align-items: center;
  }

  .stat-icon {
    width: 64px;
    height: 64px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 16px;
  }

  .stat-value {
    font-size: 28px;
    font-weight: 600;
    color: #303133;
    line-height: 1.2;
  }

  .stat-title {
    font-size: 14px;
    color: #909399;
    margin-top: 4px;
  }
}

.recent-card {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
}
</style>
