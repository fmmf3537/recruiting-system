import { AppError } from '../middleware/errorHandler';

/** 单次导入数据行上限（不含表头 / 说明行） */
export const MAX_DICTIONARY_IMPORT_ROWS = 1000;

/** 失败明细最多返回条数 */
export const MAX_IMPORT_ERROR_DETAILS = 20;

export const XLSX_HEADER_ALIASES: Record<
'category' | 'code' | 'name' | 'sortOrder' | 'enabled' | 'description',
string[]
> = {
  category: ['分类', 'category'],
  code: ['编码', 'code'],
  name: ['名称', 'name'],
  sortOrder: ['排序', 'sortorder', 'sort_order'],
  enabled: ['状态', 'enabled'],
  description: ['备注', '分值', 'description'],
};

export interface DictionaryImportRawRow {
  row: number;
  category: string;
  code: string;
  name: string;
  sortOrder: string;
  enabled: string;
  description: string;
}

export interface DictionaryImportRow {
  row: number;
  category: string;
  code: string;
  name: string;
  sortOrder: number;
  enabled: boolean;
  description: string | null;
}

function cellStr(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase();
}

/** 表头单元格是否表示「编码」列 */
function isCodeHeaderCell(cell: string): boolean {
  const n = normalizeHeader(cell);
  return n.includes('编码') || n === 'code' || n.includes('(code)');
}

function headerMatches(cell: string, aliases: string[]): boolean {
  const n = normalizeHeader(cell);
  return aliases.some((alias) => n === alias.toLowerCase() || n.includes(alias.toLowerCase()));
}

function isEmptyRow(cells: unknown[]): boolean {
  return cells.every((c) => cellStr(c) === '');
}

/** 说明行：以 # 开头，或模板示例（含「例：」） */
function isCommentOrExampleRow(cells: unknown[]): boolean {
  const texts = cells.map((c) => cellStr(c));
  const first = texts.find((t) => t !== '') ?? '';
  if (first.startsWith('#')) {
    return true;
  }
  return texts.some((t) => t.includes('例：') || t.includes('例:'));
}

/**
 * 状态列：空默认 true；只认 true/false/1/0/启用/禁用。
 */
export function parseEnabled(raw: string, row: number): boolean {
  if (raw === '') {
    return true;
  }
  const n = raw.trim().toLowerCase();
  if (n === 'true' || n === '1' || n === '启用') {
    return true;
  }
  if (n === 'false' || n === '0' || n === '禁用') {
    return false;
  }
  throw new AppError(`第 ${row} 行：状态值无效，仅支持 true/false/1/0/启用/禁用`, 400);
}

/**
 * 排序列：空默认 0；须为 ≥0 的整数。
 */
export function parseSortOrder(raw: string, row: number): number {
  if (raw === '') {
    return 0;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new AppError(`第 ${row} 行：排序必须为非负整数`, 400);
  }
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new AppError(`第 ${row} 行：排序必须为非负整数`, 400);
  }
  return n;
}

function colIndex(header: string[], field: keyof typeof XLSX_HEADER_ALIASES): number {
  const aliases = XLSX_HEADER_ALIASES[field];
  return header.findIndex((cell) => headerMatches(cell, aliases));
}

/**
 * 将原始单元格校验为导入行。失败抛 AppError（带行号），由 service 逐行 catch。
 */
export function parseImportRow(raw: DictionaryImportRawRow): DictionaryImportRow {
  const category = raw.category.trim();
  const code = raw.code.trim();
  const name = raw.name.trim();
  if (!category) {
    throw new AppError(`第 ${raw.row} 行：分类不能为空`, 400);
  }
  if (!code) {
    throw new AppError(`第 ${raw.row} 行：编码不能为空`, 400);
  }
  if (!name) {
    throw new AppError(`第 ${raw.row} 行：名称不能为空`, 400);
  }
  const sortOrder = parseSortOrder(raw.sortOrder, raw.row);
  const enabled = parseEnabled(raw.enabled, raw.row);
  const desc = raw.description.trim();
  return {
    row: raw.row,
    category,
    code,
    name,
    sortOrder,
    enabled,
    description: desc === '' ? null : desc,
  };
}

export interface ParseXlsxResult {
  rows: DictionaryImportRawRow[];
  skipped: number;
}

/**
 * 解析 xlsx/xls buffer：定位表头、过滤说明行/空行，返回待校验数据行。
 * 超过 1000 行直接 400。xlsx 包按需动态加载，避免拖慢进程启动。
 */
export async function parseXlsxImportRows(buffer: Buffer): Promise<ParseXlsxResult> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new AppError('Excel 文件没有工作表', 400);
  }
  const sheet = workbook.Sheets[sheetName];
  // sheet_to_json 的静态返回类型是 {}（宽松），运行时实际是二维数组；
  // 显式断言为 unknown[][] 才能对单元格安全取值；eslint 的 unnecessary-assertion 是类型假阳性
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  const aoa = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: false,
  }) as unknown[][];

  let headerIndex = -1;
  for (let i = 0; i < aoa.length; i += 1) {
    const row = aoa[i] ?? [];
    if (row.some((cell) => isCodeHeaderCell(cellStr(cell)))) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex < 0) {
    throw new AppError('未找到表头（需包含「编码」或 code）', 400);
  }

  const headerCells = (aoa[headerIndex] ?? []).map((c) => cellStr(c));
  const idxCategory = colIndex(headerCells, 'category');
  const idxCode = colIndex(headerCells, 'code');
  const idxName = colIndex(headerCells, 'name');
  const idxSort = colIndex(headerCells, 'sortOrder');
  const idxEnabled = colIndex(headerCells, 'enabled');
  const idxDesc = colIndex(headerCells, 'description');
  if (idxCode < 0) {
    throw new AppError('表头缺少编码列', 400);
  }

  // 列序兜底：0=category 1=code 2=name 3=sortOrder 4=enabled 5=description
  const categoryCol = idxCategory >= 0 ? idxCategory : 0;
  const nameCol = idxName >= 0 ? idxName : 2;
  const sortCol = idxSort >= 0 ? idxSort : 3;
  const enabledCol = idxEnabled >= 0 ? idxEnabled : 4;
  const descCol = idxDesc >= 0 ? idxDesc : 5;

  let skipped = 1; // 表头行
  const rows: DictionaryImportRawRow[] = [];

  for (let i = headerIndex + 1; i < aoa.length; i += 1) {
    const cells = aoa[i] ?? [];
    const excelRow = i + 1;
    if (isEmptyRow(cells) || isCommentOrExampleRow(cells)) {
      skipped += 1;
    } else {
      rows.push({
        row: excelRow,
        category: cellStr(cells[categoryCol]),
        code: cellStr(cells[idxCode]),
        name: cellStr(cells[nameCol]),
        sortOrder: cellStr(cells[sortCol]),
        enabled: cellStr(cells[enabledCol]),
        description: cellStr(cells[descCol]),
      });
    }
  }

  if (rows.length > MAX_DICTIONARY_IMPORT_ROWS) {
    throw new AppError('单次导入最多 1000 行', 400);
  }

  return { rows, skipped };
}
