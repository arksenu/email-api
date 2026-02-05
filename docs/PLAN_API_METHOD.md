# Custom Workflows - API Method Implementation Plan

## Overview

Expand the workflow system to support three tiers of workflows with public/private visibility. Uses **Manus API** for task execution with webhook-based response handling.

### Architecture

```
INBOUND:
User → workflow@mail.fly-bot.net → SendGrid → Server
    ↓
Validate user, check credits, check workflow access
    ↓
POST https://api.manus.ai/v1/tasks
  { prompt: instruction + body, attachments: [...] }
    ↓
Store task_id in email_mappings

OUTBOUND:
Manus webhook (task_stopped) → Server
    ↓
Match task_id → mapping
    ↓
Download attachments from S3 presigned URLs
    ↓
Send email to user via SendGrid (with attachments)
    ↓
GET /v1/tasks/{task_id} for credit_usage
    ↓
Deduct credits, mark mapping complete
```

### Workflow Tiers

| Type | Badge | Created By | Manus Address | Instruction |
|------|-------|------------|---------------|-------------|
| **Native** | "Native" | System | N/A (uses API) | Stored in DB (migrated from Manus.im) |
| **Official** | "Official" | Admin | N/A (uses API) | Stored in DB |
| **Community** | Creator name | User | N/A (uses API) | Stored in DB |

### Key Benefits
- Unlimited workflows (no 3-workflow Manus limit)
- Structured webhook responses (no email parsing)
- Direct credit usage from Manus API
- No acknowledgment message handling
- No branding to strip
- Cleaner task tracking with task_id

---

## Phase 1: Database Changes

### File: `migrations/003_custom_workflows.sql`

```sql
-- Add new columns to workflows
ALTER TABLE workflows ADD COLUMN type VARCHAR(20) DEFAULT 'community';
ALTER TABLE workflows ADD COLUMN instruction TEXT;
ALTER TABLE workflows ADD COLUMN is_public BOOLEAN DEFAULT TRUE;
ALTER TABLE workflows ADD COLUMN created_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE workflows ADD COLUMN created_at TIMESTAMP DEFAULT NOW();

-- Rename for clarity (API uses task_id, not message_id)
ALTER TABLE email_mappings RENAME COLUMN manus_message_id TO manus_task_id;

-- Update existing workflows to native type
UPDATE workflows SET type = 'native', is_public = TRUE
WHERE name IN ('research', 'summarize', 'newsletter');

-- Copy existing workflow descriptions to instruction field for native workflows
UPDATE workflows SET instruction = description WHERE name IN ('research', 'summarize', 'newsletter');

-- Indexes
CREATE INDEX idx_workflows_public ON workflows(is_public, is_active);
CREATE INDEX idx_workflows_type ON workflows(type);
CREATE INDEX idx_workflows_created_by ON workflows(created_by_user_id);

-- Approved senders table for private workflows
CREATE TABLE workflow_approved_senders (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  added_by_user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(workflow_id, email)
);

CREATE INDEX idx_approved_senders_workflow ON workflow_approved_senders(workflow_id);
CREATE INDEX idx_approved_senders_email ON workflow_approved_senders(email);

-- Add password to users for portal auth
ALTER TABLE users ADD COLUMN password_hash VARCHAR(255);
```

### File: `src/db/workflows.ts`

**Updated Interface:**
```typescript
export interface Workflow {
  id: number;
  name: string;
  manus_address: string;          // Legacy, kept for reference
  description: string | null;     // Display text for directory
  instruction: string | null;     // Prepended to user's email body
  credits_per_task: number;
  is_active: boolean;
  type: 'native' | 'official' | 'community';
  is_public: boolean;
  created_by_user_id: number | null;
  created_at: Date;
}
```

**New Functions:**
- `createWorkflow(data)` - Include new fields
- `deleteWorkflow(id)` - Prevent deletion of native
- `getPublicWorkflows()` - For directory listing
- `getWorkflowsByUser(userId)` - User's own workflows
- `isWorkflowNameTaken(name)` - Check uniqueness

### File: `src/db/approvedSenders.ts` (new)

```typescript
export interface ApprovedSender {
  id: number;
  workflow_id: number;
  email: string;
  added_by_user_id: number | null;
  created_at: Date;
}

export async function getApprovedSenders(workflowId: number): Promise<ApprovedSender[]>
export async function addApprovedSender(workflowId: number, email: string, addedBy?: number): Promise<ApprovedSender>
export async function removeApprovedSender(workflowId: number, email: string): Promise<boolean>
export async function isApprovedSender(workflowId: number, email: string): Promise<boolean>
```

### File: `src/db/users.ts`

**Add password functions:**
```typescript
export async function createUserWithPassword(email: string, password: string): Promise<User>
export async function verifyUserPassword(user: User, password: string): Promise<boolean>
export async function setUserPassword(userId: number, password: string): Promise<void>
```

---

## Phase 2: Manus API Integration

### Environment Variables

```env
MANUS_API_KEY=your_api_key
MANUS_AGENT_PROFILE=manus-1.6
```

### File: `src/config.ts`

Add validation:
```typescript
MANUS_API_KEY: z.string(),
MANUS_AGENT_PROFILE: z.enum(['manus-1.6', 'manus-1.6-lite', 'manus-1.6-max']).default('manus-1.6'),
```

### File: `src/manus/client.ts` (new)

```typescript
import { config } from '../config';

const MANUS_API_BASE = 'https://api.manus.ai/v1';

interface CreateTaskRequest {
  prompt: string;
  agentProfile?: string;
  attachments?: Array<{ type: 'base64'; data: string; filename: string }>;
}

interface CreateTaskResponse {
  task_id: string;
  task_title: string;
  task_url: string;
}

interface GetTaskResponse {
  id: string;
  status: string;
  credit_usage: number;
  output: Array<{ content: Array<{ text?: string; fileUrl?: string }> }>;
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
  if (!res.ok) throw new Error(`Manus API error: ${res.status}`);
  return res.json();
}

export async function getTask(taskId: string): Promise<GetTaskResponse> {
  const res = await fetch(`${MANUS_API_BASE}/tasks/${taskId}`, {
    headers: { 'Authorization': `Bearer ${config.MANUS_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Manus API error: ${res.status}`);
  return res.json();
}

export async function downloadAttachment(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function getPublicKey(): Promise<{ public_key: string; algorithm: string }> {
  const res = await fetch(`${MANUS_API_BASE}/webhook/public_key`, {
    headers: { 'Authorization': `Bearer ${config.MANUS_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch public key: ${res.status}`);
  return res.json();
}
```

### File: `src/manus/webhook.ts` (new)

```typescript
import crypto from 'crypto';
import { getMappingByTaskId, completeMapping } from '../db/mappings';
import { deductCredits, getUserByEmail } from '../db/users';
import { getTask, downloadAttachment, getPublicKey } from './client';
import { sendEmail } from '../email/outbound';
import { config } from '../config';

interface TaskStoppedPayload {
  event_type: 'task_stopped';
  task_id: string;
  message: string;
  stop_reason: 'finish' | 'ask';
  attachments: Array<{
    file_name: string;
    url: string;
    size_bytes: number;
  }>;
}

// Cache public key (refresh every hour)
let cachedPublicKey: string | null = null;
let publicKeyFetchedAt = 0;
const PUBLIC_KEY_TTL = 60 * 60 * 1000; // 1 hour

async function getManusPublicKey(): Promise<string> {
  const now = Date.now();
  if (cachedPublicKey && now - publicKeyFetchedAt < PUBLIC_KEY_TTL) {
    return cachedPublicKey;
  }
  const { public_key } = await getPublicKey();
  cachedPublicKey = public_key;
  publicKeyFetchedAt = now;
  return public_key;
}

export function verifyWebhookSignature(
  signature: string,
  timestamp: string,
  url: string,
  body: string,
  publicKey: string
): boolean {
  // Check timestamp within 5 minutes (prevent replay attacks)
  const ts = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) {
    console.error('Webhook timestamp outside 5-minute window');
    return false;
  }

  // Build signature string: {timestamp}.{url}.{sha256(body)}
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const signatureString = `${timestamp}.${url}.${bodyHash}`;

  // Verify RSA-SHA256 signature
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(signatureString);
  return verifier.verify(publicKey, signature, 'base64');
}

export async function handleManusWebhook(
  payload: TaskStoppedPayload,
  headers: { signature: string; timestamp: string },
  url: string,
  rawBody: string
): Promise<void> {
  // 1. Verify webhook signature
  const publicKey = await getManusPublicKey();
  if (!verifyWebhookSignature(headers.signature, headers.timestamp, url, rawBody, publicKey)) {
    throw new Error('Invalid webhook signature');
  }

  if (payload.event_type !== 'task_stopped') return;
  if (payload.stop_reason !== 'finish') {
    console.log(`Task ${payload.task_id} needs input, skipping`);
    return;
  }

  // Find mapping
  const mapping = await getMappingByTaskId(payload.task_id);
  if (!mapping) {
    console.error(`No mapping found for task ${payload.task_id}`);
    return;
  }

  // Download attachments
  const attachments = await Promise.all(
    payload.attachments.map(async (att) => ({
      filename: att.file_name,
      content: await downloadAttachment(att.url),
    }))
  );

  // Send response email
  await sendEmail({
    from: `${mapping.workflow}@${config.FROM_DOMAIN}`,
    to: mapping.original_sender,
    subject: `Re: Your ${mapping.workflow} task`,
    text: payload.message,
    attachments,
  });

  // Get credit usage from Manus
  const task = await getTask(payload.task_id);
  const creditsUsed = task.credit_usage || 0;

  // Deduct credits
  const user = await getUserByEmail(mapping.original_sender);
  if (user) {
    await deductCredits(user.id, creditsUsed, `Task: ${mapping.workflow}`, mapping.id);
  }

  // Mark complete
  await completeMapping(mapping.id, creditsUsed);

  console.log(`Completed mapping ${mapping.id}, charged ${creditsUsed} credits`);
}
```

### File: `src/email/inbound.ts` (modify)

Replace email forwarding with API call:

```typescript
import { createTask } from '../manus/client';
import { isApprovedSender } from '../db/approvedSenders';

export async function handleInboundEmail(email: ParsedEmail): Promise<void> {
  const sender = email.from;
  const workflow = extractWorkflow(email.to);

  // ... existing user validation ...

  const workflowConfig = await getWorkflowByName(workflow);
  if (!workflowConfig || !workflowConfig.is_active) {
    await sendBounce(sender, `Unknown workflow: ${workflow}`);
    return;
  }

  // Check workflow access
  if (!workflowConfig.is_public) {
    const isCreator = workflowConfig.created_by_user_id === user.id;
    const isApproved = await isApprovedSender(workflowConfig.id, sender);
    if (!isCreator && !isApproved) {
      await sendBounce(sender, `Workflow '${workflow}' is private.`);
      return;
    }
  }

  // ... existing credit check ...

  // Build prompt with instruction
  let prompt = email.text;
  if (workflowConfig.instruction) {
    prompt = `[Instruction]\n${workflowConfig.instruction}\n\n[User Request]\n${email.text}`;
  }

  // Convert attachments to base64
  const attachments = email.attachments?.map(att => ({
    type: 'base64' as const,
    data: att.content.toString('base64'),
    filename: att.filename || 'attachment',
  }));

  // Create mapping
  const mapping = await createMapping(email.messageId, sender, workflow);

  // Create Manus task
  const result = await createTask({ prompt, attachments });

  // Store task_id
  await updateManusTaskId(mapping.id, result.task_id);

  console.log(`Created task ${result.task_id} for mapping ${mapping.id}`);
}
```

### File: `src/api/routes.ts` (modify)

Add webhook endpoint:

```typescript
import express from 'express';
import { handleManusWebhook } from '../manus/webhook';

// Use raw body for signature verification
router.post('/webhooks/manus', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const rawBody = req.body.toString('utf8');
    const payload = JSON.parse(rawBody);

    // Build full URL for signature verification
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    await handleManusWebhook(
      payload,
      {
        signature: req.headers['x-webhook-signature'] as string,
        timestamp: req.headers['x-webhook-timestamp'] as string,
      },
      url,
      rawBody
    );

    res.status(200).send('OK');
  } catch (err) {
    console.error('Manus webhook error:', err);
    res.status(500).send('Error');
  }
});
```

### Files to Deprecate

- `src/email/response.ts` - No longer needed
- `src/email/branding.ts` - No longer needed
- Remove `relay@mail.fly-bot.net` from SendGrid Inbound Parse

---

## Phase 3: Admin Panel Updates

### 3.1 Backend API

#### File: `src/api/admin/routes.ts`

**New Endpoints:**

```typescript
import { createWorkflow, deleteWorkflow } from '../../db/workflows';
import { getApprovedSenders, addApprovedSender, removeApprovedSender } from '../../db/approvedSenders';

// Create workflow (official type)
adminRouter.post('/workflows', async (req, res) => {
  const { name, description, instruction, credits_per_task, is_public } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name required' });
  }

  // Check name not taken
  const existing = await getWorkflowByName(name);
  if (existing) {
    return res.status(409).json({ error: 'Workflow name already exists' });
  }

  const workflow = await createWorkflow({
    name: name.toLowerCase(),
    manus_address: 'arksenu@manus.bot', // Legacy field // but make sure to keep the original 3 workflows summarize, newsletter, research as native
    description,
    instruction,
    credits_per_task: credits_per_task || 10,
    is_public: is_public ?? true,
    type: 'official',
    created_by_user_id: null,
  });

  res.status(201).json(workflow);
});

// Delete workflow
adminRouter.delete('/workflows/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const workflow = await getWorkflowById(id);

  if (!workflow) {
    return res.status(404).json({ error: 'Workflow not found' });
  }
  if (workflow.type === 'native') {
    return res.status(403).json({ error: 'Cannot delete native workflows' });
  }

  await deleteWorkflow(id);
  res.status(204).send();
});

// Approved senders
adminRouter.get('/workflows/:id/senders', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const senders = await getApprovedSenders(id);
  res.json(senders);
});

adminRouter.post('/workflows/:id/senders', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { email } = req.body;
  const sender = await addApprovedSender(id, email);
  res.status(201).json(sender);
});

adminRouter.delete('/workflows/:id/senders/:email', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const email = decodeURIComponent(req.params.email);
  await removeApprovedSender(id, email);
  res.status(204).send();
});
```

### 3.2 Frontend API Client

#### File: `admin/src/lib/api.ts`

**Update types:**
```typescript
export interface Workflow {
  id: number;
  name: string;
  manus_address: string;
  description: string | null;
  instruction: string | null;
  credits_per_task: number;
  is_active: boolean;
  type: 'native' | 'official' | 'community';
  is_public: boolean;
  created_by_user_id: number | null;
  created_at: string;
  // Stats from join
  total_tasks?: number;
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
```

**Add functions:**
```typescript
export async function createWorkflow(data: CreateWorkflowPayload): Promise<Workflow> {
  return request<Workflow>('/workflows', {
    method: 'POST',
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
```

### 3.3 Frontend Workflows Page

#### File: `admin/src/pages/Workflows.tsx`

**UI Changes:**

1. **Header Section:**
   - Title: "Workflows"
   - "Create Workflow" button (opens create modal)

2. **Workflow Cards Display:**
   - Type badge: "Native" (gray), "Official" (blue), "Community" (purple)
   - Visibility: "Public" (green) / "Private" (orange)
   - For community: show creator email
   - For private: show approved sender count
   - Email format preview: `{name}@mail.fly-bot.net`

3. **Modal States:**
   ```typescript
   type ModalType = 'create' | 'edit' | 'delete' | 'senders' | null;
   ```

4. **Create Modal Fields:**
   - Name (required, lowercase enforced)
   - Description (textarea)
   - Instruction (textarea, with explanation)
   - Credits per Task (number)
   - Is Public (checkbox)

5. **Edit Modal Fields:**
   | Field | Native | Official | Community |
   |-------|--------|----------|-----------|
   | Name | Read-only | Editable | Editable |
   | Description | Editable | Editable | Editable |
   | Instruction | Read-only | Editable | Editable |
   | Credits/Task | Editable | Editable | Editable |
   | Is Public | Read-only (true) | Editable | Editable |
   | Is Active | Editable | Editable | Editable |

6. **Approved Senders Modal:**
   - List of emails with remove button
   - Add email input + button
   - Only accessible for private workflows

7. **Delete Confirmation:**
   - Hidden for native workflows
   - Shows warning about permanence

---

## Phase 4: User Platform

### 4.1 Backend Authentication

#### File: `src/api/user/middleware.ts` (new)

```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../../config';

export interface UserPayload {
  id: number;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user: UserPayload;
}

export function userAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as UserPayload;
    (req as AuthenticatedRequest).user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function signUserToken(payload: UserPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: '7d' });
}
```

### 4.2 Backend Routes

#### File: `src/api/user/routes.ts` (new)

```typescript
import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { userAuthMiddleware, signUserToken, AuthenticatedRequest } from './middleware';
import { getUserByEmail, createUserWithPassword, verifyUserPassword } from '../../db/users';
import { getPublicWorkflows, getWorkflowsByUser, createWorkflow, updateWorkflow, deleteWorkflow, getWorkflowById } from '../../db/workflows';
import { getApprovedSenders, addApprovedSender, removeApprovedSender } from '../../db/approvedSenders';
import { getMappingsByUser } from '../../db/mappings';
import { getTransactionsByUser } from '../../db/transactions';

export const userRouter = Router();

// ============ Public Routes ============

// Register
userRouter.post('/auth/register', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const user = await createUserWithPassword(email, password);
  res.status(201).json({
    message: 'Registration successful. Your account is pending approval.',
    user: { id: user.id, email: user.email, is_approved: user.is_approved }
  });
});

// Login
userRouter.post('/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const user = await getUserByEmail(email);
  if (!user || !user.password_hash) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await verifyUserPassword(user, password);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signUserToken({ id: user.id, email: user.email });
  res.json({ token, user: { id: user.id, email: user.email, credits: user.credits, is_approved: user.is_approved } });
});

// ============ Protected Routes ============

userRouter.use(userAuthMiddleware);

// Current user
userRouter.get('/auth/me', async (req: Request, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const fullUser = await getUserById(user.id);
  res.json(fullUser);
});

// Account
userRouter.get('/account', async (req: Request, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const fullUser = await getUserById(user.id);
  res.json({
    email: fullUser.email,
    credits: fullUser.credits,
    is_approved: fullUser.is_approved,
    created_at: fullUser.created_at,
  });
});

userRouter.get('/account/usage', async (req: Request, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;
  const mappings = await getMappingsByUser(user.email, page, pageSize);
  res.json(mappings);
});

userRouter.get('/account/transactions', async (req: Request, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;
  const transactions = await getTransactionsByUser(user.id, page, pageSize);
  res.json(transactions);
});

// Workflow Directory
userRouter.get('/workflows', async (req: Request, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  // Return: public + own + where user is approved sender
  const workflows = await getAccessibleWorkflows(user.id, user.email);
  res.json(workflows);
});

userRouter.get('/workflows/directory', async (req: Request, res: Response) => {
  const workflows = await getPublicWorkflows();
  res.json(workflows);
});

userRouter.get('/workflows/mine', async (req: Request, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const workflows = await getWorkflowsByUser(user.id);
  res.json(workflows);
});

userRouter.get('/workflows/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const workflow = await getWorkflowById(id);
  if (!workflow) {
    return res.status(404).json({ error: 'Workflow not found' });
  }
  res.json(workflow);
});

// Create community workflow
userRouter.post('/workflows', async (req: Request, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const { name, description, instruction, credits_per_task, is_public } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name required' });
  }

  const existing = await getWorkflowByName(name);
  if (existing) {
    return res.status(409).json({ error: 'Workflow name already taken' });
  }

  const workflow = await createWorkflow({
    name: name.toLowerCase(),
    manus_address: 'arksenu@manus.bot',
    description,
    instruction,
    credits_per_task: credits_per_task || 10,
    is_public: is_public ?? true,
    type: 'community',
    created_by_user_id: user.id,
  });

  res.status(201).json(workflow);
});

// Update own workflow
userRouter.patch('/workflows/:id', async (req: Request, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const id = parseInt(req.params.id, 10);

  const workflow = await getWorkflowById(id);
  if (!workflow) {
    return res.status(404).json({ error: 'Workflow not found' });
  }
  if (workflow.created_by_user_id !== user.id) {
    return res.status(403).json({ error: 'Not your workflow' });
  }

  const updated = await updateWorkflow(id, req.body);
  res.json(updated);
});

// Delete own workflow
userRouter.delete('/workflows/:id', async (req: Request, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const id = parseInt(req.params.id, 10);

  const workflow = await getWorkflowById(id);
  if (!workflow) {
    return res.status(404).json({ error: 'Workflow not found' });
  }
  if (workflow.created_by_user_id !== user.id) {
    return res.status(403).json({ error: 'Not your workflow' });
  }

  await deleteWorkflow(id);
  res.status(204).send();
});

// Approved senders for own workflows
userRouter.get('/workflows/:id/senders', async (req: Request, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const id = parseInt(req.params.id, 10);

  const workflow = await getWorkflowById(id);
  if (!workflow || workflow.created_by_user_id !== user.id) {
    return res.status(403).json({ error: 'Not your workflow' });
  }

  const senders = await getApprovedSenders(id);
  res.json(senders);
});

userRouter.post('/workflows/:id/senders', async (req: Request, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const id = parseInt(req.params.id, 10);
  const { email } = req.body;

  const workflow = await getWorkflowById(id);
  if (!workflow || workflow.created_by_user_id !== user.id) {
    return res.status(403).json({ error: 'Not your workflow' });
  }

  const sender = await addApprovedSender(id, email, user.id);
  res.status(201).json(sender);
});

userRouter.delete('/workflows/:id/senders/:email', async (req: Request, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const id = parseInt(req.params.id, 10);
  const email = decodeURIComponent(req.params.email);

  const workflow = await getWorkflowById(id);
  if (!workflow || workflow.created_by_user_id !== user.id) {
    return res.status(403).json({ error: 'Not your workflow' });
  }

  await removeApprovedSender(id, email);
  res.status(204).send();
});
```

### 4.3 Mount User API

#### File: `src/index.ts`

```typescript
import { userRouter } from './api/user/routes';

// Mount user API
app.use('/api', userRouter);

// Serve user portal
app.use('/portal', express.static(path.join(__dirname, '../portal/dist')));
app.get('/portal/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../portal/dist/index.html'));
});
```

### 4.4 Frontend: User Portal

#### Directory Structure: `portal/`

```
portal/
├── src/
│   ├── pages/
│   │   ├── Login.tsx           - Email + password login
│   │   ├── Register.tsx        - Registration form
│   │   ├── Dashboard.tsx       - Credits, recent tasks, quick actions
│   │   ├── Directory.tsx       - Browse all public workflows
│   │   ├── MyWorkflows.tsx     - CRUD own workflows
│   │   └── Account.tsx         - Usage history, transactions, settings
│   ├── components/
│   │   ├── Layout.tsx          - Sidebar navigation
│   │   ├── WorkflowCard.tsx    - Reusable workflow display
│   │   └── TypeBadge.tsx       - Native/Official/Community badge
│   ├── lib/
│   │   └── api.ts              - API client with JWT handling
│   ├── App.tsx                 - Routes
│   └── main.tsx                - Entry point
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts              - base: '/portal'
```

#### Page Details:

**Login.tsx**
- Email + password form
- Link to register
- Redirect to dashboard on success

**Register.tsx**
- Email + password + confirm password
- Shows "pending approval" message after success
- Link to login

**Dashboard.tsx**
- Credit balance (large display)
- Approval status banner (if not approved)
- Recent 5 tasks with status
- Quick links: Browse Directory, My Workflows

**Directory.tsx**
- Grid of public workflow cards
- Search by name/description
- Filter by type (all/native/official/community)
- Each card shows: name, type badge, description, credits cost
- Click card for details

**MyWorkflows.tsx**
- List of user's created workflows
- "Create Workflow" button
- Each workflow: name, status badges, edit/delete actions
- Create/Edit modal with fields:
  - Name
  - Description
  - Instruction (with help text)
  - Credits per task
  - Is Public toggle
- Manage Approved Senders modal for private workflows

**Account.tsx**
- Email display
- Credits balance
- Usage history table (paginated)
- Transaction log table (paginated)

---

## Phase 5: Seed Script Update

### File: `scripts/seed-workflows.ts`

```typescript
import 'dotenv/config';
import { pool, query } from '../src/db/client';

const workflows = [
  {
    name: 'research',
    manus_address: 'arksenu-research@manus.bot',
    description: 'Conduct wide research based on the email content.',
    instruction: 'Conduct wide research based on the email content. Follow any specific instructions about format, scope, or deliverables provided in the email. Otherwise, use your discretion.',
    type: 'native',
    is_public: true,
    credits_per_task: 10,
  },
  {
    name: 'summarize',
    manus_address: 'arksenu-summarize@manus.bot',
    description: 'Summarize the contents of the email.',
    instruction: 'Summarize the contents of the email, which may also include external sources/links as well as attachments. Use discretion where not specified.',
    type: 'native',
    is_public: true,
    credits_per_task: 5,
  },
  {
    name: 'newsletter',
    manus_address: 'arksenu-newsletter@manus.bot',
    description: 'Gather information sources for the daily newsletter.',
    instruction: 'Gather informations sources for the daily newsletter and organize them into slides.',
    type: 'native',
    is_public: true,
    credits_per_task: 10,
  },
];

async function seed() {
  for (const wf of workflows) {
    await query(
      `INSERT INTO workflows (name, manus_address, description, instruction, type, is_public, credits_per_task)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (name) DO UPDATE SET
         manus_address = EXCLUDED.manus_address,
         description = EXCLUDED.description,
         instruction = EXCLUDED.instruction,
         type = EXCLUDED.type,
         is_public = EXCLUDED.is_public,
         credits_per_task = EXCLUDED.credits_per_task`,
      [wf.name, wf.manus_address, wf.description, wf.instruction, wf.type, wf.is_public, wf.credits_per_task]
    );
    console.log(`Seeded workflow: ${wf.name}`);
  }
  await pool.end();
  console.log('Done');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
```

---

## Files Summary

### New Files
- `migrations/003_custom_workflows.sql`
- `src/db/approvedSenders.ts`
- `src/manus/client.ts`
- `src/manus/webhook.ts`
- `src/api/user/middleware.ts`
- `src/api/user/routes.ts`
- `portal/` (entire directory)

### Modified Files
- `src/config.ts` - Add MANUS_API_KEY, MANUS_AGENT_PROFILE
- `src/db/workflows.ts` - New fields, new functions
- `src/db/users.ts` - Password functions
- `src/db/mappings.ts` - Rename column, getByTaskId, getByUser
- `src/db/transactions.ts` - getByUser function
- `src/email/inbound.ts` - API integration, access checks
- `src/api/routes.ts` - Manus webhook endpoint
- `src/api/admin/routes.ts` - Workflow CRUD, approved senders
- `src/index.ts` - Mount user API, serve portal
- `admin/src/lib/api.ts` - New types and functions
- `admin/src/pages/Workflows.tsx` - Create/senders modals, badges
- `scripts/seed-workflows.ts` - Add instruction, type fields
- `package.json` - Portal scripts, migrate update

### Deprecated Files
- `src/email/response.ts`
- `src/email/branding.ts`

---

## Verification Checklist

### Database
```bash
npm run migrate
docker compose exec db psql -U flybot -d flybot -c "\d workflows"
docker compose exec db psql -U flybot -d flybot -c "\d workflow_approved_senders"
docker compose exec db psql -U flybot -d flybot -c "SELECT name, type, is_public FROM workflows"
```

### Manus Setup
1. Get API key from Manus dashboard
2. Add to `.env`: `MANUS_API_KEY=...`
3. Register webhook URL: `https://yourdomain.com/webhooks/manus`
4. Verify test request succeeds

### Admin Panel
1. Login to `/admin`
2. Verify existing workflows show "Native" badge
3. Create new "Official" workflow
4. Set to private, add approved senders
5. Delete a non-native workflow

### Email Flow
1. Send email to `research@mail.fly-bot.net`
2. Check logs for Manus task creation
3. Wait for webhook (or check Manus dashboard)
4. Verify user receives response email

### User Portal
1. Register at `/portal/register`
2. Admin approves user via admin panel
3. Login, browse directory
4. Create community workflow
5. Test email to own workflow
