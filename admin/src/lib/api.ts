const API_BASE = '/admin/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

export function setToken(token: string): void {
  localStorage.setItem('token', token);
}

export function clearToken(): void {
  localStorage.removeItem('token');
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearToken();
    window.location.href = '/admin/login';
    throw new Error('Unauthorized');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// Auth
export interface LoginResponse {
  token: string;
  admin: { id: number; username: string };
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
}

// Stats
export interface Stats {
  users: { total: number };
  workflows: { active: number };
  tasks: { total: number; pending: number; completed: number };
  credits: { totalInSystem: number; totalSpent: number };
}

export async function getStats(): Promise<Stats> {
  return request<Stats>('/stats');
}

// Users
export interface User {
  id: number;
  email: string;
  credits: number;
  is_approved: boolean;
  created_at: string;
  total_tasks?: number;
  pending_tasks?: number;
  completed_tasks?: number;
  total_spent?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getUsers(page = 1, pageSize = 20): Promise<PaginatedResponse<User>> {
  return request<PaginatedResponse<User>>(`/users?page=${page}&pageSize=${pageSize}`);
}

export async function getUser(id: number): Promise<User> {
  return request<User>(`/users/${id}`);
}

export async function createUser(data: { email: string; credits?: number; is_approved?: boolean }): Promise<User> {
  return request<User>('/users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateUser(id: number, data: Partial<User>): Promise<User> {
  return request<User>(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteUser(id: number): Promise<void> {
  return request<void>(`/users/${id}`, { method: 'DELETE' });
}

export async function adjustCredits(id: number, amount: number, reason: string): Promise<User> {
  return request<User>(`/users/${id}/credits`, {
    method: 'POST',
    body: JSON.stringify({ amount, reason }),
  });
}

// Workflows
export type WorkflowType = 'native' | 'official' | 'community';

export interface Workflow {
  id: number;
  name: string;
  manus_address: string;
  description: string | null;
  instruction: string | null;
  credits_per_task: number;
  is_active: boolean;
  type: WorkflowType;
  is_public: boolean;
  created_by_user_id: number | null;
  created_at: string;
  total_tasks?: number;
  pending_tasks?: number;
  completed_tasks?: number;
  total_credits_earned?: number;
}

export interface ApprovedSender {
  id: number;
  workflow_id: number;
  email: string;
  created_at: string;
}

export interface CreateWorkflowPayload {
  name: string;
  description?: string;
  instruction?: string;
  credits_per_task?: number;
  is_public?: boolean;
}

export async function getWorkflows(): Promise<Workflow[]> {
  return request<Workflow[]>('/workflows');
}

export async function createWorkflow(data: CreateWorkflowPayload): Promise<Workflow> {
  return request<Workflow>('/workflows', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateWorkflow(id: number, data: Partial<Workflow>): Promise<Workflow> {
  return request<Workflow>(`/workflows/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteWorkflow(id: number): Promise<void> {
  await request(`/workflows/${id}`, { method: 'DELETE' });
}

export async function getApprovedSenders(workflowId: number): Promise<ApprovedSender[]> {
  return request<ApprovedSender[]>(`/workflows/${workflowId}/senders`);
}

export async function addApprovedSender(workflowId: number, email: string): Promise<ApprovedSender> {
  return request<ApprovedSender>(`/workflows/${workflowId}/senders`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function removeApprovedSender(workflowId: number, email: string): Promise<void> {
  await request(`/workflows/${workflowId}/senders/${encodeURIComponent(email)}`, {
    method: 'DELETE',
  });
}

// Mappings
export interface Mapping {
  id: number;
  original_message_id: string | null;
  original_sender: string;
  workflow: string;
  manus_task_id: string | null;
  status: string;
  credits_charged: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface MappingFilters {
  status?: string;
  workflow?: string;
  sender?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function getMappings(
  page = 1,
  pageSize = 20,
  filters: MappingFilters = {}
): Promise<PaginatedResponse<Mapping>> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (filters.status) params.set('status', filters.status);
  if (filters.workflow) params.set('workflow', filters.workflow);
  if (filters.sender) params.set('sender', filters.sender);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  return request<PaginatedResponse<Mapping>>(`/mappings?${params}`);
}

// Transactions
export interface Transaction {
  id: number;
  user_id: number;
  user_email: string;
  credits_delta: number;
  reason: string | null;
  email_mapping_id: number | null;
  created_at: string;
}

export async function getTransactions(
  page = 1,
  pageSize = 20,
  userId?: number
): Promise<PaginatedResponse<Transaction>> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (userId) params.set('userId', String(userId));
  return request<PaginatedResponse<Transaction>>(`/transactions?${params}`);
}
