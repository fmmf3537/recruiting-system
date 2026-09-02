<!--
  F5-C 猎头推荐公开落地页
  外部猎头用户唯一可见的页面（不带系统布局与导航）
  路由：/referral/:token（meta.public = true）
-->
<template>
  <div class="referral-page">
    <div class="referral-container">
      <!-- 品牌头 -->
      <div class="referral-header">
        <h1 class="title">辰航卓越 · 人才推荐</h1>
        <p class="subtitle">Cenhang Excellence · Talent Referral</p>
      </div>

      <!-- 视图 1：加载中 -->
      <el-card v-if="view === 'loading'" class="referral-card" shadow="always">
        <div class="state-loading">
          <el-icon class="is-loading"><Loading /></el-icon>
          <p>正在加载推荐信息…</p>
        </div>
      </el-card>

      <!-- 视图 2：链接失效 -->
      <el-card v-else-if="view === 'invalid'" class="referral-card" shadow="always">
        <el-result icon="error" title="链接已失效" sub-title="请与您的对接 HR 取得联系，获取最新的推荐链接。">
          <template #extra>
            <p class="invalid-hint">推荐链接可能已过期、被停用或机构已停用。</p>
          </template>
        </el-result>
      </el-card>

      <!-- 视图 3：正常表单 -->
      <el-card v-else-if="view === 'form'" class="referral-card" shadow="always">
        <div class="agency-info">
          <div class="info-row">
            <span class="info-label">推荐机构：</span>
            <span class="info-value">{{ referralInfo?.agencyName }}</span>
          </div>
          <div v-if="referralInfo?.jobTitle" class="info-row">
            <span class="info-label">推荐职位：</span>
            <span class="info-value">{{ referralInfo.jobTitle }}</span>
          </div>
          <div v-else class="info-row">
            <span class="info-label">推荐类型：</span>
            <span class="info-value">通用推荐（不限职位）</span>
          </div>
        </div>

        <el-form
          ref="formRef"
          :model="formData"
          :rules="formRules"
          label-width="100px"
          label-position="top"
        >
          <el-form-item label="候选人姓名" prop="name">
            <el-input
              v-model="formData.name"
              placeholder="请输入候选人姓名"
              maxlength="30"
              show-word-limit
              clearable
            />
          </el-form-item>

          <el-form-item label="候选人手机号" prop="phone">
            <el-input
              v-model="formData.phone"
              placeholder="请输入11位手机号"
              maxlength="11"
              clearable
            />
          </el-form-item>

          <el-form-item label="候选人邮箱" prop="email">
            <el-input
              v-model="formData.email"
              placeholder="选填，便于 HR 与候选人取得联系"
              clearable
            />
          </el-form-item>

          <el-form-item label="推荐理由" prop="reason">
            <el-input
              v-model="formData.reason"
              type="textarea"
              :rows="4"
              placeholder="请简要说明候选人的核心优势（不超过 1000 字）"
              maxlength="1000"
              show-word-limit
            />
          </el-form-item>

          <el-form-item label="简历文件" prop="file">
            <el-upload
              v-model:file-list="fileList"
              :auto-upload="false"
              :limit="1"
              :on-change="handleFileChange"
              :on-remove="handleFileRemove"
              accept=".pdf,.doc,.docx"
            >
              <el-button>
                <el-icon><Upload /></el-icon>选择简历文件
              </el-button>
              <template #tip>
                <div class="el-upload__tip">支持 PDF / DOC / DOCX，单文件不超过 10MB</div>
              </template>
            </el-upload>
          </el-form-item>

          <el-form-item prop="consent">
            <el-checkbox v-model="formData.consent">
              我已获得候选人授权，同意将其信息提交至贵司招聘系统
            </el-checkbox>
          </el-form-item>

          <el-form-item>
            <el-button
              type="primary"
              size="large"
              :loading="submitting"
              class="submit-button"
              @click="handleSubmit"
            >
              提交推荐
            </el-button>
          </el-form-item>
        </el-form>
      </el-card>

      <!-- 视图 4：提交成功 -->
      <el-card v-else-if="view === 'success'" class="referral-card" shadow="always">
        <el-result icon="success" title="推荐已提交" sub-title="已提交，将由 HR 联系候选人">
          <template #extra>
            <p class="success-hint">推荐结果将以站内通知的形式发送给您的对接 HR。</p>
          </template>
        </el-result>
      </el-card>

      <div class="referral-footer">
        <p>© 2026 西安辰航卓越科技有限公司 - All Rights Reserved</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Loading, Upload } from '@element-plus/icons-vue';
import { BusinessError } from '@/types/error';
import { getReferralInfo, submitReferral, type ReferralInfo } from '@/api/agency';

const route = useRoute();
const token = route.params.token as string;

// ============ 视图状态机 ============
type ViewState = 'loading' | 'invalid' | 'form' | 'success';
const view = ref<ViewState>('loading');
const referralInfo = ref<ReferralInfo | null>(null);

// ============ 表单 ============
const formRef = ref<FormInstance>();
const submitting = ref(false);
const fileList = ref<Array<{ name: string; size: number; raw?: File }>>([]);
const formData = reactive({
  name: '',
  phone: '',
  email: '',
  reason: '',
  consent: false,
});

// 校验规则与服务端 zod 对齐（server/src/routes/referral.ts submitBodySchema）
const formRules: FormRules = {
  name: [
    { required: true, message: '请输入候选人姓名', trigger: 'blur' },
    { min: 2, max: 30, message: '姓名长度为 2-30 个字符', trigger: 'blur' },
  ],
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (!value) {
          callback(new Error('请输入手机号'));
          return;
        }
        if (!/^1[3-9]\d{9}$/.test(value)) {
          callback(new Error('手机号格式不正确'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
  email: [
    {
      validator: (_rule, value, callback) => {
        if (!value) {
          callback();
          return;
        }
        // 简易 email 校验（前端），与服务端 zod .email() 行为对齐
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          callback(new Error('邮箱格式不正确'));
          return;
        }
        callback();
      },
      trigger: 'blur',
    },
  ],
  reason: [{ max: 1000, message: '推荐理由不超过 1000 字', trigger: 'blur' }],
  consent: [
    {
      validator: (_rule, value, callback) => {
        if (!value) {
          callback(new Error('请确认已获得候选人授权'));
          return;
        }
        callback();
      },
      trigger: 'change',
    },
  ],
};

// ============ 文件处理 ============
const ALLOWED_EXT = ['.pdf', '.doc', '.docx'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

function handleFileChange(file: { name: string; size: number; raw?: File }) {
  const lowerName = file.name.toLowerCase();
  const extOk = ALLOWED_EXT.some((ext) => lowerName.endsWith(ext));
  if (!extOk) {
    ElMessage.error('仅支持 PDF / DOC / DOCX 格式');
    fileList.value = [];
    return;
  }
  if (file.size > MAX_SIZE) {
    ElMessage.error('文件过大，单文件不超过 10MB');
    fileList.value = [];
    return;
  }
  fileList.value = [file];
}

function handleFileRemove() {
  fileList.value = [];
}

// ============ 加载推荐信息 ============
async function loadReferralInfo(t: string) {
  view.value = 'loading';
  try {
    const res = await getReferralInfo(t);
    if (res.success) {
      referralInfo.value = res.data;
      view.value = 'form';
    } else {
      view.value = 'invalid';
    }
  } catch (error: unknown) {
    // 410 链接失效：拦截器已 toast 一页「链接已失效」，此处同时切 invalid 视图（双重表现 §3.2-3）
    if (error instanceof BusinessError && error.statusCode === 410) {
      view.value = 'invalid';
      return;
    }
    // 其他错误也归 invalid（网络错误由拦截器 toast，页面保持 invalid）
    view.value = 'invalid';
  }
}

// ============ 提交 ============
async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  if (!fileList.value.length || !fileList.value[0].raw) {
    ElMessage.error('请上传简历文件');
    return;
  }
  const file = fileList.value[0].raw;
  submitting.value = true;
  try {
    const res = await submitReferral(
      token,
      {
        name: formData.name,
        phone: formData.phone,
        email: formData.email || undefined,
        reason: formData.reason || undefined,
      },
      file
    );
    if (res.success) {
      view.value = 'success';
    }
  } catch {
    // 错误提示已在 request 拦截器统一处理（含 400 文案如「请确认已获得候选人授权」），此处不重复弹
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  loadReferralInfo(token);
});
</script>

<style scoped lang="scss">
.referral-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
  box-sizing: border-box;
}

.referral-container {
  width: 560px;
  max-width: 100%;
  z-index: 1;
}

.referral-header {
  text-align: center;
  margin-bottom: 24px;

  .title {
    font-size: 28px;
    font-weight: 600;
    color: #ffffff;
    margin: 0 0 8px;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .subtitle {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.85);
    margin: 0;
  }
}

.referral-card {
  border-radius: 12px;
  border: none;
  backdrop-filter: blur(10px);
  background: rgba(255, 255, 255, 0.97);

  :deep(.el-card__body) {
    padding: 32px;
  }
}

.state-loading {
  text-align: center;
  padding: 40px 0;
  color: #909399;

  .el-icon {
    font-size: 32px;
    margin-bottom: 12px;
  }

  p {
    margin: 0;
    font-size: 14px;
  }
}

.agency-info {
  background-color: #f0f9ff;
  border-left: 4px solid #409eff;
  padding: 12px 16px;
  border-radius: 4px;
  margin-bottom: 24px;

  .info-row {
    display: flex;
    font-size: 14px;
    line-height: 1.8;

    .info-label {
      color: #606266;
      min-width: 88px;
    }

    .info-value {
      color: #303133;
      font-weight: 500;
    }
  }
}

.submit-button {
  width: 100%;
  height: 44px;
  font-size: 16px;
  border-radius: 8px;
}

.invalid-hint,
.success-hint {
  color: #909399;
  font-size: 13px;
  margin: 0;
}

.referral-footer {
  margin-top: 20px;
  text-align: center;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;

  p {
    margin: 0;
  }
}

:deep(.el-input__wrapper),
:deep(.el-textarea__inner) {
  border-radius: 6px;
}
</style>