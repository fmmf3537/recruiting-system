<template>
  <div class="users-page">
    <!-- 页面标题栏 -->
    <div class="page-header">
      <div class="title-section">
        <h2 class="page-title">成员管理</h2>
        <span class="page-subtitle">管理系统成员账号及权限</span>
      </div>
      <el-button type="primary" @click="handleAdd" v-if="authStore.isAdmin">
        <el-icon><Plus /></el-icon>新增成员
      </el-button>
    </div>

    <!-- 数据表格 -->
    <el-card class="table-card" v-loading="loading">
      <el-table
        :data="userList"
        stripe
        style="width: 100%"
        @sort-change="handleSortChange"
      >
        <el-table-column type="index" label="序号" width="80" align="center" />
        
        <el-table-column prop="name" label="姓名" min-width="120" sortable="custom">
          <template #default="{ row }">
            <div class="user-name">
              <el-avatar :size="32" :icon="UserFilled" />
              <span>{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>

        <el-table-column prop="email" label="邮箱" min-width="200" show-overflow-tooltip />

        <el-table-column prop="role" label="角色" width="120" align="center">
          <template #default="{ row }">
            <el-tag
              :type="row.role === 'admin' ? 'danger' : 'info'"
              class="role-tag"
              @click="handleRoleChange(row)"
              style="cursor: pointer"
            >
              {{ row.role === 'admin' ? '管理员' : '成员' }}
            </el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="createdAt" label="创建时间" width="180" sortable="custom">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>

        <el-table-column label="操作" width="180" fixed="right" v-if="authStore.isAdmin">
          <template #default="{ row }">
            <el-button
              type="primary"
              link
              size="small"
              @click="handleEdit(row)"
            >
              编辑
            </el-button>
            <el-button
              type="danger"
              link
              size="small"
              @click="handleDelete(row)"
              :disabled="row.id === authStore.userInfo?.id"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="pagination.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handlePageChange"
        />
      </div>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑成员' : '新增成员'"
      width="500px"
      destroy-on-close
    >
      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="80px"
        class="user-form"
      >
        <el-form-item label="姓名" prop="name">
          <el-input
            v-model="formData.name"
            placeholder="请输入姓名"
            maxlength="50"
            show-word-limit
          />
        </el-form-item>

        <el-form-item label="邮箱" prop="email">
          <el-input
            v-model="formData.email"
            placeholder="请输入邮箱"
            :disabled="isEdit"
          />
        </el-form-item>

        <el-form-item label="密码" prop="password" v-if="!isEdit">
          <el-input
            v-model="formData.password"
            type="password"
            placeholder="请输入密码"
            show-password
          />
        </el-form-item>

        <el-form-item label="密码" prop="password" v-else>
          <el-input
            v-model="formData.password"
            type="password"
            placeholder="不修改请留空"
            show-password
          />
          <span class="form-tip">留空表示不修改密码</span>
        </el-form-item>

        <el-form-item label="角色" prop="role">
          <el-select v-model="formData.role" placeholder="请选择角色" style="width: 100%">
            <el-option label="管理员" value="admin">
              <span style="color: #f56c6c">●</span> 管理员
            </el-option>
            <el-option label="成员" value="member">
              <span style="color: #909399">●</span> 成员
            </el-option>
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">
          {{ isEdit ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 角色切换确认弹窗 -->
    <el-dialog
      v-model="roleDialogVisible"
      title="切换角色"
      width="400px"
    >
      <p>
        确定要将 <strong>{{ currentUser?.name }}</strong> 的角色切换为
        <strong>{{ currentUser?.role === 'admin' ? '成员' : '管理员' }}</strong> 吗？
      </p>
      <template #footer>
        <el-button @click="roleDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmRoleChange" :loading="roleSubmitting">
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onActivated } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, UserFilled } from '@element-plus/icons-vue';
import { useAuthStore } from '@/stores/auth';
import {
  getUserList,
  createUser,
  updateUser,
  deleteUser,
  type UserItem,
  type CreateUserParams,
  type UpdateUserParams,
} from '@/api/user';

// Store
const authStore = useAuthStore();

// 表格数据
const loading = ref(false);
const userList = ref<UserItem[]>([]);
const pagination = reactive({
  page: 1,
  pageSize: 10,
  total: 0,
});

// 弹窗控制
const dialogVisible = ref(false);
const isEdit = ref(false);
const submitting = ref(false);
const currentUserId = ref<string>('');

// 表单
const formRef = ref();
const formData = reactive<CreateUserParams & { id?: string }>({
  name: '',
  email: '',
  password: '',
  role: 'member',
});

// 表单验证规则
const formRules = {
  name: [
    { required: true, message: '请输入姓名', trigger: 'blur' },
    { min: 2, max: 50, message: '姓名长度为2-50个字符', trigger: 'blur' },
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' },
  ],
  password: [
    { required: !isEdit.value, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码长度至少6位', trigger: 'blur' },
  ],
  role: [
    { required: true, message: '请选择角色', trigger: 'change' },
  ],
};

// 角色切换
const roleDialogVisible = ref(false);
const roleSubmitting = ref(false);
const currentUser = ref<UserItem | null>(null);

// 获取用户列表
async function fetchUserList() {
  loading.value = true;
  try {
    const res = await getUserList({
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
    if (res.success) {
      userList.value = res.data;
      pagination.total = res.pagination.total;
    }
  } catch (error) {
    console.error('获取用户列表失败:', error);
  } finally {
    loading.value = false;
  }
}

// 分页处理
function handlePageChange(page: number) {
  pagination.page = page;
  fetchUserList();
}

function handleSizeChange(size: number) {
  pagination.pageSize = size;
  pagination.page = 1;
  fetchUserList();
}

// 排序处理
function handleSortChange({ prop, order }: { prop: string; order: string | null }) {
  // 这里可以实现排序逻辑
  console.log('排序:', prop, order);
}

// 格式化日期
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// 新增
function handleAdd() {
  isEdit.value = false;
  currentUserId.value = '';
  formData.name = '';
  formData.email = '';
  formData.password = '';
  formData.role = 'member';
  dialogVisible.value = true;
}

// 编辑
function handleEdit(row: UserItem) {
  isEdit.value = true;
  currentUserId.value = row.id;
  formData.name = row.name;
  formData.email = row.email;
  formData.password = '';
  formData.role = row.role as 'admin' | 'member';
  dialogVisible.value = true;
}

// 提交表单
async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  submitting.value = true;
  try {
    if (isEdit.value) {
      // 编辑
      const updateData: UpdateUserParams = {
        name: formData.name,
        role: formData.role,
      };
      if (formData.password) {
        (updateData as any).password = formData.password;
      }
      const res = await updateUser(currentUserId.value, updateData);
      if (res.success) {
        ElMessage.success('修改成功');
        dialogVisible.value = false;
        fetchUserList();
      }
    } else {
      // 新增
      const res = await createUser(formData);
      if (res.success) {
        ElMessage.success('创建成功');
        dialogVisible.value = false;
        fetchUserList();
      }
    }
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败');
  } finally {
    submitting.value = false;
  }
}

// 删除
async function handleDelete(row: UserItem) {
  // 不能删除自己
  if (row.id === authStore.userInfo?.id) {
    ElMessage.warning('不能删除当前登录账号');
    return;
  }

  try {
    await ElMessageBox.confirm(
      `确定要删除成员 "${row.name}" 吗？删除后不可恢复。`,
      '确认删除',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    );

    const res = await deleteUser(row.id);
    if (res.success) {
      ElMessage.success('删除成功');
      fetchUserList();
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败');
    }
  }
}

// 角色切换点击
function handleRoleChange(row: UserItem) {
  // 不能修改自己的角色
  if (row.id === authStore.userInfo?.id) {
    ElMessage.warning('不能修改当前登录账号的角色');
    return;
  }

  currentUser.value = row;
  roleDialogVisible.value = true;
}

// 确认角色切换
async function confirmRoleChange() {
  if (!currentUser.value) return;

  roleSubmitting.value = true;
  try {
    const newRole = currentUser.value.role === 'admin' ? 'member' : 'admin';
    const res = await updateUser(currentUser.value.id, {
      role: newRole,
    });
    if (res.success) {
      ElMessage.success('角色切换成功');
      roleDialogVisible.value = false;
      fetchUserList();
    }
  } catch (error: any) {
    ElMessage.error(error.message || '角色切换失败');
  } finally {
    roleSubmitting.value = false;
  }
}

// 初始化
onMounted(() => {
  fetchUserList();
});
onActivated(() => {
  fetchUserList();
});
</script>

<style scoped lang="scss">
.users-page {
  padding: 20px;

  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;

    .title-section {
      .page-title {
        margin: 0;
        font-size: 24px;
        font-weight: 500;
        color: #303133;
      }

      .page-subtitle {
        margin-top: 8px;
        font-size: 14px;
        color: #909399;
      }
    }
  }

  .table-card {
    .user-name {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .role-tag {
      cursor: pointer;
      transition: all 0.3s;

      &:hover {
        opacity: 0.8;
      }
    }

    .pagination-wrapper {
      display: flex;
      justify-content: flex-end;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #ebeef5;
    }
  }

  .user-form {
    .form-tip {
      font-size: 12px;
      color: #909399;
      margin-top: 4px;
    }
  }
}
</style>
