<template>
  <el-dialog
    v-model="visible"
    title="上传简历"
    width="500px"
    :close-on-click-modal="false"
  >
    <div class="upload-area" v-if="!parsedData">
      <el-upload
        ref="uploadRef"
        class="resume-uploader"
        drag
        :auto-upload="false"
        :limit="1"
        :on-change="handleFileChange"
        :on-remove="handleFileRemove"
        accept=".pdf,.docx"
      >
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">
          拖拽文件到此处或 <em>点击上传</em>
        </div>
        <template #tip>
          <div class="el-upload__tip">支持 PDF、DOCX 格式，文件大小不超过 10MB</div>
        </template>
      </el-upload>

      <div class="upload-actions">
        <el-button @click="handleCancel">取消</el-button>
        <el-button
          type="primary"
          :loading="uploading"
          :disabled="!selectedFile"
          @click="handleParse"
        >
          解析简历
        </el-button>
      </div>
    </div>

    <div class="parse-result" v-else>
      <el-descriptions title="解析结果" :column="1" border>
        <el-descriptions-item label="姓名">{{ parsedData.name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="手机号">{{ parsedData.phone || '-' }}</el-descriptions-item>
        <el-descriptions-item label="邮箱">{{ parsedData.email || '-' }}</el-descriptions-item>
        <el-descriptions-item label="性别">{{ parsedData.gender || '-' }}</el-descriptions-item>
        <el-descriptions-item label="年龄">{{ parsedData.age || '-' }}</el-descriptions-item>
        <el-descriptions-item label="工作年限">{{ parsedData.workYears || '-' }}</el-descriptions-item>
        <el-descriptions-item label="学历">{{ parsedData.education || '-' }}</el-descriptions-item>
        <el-descriptions-item label="毕业院校">{{ parsedData.school || '-' }}</el-descriptions-item>
        <el-descriptions-item label="当前公司">{{ parsedData.currentCompany || '-' }}</el-descriptions-item>
        <el-descriptions-item label="当前职位">{{ parsedData.currentPosition || '-' }}</el-descriptions-item>
        <el-descriptions-item label="期望薪资">{{ parsedData.expectedSalary || '-' }}</el-descriptions-item>
        <el-descriptions-item label="技能">
          <el-tag v-for="skill in parsedData.skills" :key="skill" size="small" class="skill-tag">
            {{ skill }}
          </el-tag>
          <span v-if="!parsedData.skills?.length">-</span>
        </el-descriptions-item>
      </el-descriptions>

      <div class="work-history-section" v-if="parsedData.workHistory?.length">
        <h4>工作经历</h4>
        <el-timeline>
          <el-timeline-item
            v-for="(item, index) in parsedData.workHistory"
            :key="index"
            :timestamp="formatDateRange(item.startDate, item.endDate)"
            placement="top"
          >
            <el-card>
              <h5>{{ item.company }} - {{ item.position }}</h5>
              <p v-if="item.description">{{ item.description }}</p>
            </el-card>
          </el-timeline-item>
        </el-timeline>
      </div>

      <div class="result-actions">
        <el-button @click="handleBack">重新上传</el-button>
        <el-button type="primary" @click="handleConfirm">填充到表单</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { UploadFilled } from '@element-plus/icons-vue';
import { parseResume, type ResumeParseResult } from '@/api/candidate';

const visible = defineModel<boolean>({ default: false });

const emit = defineEmits<{
  (e: 'confirm', data: ResumeParseResult): void;
}>();

const selectedFile = ref<File | null>(null);
const uploading = ref(false);
const parsedData = ref<ResumeParseResult | null>(null);
const uploadRef = ref();

function handleFileChange(file: any) {
  selectedFile.value = file.raw;
}

function handleFileRemove() {
  selectedFile.value = null;
}

async function handleParse() {
  if (!selectedFile.value) {
    ElMessage.warning('请选择简历文件');
    return;
  }

  uploading.value = true;
  try {
    const res = await parseResume(selectedFile.value);
    if (res.success && res.data) {
      parsedData.value = res.data;
    } else {
      ElMessage.error(res.message || '简历解析失败');
    }
  } catch (error: any) {
    ElMessage.error(error.message || '简历解析失败');
  } finally {
    uploading.value = false;
  }
}

function handleBack() {
  parsedData.value = null;
  selectedFile.value = null;
  uploadRef.value?.clearFiles();
}

function handleCancel() {
  handleBack();
  visible.value = false;
}

function handleConfirm() {
  if (parsedData.value) {
    emit('confirm', parsedData.value);
  }
  visible.value = false;
  handleBack();
}

function formatDateRange(start?: string, end?: string): string {
  if (!start && !end) return '时间不详';
  const startStr = start ? start.substring(0, 7) : '';
  const endStr = end ? end.substring(0, 7) : '至今';
  if (startStr && endStr) {
    return `${startStr} ~ ${endStr}`;
  }
  return startStr || endStr || '时间不详';
}
</script>

<style scoped lang="scss">
.upload-area {
  padding: 20px 0;
}

.resume-uploader {
  :deep(.el-upload) {
    width: 100%;
  }
  :deep(.el-upload-dragger) {
    width: 100%;
    padding: 40px 20px;
  }
}

.el-icon--upload {
  font-size: 67px;
  color: #409eff;
  margin-bottom: 16px;
}

.el-upload__tip {
  color: #909399;
  font-size: 12px;
  margin-top: 8px;
}

.upload-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}

.parse-result {
  padding: 10px 0;
}

.skill-tag {
  margin-right: 8px;
  margin-bottom: 4px;
}

.work-history-section {
  margin-top: 20px;

  h4 {
    margin-bottom: 12px;
    color: #303133;
  }

  h5 {
    margin: 0 0 8px;
    color: #303133;
  }

  p {
    margin: 0;
    color: #606266;
    font-size: 14px;
  }
}

.result-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #ebeef5;
}
</style>
