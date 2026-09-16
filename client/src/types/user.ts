export type UserRole = 'admin' | 'member' | 'hr' | 'hiring_manager' | 'interviewer';

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string | null;
}
