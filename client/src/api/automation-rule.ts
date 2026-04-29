import request from '@/utils/request';

export interface AutomationRule {
  id: string;
  triggerStage: string;
  triggerStatus: string;
  templateId: string;
  template?: { id: string; name: string };
  enabled: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRuleParams {
  triggerStage: string;
  triggerStatus: string;
  templateId: string;
  enabled?: boolean;
  description?: string;
}

export interface UpdateRuleParams {
  triggerStage?: string;
  triggerStatus?: string;
  templateId?: string;
  enabled?: boolean;
  description?: string;
}

export function getAutomationRules(): Promise<{ success: boolean; data: AutomationRule[] }> {
  return request.get('/automation-rules') as Promise<{ success: boolean; data: AutomationRule[] }>;
}

export function getAutomationRuleById(id: string): Promise<{ success: boolean; data: AutomationRule }> {
  return request.get(`/automation-rules/${id}`) as Promise<{ success: boolean; data: AutomationRule }>;
}

export function createAutomationRule(data: CreateRuleParams): Promise<{ success: boolean; data: AutomationRule; message: string }> {
  return request.post('/automation-rules', data) as Promise<{ success: boolean; data: AutomationRule; message: string }>;
}

export function updateAutomationRule(id: string, data: UpdateRuleParams): Promise<{ success: boolean; data: AutomationRule; message: string }> {
  return request.patch(`/automation-rules/${id}`, data) as Promise<{ success: boolean; data: AutomationRule; message: string }>;
}

export function deleteAutomationRule(id: string): Promise<{ success: boolean; message: string }> {
  return request.delete(`/automation-rules/${id}`) as Promise<{ success: boolean; message: string }>;
}
