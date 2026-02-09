const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('portal_token');
}

export function setToken(token: string): void {
  localStorage.setItem('portal_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('portal_token');
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
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
    window.location.href = '/portal/login';
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
  user: {
    id: number;
    email: string;
    credits: number;
    is_approved: boolean;
  };
}

export interface RegisterResponse {
  message: string;
  user: {
    id: number;
    email: string;
    is_approved: boolean;
  };
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function register(email: string, password: string): Promise<RegisterResponse> {
  return request<RegisterResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function getCurrentUser(): Promise<User> {
  return request<User>('/auth/me');
}

// User
export interface User {
  id: number;
  email: string;
  credits: number;
  is_approved: boolean;
  created_at: string;
}

export async function getAccount(): Promise<User> {
  return request<User>('/account');
}

// Workflows
export type WorkflowType = 'native' | 'official' | 'community';

export interface Workflow {
  id: number;
  name: string;
  description: string | null;
  instruction: string | null;
  credits_per_task: number;
  is_active: boolean;
  type: WorkflowType;
  is_public: boolean;
  created_by_user_id: number | null;
  created_at: string;
  total_tasks?: number;
  completed_tasks?: number;
}

export interface CreateWorkflowPayload {
  name: string;
  description?: string;
  instruction?: string;
  credits_per_task?: number;
  is_public?: boolean;
}

export async function getDirectory(): Promise<Workflow[]> {
  return request<Workflow[]>('/workflows/directory');
}

export async function getMyWorkflows(): Promise<Workflow[]> {
  return request<Workflow[]>('/workflows/mine');
}

export async function getWorkflow(id: number): Promise<Workflow> {
  return request<Workflow>(`/workflows/${id}`);
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

// Approved Senders
export interface ApprovedSender {
  id: number;
  workflow_id: number;
  email: string;
  created_at: string;
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

// Usage & Transactions
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

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

export interface Transaction {
  id: number;
  user_id: number;
  credits_delta: number;
  reason: string | null;
  email_mapping_id: number | null;
  created_at: string;
}

export async function getUsage(page = 1, pageSize = 20): Promise<PaginatedResponse<Mapping>> {
  return request<PaginatedResponse<Mapping>>(`/account/usage?page=${page}&pageSize=${pageSize}`);
}

export async function getTransactions(page = 1, pageSize = 20): Promise<PaginatedResponse<Transaction>> {
  return request<PaginatedResponse<Transaction>>(`/account/transactions?page=${page}&pageSize=${pageSize}`);
}
