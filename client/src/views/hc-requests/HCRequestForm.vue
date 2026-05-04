<template>
  <div class="hc-form-page">
    <div class="back-nav">
      <el-button link @click="$router.back()">
        <el-icon><ArrowLeft /></el-icon>返回
      </el-button>
    </div>

    <el-card class="form-card" v-loading="loading">
      <template #header>
        <h2>{{ isEdit ? '编辑申请' : '新建编制申请' }}</h2>
      </template>

      <el-form ref="formRef" :model="formData" :rules="formRules" label-width="100px" size="large">
        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="岗位名称" prop="title">
              <el-input v-model="formData.title" placeholder="如：高级前端工程师" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="需求部门" prop="department">
              <el-select v-model="formData.department" placeholder="请选择" style="width: 100%" filterable allow-create>
                <el-option v-for="item in deptOptions" :key="item.code" :label="item.name" :value="item.name" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="24">
          <el-col :span="8">
            <el-form-item label="职级" prop="level">
              <el-input v-model="formData.level" placeholder="如：P6、M2" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="需求人数" prop="headcount">
              <el-input-number v-model="formData.headcount" :min="1" :max="999" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="紧急程度" prop="urgency">
              <el-select v-model="formData.urgency" style="width: 100%">
                <el-option label="紧急" value="urgent" />
                <el-option label="普通" value="normal" />
                <el-option label="较低" value="low" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="期望到岗">
              <el-date-picker v-model="formData.expectedDate" type="date" placeholder="选择日期" style="width: 100%" value-format="YYYY-MM-DD" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="薪资下限">
              <el-input v-model="formData.salaryMin" placeholder="如：15k" />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="薪资上限">
              <el-input v-model="formData.salaryMax" placeholder="如：25k" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="24">
          <el-col :span="12">
            <el-form-item label="需求原因" prop="reason">
              <el-select v-model="formData.reason" style="width: 100%">
                <el-option label="新增编制" value="new" />
                <el-option label="替补离职" value="replacement" />
                <el-option label="业务扩编" value="expansion" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-form-item label="需求说明">
          <el-input v-model="formData.reasonNote" type="textarea" :rows="4" placeholder="详细说明用人需求（选填）" />
        </el-form-item>

        <div class="form-actions">
          <el-button type="primary" size="large" @click="handleSubmit" :loading="submitting" style="width: 100%">
            {{ isEdit ? '保存修改' : '创建申请' }}
          </el-button>
          <el-button size="large" @click="$router.back()" style="width: 100%; margin-top: 10px; margin-left: 0">取消</el-button>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { ArrowLeft } from '@element-plus/icons-vue';
import { useDictionaryStore } from '@/stores/dictionary';
import { createHCRequest, updateHCRequest, getHCRequestById, type CreateHCRequestParams } from '@/api/hc-request';

const route = useRoute();
const router = useRouter();
const dictionaryStore = useDictionaryStore();

const isEdit = computed(() => !!route.params.id);
const requestId = computed(() => route.params.id as string);

const loading = ref(false);
const submitting = ref(false);
const formRef = ref<FormInstance>();

const formData = reactive<CreateHCRequestParams>({
  title: '',
  department: '',
  level: '',
  headcount: 1,
  urgency: 'normal',
  expectedDate: '',
  salaryMin: '',
  salaryMax: '',
  reason: 'new',
  reasonNote: '',
});

const formRules: FormRules = {
  title: [{ required: true, message: '请输入岗位名称', trigger: 'blur' }],
  department: [{ required: true, message: '请选择需求部门', trigger: 'change' }],
  level: [{ required: true, message: '请输入职级', trigger: 'blur' }],
  headcount: [{ required: true, message: '请输入需求人数', trigger: 'blur' }],
  urgency: [{ required: true, message: '请选择紧急程度', trigger: 'change' }],
  reason: [{ required: true, message: '请选择需求原因', trigger: 'change' }],
};

const deptOptions = computed(() => dictionaryStore.departmentOptions || []);

async function fetchDetail() {
  loading.value = true;
  try {
    const res = await getHCRequestById(requestId.value);
    if (res.success) {
      const d = res.data;
      Object.assign(formData, {
        title: d.title,
        department: d.department,
        level: d.level,
        headcount: d.headcount,
        urgency: d.urgency,
        expectedDate: d.expectedDate || '',
        salaryMin: d.salaryMin || '',
        salaryMax: d.salaryMax || '',
        reason: d.reason,
        reasonNote: d.reasonNote || '',
      });
    }
  } catch {
    ElMessage.error('加载失败');
    router.back();
  } finally {
    loading.value = false;
  }
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  submitting.value = true;
  try {
    const data: any = { ...formData };
    if (!data.expectedDate) data.expectedDate = undefined;
    if (!data.salaryMin) data.salaryMin = undefined;
    if (!data.salaryMax) data.salaryMax = undefined;

    if (isEdit.value) {
      await updateHCRequest(requestId.value, data);
      ElMessage.success('申请已更新');
    } else {
      await createHCRequest(data);
      ElMessage.success('编制申请创建成功');
    }
    router.back();
  } catch (e: any) {
    ElMessage.error(e.message || '提交失败');
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  dictionaryStore.fetchDictionaries('department');
  if (isEdit.value) {
    fetchDetail();
  }
});
</script>

<style scoped lang="scss">
.hc-form-page { padding: 20px; max-width: 900px; }
.back-nav { margin-bottom: 16px; }
.form-actions { margin-top: 24px; }
</style>
