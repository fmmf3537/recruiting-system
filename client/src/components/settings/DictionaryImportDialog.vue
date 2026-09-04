<template>
  <el-dialog
    :model-value="modelValue"
    title="导入字典"
    width="640px"
    destroy-on-close
    @close="handleClose"
  >
    <div class="import-toolbar">
      <el-button type="primary" link @click="downloadTemplate">下载导入模板</el-button>
      <span class="import-tip">支持 .xlsx/.xls，≤5MB，≤1000 行；文件内分类列为准（当前页：{{ category }}）</span>
    </div>

    <el-upload
      class="import-upload"
      drag
      :auto-upload="false"
      :limit="1"
      accept=".xlsx,.xls"
      :on-change="handleFileChange"
      :on-exceed="handleExceed"
      :on-remove="handleRemove"
    >
      <div class="el-upload__text">将文件拖到此处，或<em>点击选择</em></div>
    </el-upload>

    <el-alert
      v-if="parseError"
      type="error"
      :closable="false"
      show-icon
      title="文件解析失败，请确认是 .xlsx 格式"
      style="margin-top: 12px"
    />

    <div v-if="previewRows.length" class="preview-section">
      <div class="preview-title">预览（前 {{ previewRows.length }} 行，最终以服务端校验为准）</div>
      <el-table :data="previewRows" size="small" max-height="240" stripe>
        <el-table-column prop="category" label="分类" min-width="110" show-overflow-tooltip />
        <el-table-column prop="code" label="编码" min-width="100" show-overflow-tooltip />
        <el-table-column prop="name" label="名称" min-width="100" show-overflow-tooltip />
        <el-table-column prop="sortOrder" label="排序" width="70" />
        <el-table-column prop="enabled" label="状态" width="80" />
        <el-table-column prop="description" label="备注/分值" min-width="100" show-overflow-tooltip />
      </el-table>
    </div>

    <div v-if="result" class="result-section">
      <el-alert
        :type="result.failed > 0 ? 'warning' : 'success'"
        :closable="false"
        show-icon
        :title="`成功 ${result.success} 条，跳过 ${result.skipped} 条，失败 ${result.failed} 条；失败明细如下（不影响已导入行）`"
      />
      <el-table
        v-if="result.errors.length"
        :data="result.errors"
        size="small"
        max-height="200"
        stripe
        style="margin-top: 8px"
      >
        <el-table-column prop="row" label="行号" width="80" />
        <el-table-column prop="reason" label="原因" min-width="200" />
      </el-table>
    </div>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button
        type="primary"
        :loading="importing"
        :disabled="!selectedFile || !!parseError"
        @click="handleImport"
      >
        开始导入
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElMessage, type UploadFile } from 'element-plus';
import * as XLSX from 'xlsx';
import {
  importDictionaries,
  type DictionaryImportResult,
} from '@/api/dictionary';

defineProps<{
  modelValue: boolean;
  /** 当前分类，仅作上下文；导入以文件内分类列为准 */
  category: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  imported: [];
}>();

interface PreviewRow {
  category: string;
  code: string;
  name: string;
  sortOrder: string;
  enabled: string;
  description: string;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const PREVIEW_LIMIT = 20;

const selectedFile = ref<File | null>(null);
const parseError = ref(false);
const previewRows = ref<PreviewRow[]>([]);
const importing = ref(false);
const result = ref<DictionaryImportResult | null>(null);

function cellStr(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function isCodeHeader(cell: string): boolean {
  const n = cell.toLowerCase();
  return n.includes('编码') || n === 'code' || n.includes('(code)');
}

function headerIndex(header: string[], aliases: string[]): number {
  const lower = header.map((h) => h.toLowerCase());
  return lower.findIndex((h) => aliases.some((a) => h === a.toLowerCase() || h.includes(a.toLowerCase())));
}

function isSkipRow(cells: unknown[]): boolean {
  const texts = cells.map((c) => cellStr(c));
  if (texts.every((t) => t === '')) return true;
  const first = texts.find((t) => t !== '') ?? '';
  if (first.startsWith('#')) return true;
  return texts.some((t) => t.includes('例：') || t.includes('例:'));
}

/** 前端仅做预览；空行 / 说明行过滤，最多 20 行 */
function parsePreviewAoa(aoa: unknown[][]): PreviewRow[] {
  let headerIdx = -1;
  for (let i = 0; i < aoa.length; i += 1) {
    const row = aoa[i] ?? [];
    if (row.some((cell) => isCodeHeader(cellStr(cell)))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) {
    throw new Error('no header');
  }
  const header = (aoa[headerIdx] ?? []).map((c) => cellStr(c));
  const idxCat = headerIndex(header, ['分类', 'category']);
  const idxCode = headerIndex(header, ['编码', 'code']);
  const idxName = headerIndex(header, ['名称', 'name']);
  const idxSort = headerIndex(header, ['排序', 'sortorder']);
  const idxEnabled = headerIndex(header, ['状态', 'enabled']);
  const idxDesc = headerIndex(header, ['备注', '分值', 'description']);
  if (idxCode < 0) {
    throw new Error('no code col');
  }
  const catCol = idxCat >= 0 ? idxCat : 0;
  const nameCol = idxName >= 0 ? idxName : 2;
  const sortCol = idxSort >= 0 ? idxSort : 3;
  const enabledCol = idxEnabled >= 0 ? idxEnabled : 4;
  const descCol = idxDesc >= 0 ? idxDesc : 5;

  const rows: PreviewRow[] = [];
  for (let i = headerIdx + 1; i < aoa.length && rows.length < PREVIEW_LIMIT; i += 1) {
    const cells = aoa[i] ?? [];
    if (!isSkipRow(cells)) {
      rows.push({
        category: cellStr(cells[catCol]),
        code: cellStr(cells[idxCode]),
        name: cellStr(cells[nameCol]),
        sortOrder: cellStr(cells[sortCol]),
        enabled: cellStr(cells[enabledCol]),
        description: cellStr(cells[descCol]),
      });
    }
  }
  return rows;
}

async function parseFile(file: File) {
  parseError.value = false;
  previewRows.value = [];
  result.value = null;
  if (file.size > MAX_FILE_SIZE) {
    parseError.value = true;
    ElMessage.error('文件不能超过 5MB');
    return;
  }
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      parseError.value = true;
      return;
    }
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: false,
    }) as unknown[][];
    previewRows.value = parsePreviewAoa(aoa);
  } catch {
    parseError.value = true;
    previewRows.value = [];
  }
}

function handleFileChange(uploadFile: UploadFile) {
  const { raw } = uploadFile;
  if (!raw) return;
  selectedFile.value = raw;
  parseFile(raw);
}

function handleExceed() {
  ElMessage.warning('一次只能选择一个文件');
}

function handleRemove() {
  selectedFile.value = null;
  parseError.value = false;
  previewRows.value = [];
  result.value = null;
}

function downloadTemplate() {
  const aoa = [
    ['分类(category)', '编码(code)', '名称(name)', '排序(sortOrder)', '状态(enabled)', '备注/分值(description)'],
    ['# 说明：分类用英文 code（如 department），编码唯一，状态填 启用/禁用 或 true/false'],
    ['department', 'tech_example', '技术部示例', 1, '启用', '示例行，导入前请删除'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '模板');
  XLSX.writeFile(wb, '字典导入模板.xlsx');
}

async function handleImport() {
  if (!selectedFile.value || parseError.value || importing.value) return;
  importing.value = true;
  try {
    const res = await importDictionaries(selectedFile.value);
    if (res.success && res.data) {
      result.value = res.data;
      ElMessage.success(
        `导入成功 ${res.data.success} 条，跳过 ${res.data.skipped} 条，失败 ${res.data.failed} 条`
      );
      emit('imported');
    }
  } finally {
    importing.value = false;
  }
}

function handleClose() {
  selectedFile.value = null;
  parseError.value = false;
  previewRows.value = [];
  result.value = null;
  emit('update:modelValue', false);
}
</script>

<style scoped lang="scss">
.import-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.import-tip {
  font-size: 12px;
  color: #909399;
}
.preview-section,
.result-section {
  margin-top: 16px;
}
.preview-title {
  margin-bottom: 8px;
  font-size: 13px;
  color: #606266;
}
</style>
