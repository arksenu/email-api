import { config } from '../config';

const MANUS_API_BASE = 'https://api.manus.ai/v1';

export interface CreateTaskRequest {
  prompt: string;
  agentProfile?: string;
  attachments?: Array<{ type: 'base64'; data: string; filename: string }>;
}

export interface CreateTaskResponse {
  task_id: string;
  task_title: string;
  task_url: string;
}

export interface TaskOutput {
  content: Array<{ text?: string; fileUrl?: string }>;
}

export interface GetTaskResponse {
  id: string;
  status: string;
  credit_usage: number;
  output: TaskOutput[];
}

export interface PublicKeyResponse {
  public_key: string;
  algorithm: string;
}

export async function createTask(req: CreateTaskRequest): Promise<CreateTaskResponse> {
  const res = await fetch(`${MANUS_API_BASE}/tasks`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.MANUS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: req.prompt,
      agent_profile: req.agentProfile || config.MANUS_AGENT_PROFILE,
      attachments: req.attachments,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Manus API error: ${res.status} - ${text}`);
  }

  return res.json() as Promise<CreateTaskResponse>;
}

export async function getTask(taskId: string): Promise<GetTaskResponse> {
  const res = await fetch(`${MANUS_API_BASE}/tasks/${taskId}`, {
    headers: { 'Authorization': `Bearer ${config.MANUS_API_KEY}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Manus API error: ${res.status} - ${text}`);
  }

  return res.json() as Promise<GetTaskResponse>;
}

export async function downloadAttachment(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Attachment download failed: ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function getPublicKey(): Promise<PublicKeyResponse> {
  const res = await fetch(`${MANUS_API_BASE}/webhook/public_key`, {
    headers: { 'Authorization': `Bearer ${config.MANUS_API_KEY}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch public key: ${res.status} - ${text}`);
  }

  return res.json() as Promise<PublicKeyResponse>;
}
