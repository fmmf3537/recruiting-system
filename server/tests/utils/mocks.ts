import { vi } from 'vitest';

// Mock user data
export const mockAdminUser = {
  id: 'user-1',
  email: 'admin@test.com',
  name: 'Admin User',
  password: '$2a$10$testhashedpassword',
  role: 'admin' as const,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

export const mockMemberUser = {
  id: 'user-2',
  email: 'member@test.com',
  name: 'Member User',
  password: '$2a$10$testhashedpassword',
  role: 'member' as const,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

// Mock job data
export const mockJob = {
  id: 'job-1',
  title: '前端工程师',
  department: '技术部',
  location: '北京',
  type: '全职' as const,
  salaryMin: 15000,
  salaryMax: 25000,
  description: '负责前端开发',
  requirements: '3年以上经验',
  status: 'open' as const,
  createdById: 'user-1',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

// Mock candidate data
export const mockCandidate = {
  id: 'candidate-1',
  name: '张三',
  phone: '13800138000',
  email: 'zhangsan@test.com',
  gender: '男' as const,
  age: 28,
  education: '本科' as const,
  experience: 5,
  currentCompany: 'ABC公司',
  currentPosition: '高级前端工程师',
  expectedSalaryMin: 20000,
  expectedSalaryMax: 30000,
  status: 'screening' as const,
  source: '招聘网站' as const,
  createdById: 'user-1',
  ownerId: 'user-1',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

// Mock candidate with full relations
export const mockCandidateWithRelations = {
  ...mockCandidate,
  candidateJobs: [{
    id: 'cj-1',
    candidateId: 'candidate-1',
    jobId: 'job-1',
    status: 'screening' as const,
    currentStage: 'screening' as const,
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    job: mockJob,
  }],
  interviewFeedbacks: [],
};

// Mock interview feedback
export const mockInterviewFeedback = {
  id: 'feedback-1',
  candidateId: 'candidate-1',
  interviewerId: 'user-1',
  round: '初试' as const,
  interviewTime: new Date('2024-01-15T10:00:00Z'),
  conclusion: 'pass' as const,
  feedbackContent: '技术能力不错',
  createdAt: new Date('2024-01-15'),
  updatedAt: new Date('2024-01-15'),
};

// Mock offer data
export const mockOffer = {
  id: 'offer-1',
  candidateId: 'candidate-1',
  jobId: 'job-1',
  salary: 25000,
  probationSalary: 20000,
  probationMonths: 3,
  startDate: new Date('2024-02-01'),
  deadline: new Date('2024-01-25'),
  benefits: '五险一金',
  remarks: '欢迎加入',
  status: 'pending' as const,
  createdById: 'user-1',
  createdAt: new Date('2024-01-20'),
  updatedAt: new Date('2024-01-20'),
};

// Mock offer with relations
export const mockOfferWithRelations = {
  ...mockOffer,
  candidate: mockCandidate,
  job: mockJob,
};

// Helper to generate JWT token for tests
export const generateTestToken = (user: typeof mockAdminUser) => {
  return 'mock-jwt-token';
};

// Mock request factory
export const createMockRequest = (overrides = {}) => ({
  user: mockAdminUser,
  body: {},
  params: {},
  query: {},
  headers: {},
  ...overrides,
});

// Mock response factory
export const createMockResponse = () => {
  const res: any = {
    statusCode: 200,
    jsonData: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.jsonData = data;
      return this;
    },
  };
  return res;
};

// Stage sequence for validation
export const STAGE_SEQUENCE = [
  'new',
  'screening',
  'interview1',
  'interview2',
  'interview3',
  'offer',
  'hired',
  'rejected',
] as const;

// Valid stage transitions
export const getValidNextStages = (currentStage: string): string[] => {
  const idx = STAGE_SEQUENCE.indexOf(currentStage as any);
  if (idx === -1 || idx >= STAGE_SEQUENCE.length - 2) return [];
  return [STAGE_SEQUENCE[idx + 1]];
};
