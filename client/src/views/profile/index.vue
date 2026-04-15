<template>
  <div class="profile-page">
    <h1 class="page-title">个人中心</h1>

    <el-row :gutter="20">
      <!-- 左侧：个人信息卡片 -->
      <el-col :xs="24" :md="8">
        <el-card shadow="never" class="profile-card">
          <div class="profile-header">
            <el-avatar :size="100" :icon="UserFilled" />
            <h3 class="user-name">{{ userInfo?.name }}</h3>
            <el-tag :type="userInfo?.role === 'admin' ? 'danger' : 'info'" size="large">
              {{ userInfo?.role === 'admin' ? '管理员' : '成员' }}
            </el-tag>
            <p class="join-date">加入时间：{{ formatDate(userInfo?.createdAt) }}</p>
          </div>

          <el-divider />

          <div class="contact-info">
            <div class="contact-item">
              <el-icon><Message /></el-icon>
              <span>{{ userInfo?.email }}</span>
            </div>
          </div>

          <el-divider />

          <div class="profile-actions">
            <el-button type="primary" @click="handleEditProfile">
              <el-icon><Edit /></el-icon>编辑资料
            </el-button>
            <el-button @click="handleChangePassword">
              <el-icon><Lock /></el-icon>修改密码
            </el-button>
          </div>
        </el-card>

        <!-- 快捷入口 -->
        <el-card shadow="never" class="quick-links" style="margin-top: 20px;">
          <template #header>
            <span>快捷入口</span>
          </template>
          <div class="link-list">
            <el-button text @click="goTo('/candidates')">
              <el-icon><User /></el-icon>我的候选人
            </el-button>
            <el-button text @click="goTo('/jobs')">
              <el-icon><Briefcase /></el-icon>职位管理
            </el-button>
            <el-button text @click="goTo('/offers')">
              <el-icon><DocumentChecked /></el-icon>Offer管理
            </el-button>
          </div>
        </el-card>
      </el-col>

      <!-- 右侧：统计和设置 -->
      <el-col :xs="24" :md="16">
        <!-- 工作统计 -->
        <el-row :gutter="20" class="stats-row">
          <el-col :span="8">
            <el-card shadow="hover" class="stat-card">
              <div class="stat-value">{{ myStats.newCandidates }}</div>
              <div class="stat-label">新增候选人</div>
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card shadow="hover" class="stat-card">
              <div class="stat-value">{{ myStats.interviews }}</div>
              <div class="stat-label">面试次数</div>
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card shadow="hover" class="stat-card">
              <div class="stat-value">{{ myStats.offers }}</div>
              <div class="stat-label">发放Offer</div>
            </el-card>
          </el-col>
        </el-row>

        <!-- 最近活动 -->
        <el-card shadow="never" class="activity-card" style="margin-top: 20px;">
          <template #header>
            <div class="card-header">
              <span>最近活动</span>
              <el-button link type="primary" @click="refreshActivity">刷新</el-button>
            </div>
          </template>
          <el-timeline v-if="recentActivities.length">
            <el-timeline-item
              v-for="activity in recentActivities"
              :key="activity.id"
              :type="activity.type"
              :timestamp="activity.time"
            >
              {{ activity.content }}
            </el-timeline-item>
          </el-timeline>
          <el-empty v-else description="暂无活动记录" />
        </el-card>

        <!-- 系统设置 -->
        <el-card shadow="never" class="settings-card" style="margin-top: 20px;">
          <template #header>
            <span>系统设置</span>
          </template>
          <div class="setting-list">
            <div class="setting-item">
              <div class="setting-info">
                <span class="setting-title">邮件通知</span>
                <span class="setting-desc">接收候选人状态变更邮件</span>
              </div>
              <el-switch v-model="settings.emailNotification" @change="saveSettings" />
            </div>
            <div class="setting-item">
              <div class="setting-info">
                <span class="setting-title">面试提醒</span>
                <span class="setting-desc">面试前30分钟提醒</span>
              </div>
              <el-switch v-model="settings.interviewReminder" @change="saveSettings" />
            </div>
            <div class="setting-item">
              <div class="setting-info">
                <span class="setting-title">暗黑模式</span>
                <span class="setting-desc">切换系统主题</span>
              </div>
              <el-switch v-model="settings.darkMode" @change="toggleDarkMode" />
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 编辑资料对话框 -->
    <el-dialog v-model="editDialogVisible" title="编辑个人资料" width="500px">
      <el-form ref="editFormRef" :model="editForm" :rules="editRules" label-width="80px">
        <el-form-item label="姓名" prop="name">
          <el-input v-model="editForm.name" maxlength="50" show-word-limit />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="editForm.email" disabled />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleEditSubmit" :loading="editSubmitting">保存</el-button>
      </template>
    </el-dialog>

    <!-- 修改密码对话框 -->
    <el-dialog v-model="passwordDialogVisible" title="修改密码" width="500px">
      <el-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules" label-width="100px">
        <el-form-item label="当前密码" prop="oldPassword">
          <el-input v-model="passwordForm.oldPassword" type="password" show-password placeholder="请输入当前密码" />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="passwordForm.newPassword" type="password" show-password placeholder="请输入新密码" />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input v-model="passwordForm.confirmPassword" type="password" show-password placeholder="请再次输入新密码" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handlePasswordSubmit" :loading="passwordSubmitting">确认修改</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onActivated } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import {
  UserFilled,
  Message,
  Edit,
  Lock,
  User,
  Briefcase,
  DocumentChecked,
} from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';
import { getWorkloadStats } from '@/api/stats';
import { updateUser, changePassword } from '@/api/user';

const router = useRouter();
const authStore = useAuthStore();

const userInfo = computed(() => authStore.userInfo);

// ============ 统计数据 ============
const myStats = reactive({
  newCandidates: 0,
  interviews: 0,
  offers: 0,
});

// ============ 最近活动 ============
const recentActivities = ref([
  { id: '1', type: 'primary' as const, content: '创建了候选人 张三', time: '10分钟前' },
  { id: '2', type: 'success' as const, content: '完成了初试面试', time: '1小时前' },
  { id: '3', type: 'warning' as const, content: '更新了候选人 李四 的状态', time: '2小时前' },
  { id: '4', type: 'primary' as const, content: '发布了新职位 前端工程师', time: '昨天' },
]);

// ============ 设置 ============
const settings = reactive({
  emailNotification: true,
  interviewReminder: true,
  darkMode: false,
});

// ============ 编辑资料 ============
const editDialogVisible = ref(false);
const editSubmitting = ref(false);
const editFormRef = ref<FormInstance>();
const editForm = reactive({
  name: '',
  email: '',
});
const editRules: FormRules = {
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
};

// ============ 修改密码 ============
const passwordDialogVisible = ref(false);
const passwordSubmitting = ref(false);
const passwordFormRef = ref<FormInstance>();
const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
});

const passwordRules: FormRules = {
  oldPassword: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码长度至少6位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    {
      validator: (rule: any, value: string, callback: Function) => {
        if (value !== passwordForm.newPassword) {
          callback(new Error('两次输入的密码不一致'));
        } else {
          callback();
        }
      },
      trigger: 'blur',
    },
  ],
};

// ============ 方法 ============
function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

function goTo(path: string) {
  router.push(path);
}

async function fetchMyStats() {
  try {
    const res = await getWorkloadStats();
    if (res.success && userInfo.value) {
      const myData = res.data.find(item => item.userId === userInfo.value?.id);
      if (myData) {
        myStats.newCandidates = myData.newCandidates;
        myStats.interviews = myData.interviews;
        myStats.offers = myData.offers;
      }
    }
  } catch (error) {
    console.error('获取统计数据失败:', error);
  }
}

function refreshActivity() {
  ElMessage.success('活动记录已刷新');
}

function saveSettings() {
  localStorage.setItem('user_settings', JSON.stringify(settings));
  ElMessage.success('设置已保存');
}

function toggleDarkMode() {
  document.documentElement.classList.toggle('dark', settings.darkMode);
  saveSettings();
}

function handleEditProfile() {
  if (!userInfo.value) return;
  editForm.name = userInfo.value.name;
  editForm.email = userInfo.value.email;
  editDialogVisible.value = true;
}

async function handleEditSubmit() {
  if (!userInfo.value) return;
  const valid = await editFormRef.value?.validate().catch(() => false);
  if (!valid) return;

  editSubmitting.value = true;
  try {
    const res = await updateUser(userInfo.value.id, { name: editForm.name });
    if (res.success) {
      ElMessage.success('资料更新成功');
      editDialogVisible.value = false;
      // 更新本地用户信息
      authStore.setUserInfo({ ...userInfo.value, name: editForm.name });
    }
  } catch (error: any) {
    ElMessage.error(error.message || '更新失败');
  } finally {
    editSubmitting.value = false;
  }
}

function handleChangePassword() {
  passwordForm.oldPassword = '';
  passwordForm.newPassword = '';
  passwordForm.confirmPassword = '';
  passwordDialogVisible.value = true;
}

async function handlePasswordSubmit() {
  const valid = await passwordFormRef.value?.validate().catch(() => false);
  if (!valid) return;

  passwordSubmitting.value = true;
  try {
    await changePassword({
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword,
    });
    ElMessage.success('密码修改成功');
    passwordDialogVisible.value = false;
    passwordForm.oldPassword = '';
    passwordForm.newPassword = '';
    passwordForm.confirmPassword = '';
  } catch (error: any) {
    ElMessage.error(error.message || '修改失败');
  } finally {
    passwordSubmitting.value = false;
  }
}

// 加载保存的设置
function loadSettings() {
  const saved = localStorage.getItem('user_settings');
  if (saved) {
    const parsed = JSON.parse(saved);
    Object.assign(settings, parsed);
    if (settings.darkMode) {
      document.documentElement.classList.add('dark');
    }
  }
}

onMounted(() => {
  loadSettings();
  fetchMyStats();
});
onActivated(() => {
  loadSettings();
  fetchMyStats();
});
</script>

<style scoped lang="scss">
.profile-page {
  padding: 20px;

  .page-title {
    margin: 0 0 24px;
    font-size: 24px;
    font-weight: 500;
    color: #303133;
  }

  .profile-card {
    .profile-header {
      text-align: center;
      padding: 20px 0;

      .user-name {
        margin: 16px 0 8px;
        font-size: 20px;
        font-weight: 500;
      }

      .join-date {
        margin: 12px 0 0;
        font-size: 13px;
        color: #909399;
      }
    }

    .contact-info {
      padding: 0 20px;

      .contact-item {
        display: flex;
        align-items: center;
        gap: 12px;
        color: #606266;
        font-size: 14px;

        .el-icon {
          color: #909399;
        }
      }
    }

    .profile-actions {
      padding: 0 20px 20px;
      display: flex;
      flex-direction: column;
      gap: 10px;

      .el-button {
        margin: 0;
      }
    }
  }

  .quick-links {
    .link-list {
      display: flex;
      flex-direction: column;

      .el-button {
        justify-content: flex-start;
        padding: 12px;
        margin: 0;

        .el-icon {
          margin-right: 8px;
        }
      }
    }
  }

  .stats-row {
    .stat-card {
      text-align: center;
      padding: 20px 0;

      .stat-value {
        font-size: 32px;
        font-weight: 600;
        color: #409eff;
        margin-bottom: 8px;
      }

      .stat-label {
        font-size: 14px;
        color: #909399;
      }
    }
  }

  .activity-card,
  .settings-card {
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  }

  .settings-card {
    .setting-list {
      .setting-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 0;
        border-bottom: 1px solid #ebeef5;

        &:last-child {
          border-bottom: none;
        }

        .setting-info {
          display: flex;
          flex-direction: column;

          .setting-title {
            font-size: 14px;
            font-weight: 500;
            color: #303133;
            margin-bottom: 4px;
          }

          .setting-desc {
            font-size: 12px;
            color: #909399;
          }
        }
      }
    }
  }
}
</style>
