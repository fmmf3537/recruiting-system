// 全局类型定义

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// 工作经历类型
export interface WorkHistoryInput {
  company: string;
  position: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

// 简历解析结果类型
export interface ResumeParseResult {
  name: string | null;
  phone: string | null;
  email: string | null;
  gender: string | null;
  age: number | null;
  workYears: number | null;
  education: string | null;
  school: string | null;
  currentCompany: string | null;
  currentPosition: string | null;
  expectedSalary: string | null;
  workHistory: WorkHistoryInput[];
  skills: string[];
  rawText: string;
  resumeUrl?: string;
}
