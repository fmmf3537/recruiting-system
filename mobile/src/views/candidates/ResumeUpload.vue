<template>
  <div class="form-page">
    <van-nav-bar title="上传简历" left-arrow fixed placeholder @click-left="$router.back()" />

    <div class="upload-content">
      <van-uploader
        v-model="fileList"
        :max-count="1"
        :after-read="afterRead as any"
        accept=".pdf,.doc,.docx,image/*"
      />
      <p class="tip">支持 PDF、Word、JPG、PNG 格式，最大 10MB</p>

      <div v-if="uploadedUrl" class="preview-area">
        <van-button plain block type="primary" @click="previewFile">
          预览已上传文件
        </van-button>
      </div>

      <div class="submit-area safe-bottom">
        <van-button round block type="primary" :loading="submitting" @click="onSubmit">
          确认上传
        </van-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast, showImagePreview } from 'vant';
import { uploadFile } from '@/api/upload';
import { updateCandidate } from '@/api/candidates';
import { isFeishu, openDocument } from '@/lib/feishu';

const route = useRoute();
const router = useRouter();
const candidateId = route.params.id as string;

const fileList = ref<any[]>([]);
const submitting = ref(false);
const uploadedUrl = ref('');

async function afterRead(fileItem: any | any[]) {
  const item = Array.isArray(fileItem) ? fileItem[0] : fileItem;
  if (!item.file) return;
  try {
    const res = await uploadFile(item.file as File);
    if (res.success) {
      uploadedUrl.value = res.data.url;
      showToast('上传成功');
    }
  } catch {
    showToast('上传失败');
  }
}

function previewFile() {
  if (!uploadedUrl.value) return;
  if (isFeishu()) {
    openDocument(uploadedUrl.value).catch(() => {
      showToast('打开文档失败');
    });
    return;
  }
  const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(uploadedUrl.value);
  if (isImage) {
    showImagePreview([uploadedUrl.value]);
  } else {
    window.open(uploadedUrl.value, '_blank');
  }
}

async function onSubmit() {
  if (!uploadedUrl.value) {
    showToast('请先选择文件');
    return;
  }
  submitting.value = true;
  try {
    await updateCandidate(candidateId, { resumeUrl: uploadedUrl.value });
    showToast('简历已保存');
    router.back();
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.form-page {
  min-height: 100%;
  background-color: #f7f8fa;
}

.upload-content {
  padding: 24px 16px;
}

.tip {
  font-size: 12px;
  color: #999;
  margin-top: 12px;
}

.submit-area {
  margin-top: 24px;
}

.safe-bottom {
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
}

.preview-area {
  margin-top: 16px;
}
</style>
