# 简历自动解析功能开发计划

---

## 一、功能概述

用户在候选人列表页点击"上传简历"按钮，上传 PDF/DOC/DOCX 文件，系统自动解析简历内容，生成候选人信息（包括历史工作经历），确认后创建候选人。

---

## 二、数据模型设计

### 2.1 新增 WorkHistory 表

```prisma
// 工作经历表
model WorkHistory {
  id            String    @id @default(cuid())
  candidateId   String
  candidate     Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  
  company       String    // 公司名称
  position      String    // 职位名称
  startDate     DateTime? // 开始时间
  endDate       DateTime? // 结束时间（null 表示至今）
  description   String?   @db.Text // 工作描述/职责
  
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([candidateId])
  @@map("work_history")
}
```

### 2.2 关系图

```
Candidate (1) ──→ (N) WorkHistory
```

---

## 三、API 设计

### 3.1 简历解析接口

```
POST /api/candidates/parse-resume
Content-Type: multipart/form-data

Request:
  - file: File (PDF/DOC/DOCX, 最大 10MB)

Response:
  {
    "success": true,
    "data": {
      "name": "张三",
      "phone": "13800138000",
      "email": "zhangsan@example.com",
      "gender": "男",
      "age": 28,
      "workYears": 5,
      "education": "本科",
      "school": "西安交通大学",
      "currentCompany": "某科技公司",
      "currentPosition": "高级前端工程师",
      "expectedSalary": "25k-35k",
      "workHistory": [
        {
          "company": "A公司",
          "position": "前端工程师",
          "startDate": "2020-06",
          "endDate": "2023-08",
          "description": "负责前端架构搭建"
        },
        {
          "company": "B公司",
          "position": "React开发",
          "startDate": "2018-03",
          "endDate": "2020-05",
          "description": "参与核心业务开发"
        }
      ],
      "skills": ["Vue", "React", "TypeScript"],
      "rawText": "..."
    }
  }
```

---

## 四、文件改动清单

### 后端（server/）

| 文件 | 操作 | 说明 |
|------|------|------|
| `prisma/schema.prisma` | 修改 | 新增 WorkHistory model |
| `src/services/candidate.service.ts` | 修改 | 新增 create/get/update WorkHistory 方法 |
| `src/services/resume-parser.service.ts` | 新增 | 简历解析核心服务（含历史经历解析） |
| `src/routes/candidates.ts` | 修改 | 添加解析接口路由 |
| `src/lib/llm.ts` | 新增 | LLM 调用封装 |
| `src/types/candidate.ts` | 新增 | 相关类型定义 |
| `package.json` | 修改 | 添加 pdf-parse、mammoth 依赖 |
| `.env.example` | 修改 | 添加 LLM API Key 配置 |

### 前端（client/）

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/views/candidates/index.vue` | 修改 | 添加上传简历按钮 |
| `src/views/candidates/ResumeUpload.vue` | 新增 | 简历上传组件 |
| `src/views/candidates/CandidateForm.vue` | 修改 | 支持预填充表单 + 历史经历展示 |
| `src/views/candidates/WorkHistoryList.vue` | 新增 | 历史经历列表组件 |
| `src/api/candidates.ts` | 修改 | 添加解析接口调用 |
| `src/types/candidate.ts` | 新增 | 相关类型定义 |

---

## 五、实现步骤

### Phase 1：数据库迁移
1. 更新 `schema.prisma`，添加 WorkHistory model
2. 执行 `prisma migrate dev` 生成迁移
3. 生成新的 Prisma Client

### Phase 2：后端基础能力
1. 添加依赖：`pdf-parse`、`mammoth`
2. 创建 `llm.ts`：LLM API 调用封装
3. 创建 `resume-parser.service.ts`：文件上传、文本提取、AI 解析
4. 创建 `/api/candidates/parse-resume` 接口
5. 更新 `candidate.service.ts`：添加 WorkHistory CRUD 方法
6. 更新候选人详情接口：返回时包含 workHistory

### Phase 3：前端上传组件
1. 创建 `ResumeUpload.vue` 组件
2. 在候选人列表页添加上传入口
3. 实现文件上传与解析结果预览

### Phase 4：表单集成
1. 修改 `CandidateForm.vue` 支持预填充
2. 创建 `WorkHistoryList.vue` 展示历史经历
3. 实现从解析结果到表单的数据传递
4. 用户确认后调用创建接口

### Phase 5：测试与优化
1. 测试不同格式简历解析效果
2. 验证历史工作经历提取准确率
3. 优化 prompt 提升准确率
4. 添加错误处理

---

## 六、Prompt 设计

```
你是一个简历信息提取助手。请从以下简历文本中提取结构化信息。
只返回 JSON 格式，不要包含其他文字。

简历文本：
{resume_text}

请提取以下字段（如果找不到对应信息，返回 null）：
{
  "name": "姓名",
  "phone": "手机号",
  "email": "邮箱",
  "gender": "性别（男/女）",
  "age": 年龄（数字）,
  "workYears": 工作年限（数字）,
  "education": "最高学历",
  "school": "毕业院校",
  "currentCompany": "当前公司",
  "currentPosition": "当前职位",
  "expectedSalary": "期望薪资",
  "workHistory": [
    {
      "company": "公司名称",
      "position": "职位名称",
      "startDate": "开始时间YYYY-MM格式",
      "endDate": "结束时间YYYY-MM格式，如至今则返回null",
      "description": "工作描述"
    }
  ],
  "skills": ["技能1", "技能2"]
}
```

---

## 七、环境变量配置

```env
# .env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-xxx
```

---

## 八、前端表单设计

### 候选人表单新增「工作经历」区块

```
┌─ 基本信息 ──────────────────────────┐
│  姓名、手机号、邮箱、性别、年龄...    │
└─────────────────────────────────────┘

┌─ 工作经历 ──────────────────────────┐
│ [+ 添加工作经历]                    │
│ ┌────────────────────────────────┐ │
│ │ 公司：A公司    职位：前端工程师  │ │
│ │ 时间：2020-06 ~ 2023-08        │ │
│ │ 描述：负责前端架构搭建...       │ │
│ └────────────────────────────────┘ │
│ ┌────────────────────────────────┐ │
│ │ 公司：B公司    职位：React开发  │ │
│ │ 时间：2018-03 ~ 2020-05        │ │
│ │ 描述：参与核心业务开发...       │ │
│ └────────────────────────────────┘ │
└─────────────────────────────────────┘
```

---

## 九、技术选型

### LLM 提供商

| 方案 | 价格 | 推荐度 |
|------|------|--------|
| DeepSeek-V3 | ¥0.001 / 1K tokens | ⭐⭐⭐⭐⭐ 性价比最高 |
| GLM-4-Flash | ¥0.001 / 1K tokens | ⭐⭐⭐⭐⭐ 性价比最高 |
| GPT-4o-mini | $0.15 / 1M tokens | ⭐⭐⭐ 便宜但需翻墙 |
| 通义千问-Turbo | ¥0.002 / 1K tokens | ⭐⭐⭐⭐ 国内稳定 |

### 简历解析库

| 格式 | 库 | 说明 |
|------|-----|------|
| PDF | `pdf-parse` | 提取 PDF 文本 |
| DOCX | `mammoth` | 转换 DOCX 为文本 |
| DOC | `antiword` | 解析老版 Word 格式（可选） |

---

## 十、潜在问题与应对

| 问题 | 应对方案 |
|------|---------|
| 解析不准确 | 保留原始文本，用户可手动修改 |
| 特殊格式简历 | 支持手动输入作为补充 |
| 文件过大 | 限制 10MB，超出提示 |
| AI 服务失败 | 返回友好错误，支持重试 |
| 隐私合规 | 简历解析后可删除原始文件 |
| 历史经历提取不全 | 优先提取最近 2-3 段经历 |
