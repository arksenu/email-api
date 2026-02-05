# Custom Workflows - API Method Implementation Plan

Uses Manus REST API for task creation and webhook for responses. Cleaner architecture with no email parsing on the response side.

---

## Architecture Overview

```
INBOUND FLOW:
User emails workflow@mail.fly-bot.net
    ↓
SendGrid Inbound Parse webhook → POST /webhooks/email/inbound
    ↓
Validate: user registered, approved, sufficient credits
    ↓
Lookup workflow → check public or approved sender
    ↓
Build prompt: instruction (if any) + user's email body
    ↓
POST https://api.manus.ai/v1/tasks
    { prompt, attachments (base64) }
    ↓
Store task_id in email_mappings
    ↓
Return 200 to SendGrid

OUTBOUND FLOW:
Manus completes task → sends webhook to POST /webhooks/manus
    ↓
Payload: { task_id, message, attachments: [{file_name, url, size_bytes}] }
    ↓
Lookup mapping by task_id
    ↓
Download attachments from S3 presigned URLs
    ↓
GET /v1/tasks/{task_id} → get credit_usage
    ↓
Send email to original sender via SendGrid (text + attachments)
    ↓
Deduct credits, mark mapping complete
```

---

## Workflow Tiers

| Type | Badge | Created By | Manus Integration | Editable By |
|------|-------|------------|-------------------|-------------|
| **Native** | "Native" | System | API (no instruction) | Admin: credits, active only |
| **Official** | "Official" | Admin | API + instruction | Admin: all fields |
| **Community** | Creator name | User | API + instruction | Creator: all fields |

All workflows route through the same API - the difference is whether an instruction is prepended.

---

## Database Changes

### Migration: `migrations/003_custom_workflows.sql`

```sql
-- Add new columns to workflows
ALTER TABLE workflows ADD COLUMN type VARCHAR(20) DEFAULT 'community';
ALTER TABLE workflows ADD COLUMN instruction TEXT;
ALTER TABLE workflows ADD COLUMN is_public BOOLEAN DEFAULT TRUE;
ALTER TABLE workflows ADD COLUMN created_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE workflows ADD COLUMN created_at TIMESTAMP DEFAULT NOW();

-- Update existing workflows to native type
UPDATE workflows SET type = 'native', is_public = TRUE
WHERE name IN ('research', 'summarize', 'newsletter');

-- Rename for clarity (was storing email message ID, now stores Manus task ID)
ALTER TABLE email_mappings RENAME COLUMN manus_message_id TO manus_task_id;

-- Add credit_usage tracking from Manus
ALTER TABLE email_mappings ADD COLUMN manus_credit_usage INTEGER;

-- Indexes
CREATE INDEX idx_workflows_public ON workflows(is_public, is_active);
CREATE INDEX idx_workflows_type ON workflows(type);
CREATE INDEX idx_workflows_created_by ON workflows(created_by_user_id);
CREATE INDEX idx_mappings_task_id ON email_mappings(manus_task_id);

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

---

## Environment Variables

Add to `.env`:

```env
MANUS_API_KEY=your_manus_api_key
MANUS_WEBHOOK_SECRET=optional_webhook_secret
MANUS_AGENT_PROFILE=manus-1.6
```

Remove (no longer needed):
```env
# RELAY_ADDRESS - not needed with API method
```

---

## New Files

### `src/manus/client.ts`

```typescript
import { config } from '../config';

const MANUS_API_BASE = 'https://api.manus.ai/v1';

export interface CreateTaskRequest {
  prompt: string;
  agentProfile?: 'manus-1.6' | 'manus-1.6-lite' | 'manus-1.6-max';
  attachments?: Array<{
    type: 'base64';
    data: string;
    filename: string;
    mediaType: string;
  }>;
}

export interface CreateTaskResponse {
  task_id: string;
  task_title: string;
  task_url: string;
}

export interface GetTaskResponse {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  credit_usage: number;
}

export interface TaskStoppedWebhook {
  event_id: string;
  event_type: 'task_stopped';
  task_id: string;
  task_title: string;
  task_url: string;
  message: string;
  stop_reason: 'finish' | 'ask';
  attachments: Array<{
    file_name: string;
    url: string;
    size_bytes: number;
  }>;
}

export async function createTask(req: CreateTaskRequest): Promise<CreateTaskResponse> {
  const response = await fetch(`${MANUS_API_BASE}/tasks`, {
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

  if (!response.ok) {
    throw new Error(`Manus API error: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

export async function getTask(taskId: string): Promise<GetTaskResponse> {
  const response = await fetch(`${MANUS_API_BASE}/tasks/${taskId}`, {
    headers: {
      'Authorization': `Bearer ${config.MANUS_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Manus API error: ${response.status}`);
  }

  return response.json();
}

export async function downloadAttachment(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download attachment: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}
```

### `src/manus/webhook.ts`

```typescript
import { TaskStoppedWebhook, getTask, downloadAttachment } from './client';
import { getMappingByTaskId, completeMapping } from '../db/mappings';
import { deductCredits } from '../db/users';
import { sendEmail } from '../email/outbound';

export async function handleManusWebhook(payload: TaskStoppedWebhook): Promise<void> {
  console.log(`Manus webhook: task ${payload.task_id} stopped (${payload.stop_reason})`);

  if (payload.stop_reason !== 'finish') {
    console.log(`Task ${payload.task_id} needs user input, skipping`);
    return;
  }

  // Find the original mapping
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

  // Get credit usage from Manus
  const taskDetails = await getTask(payload.task_id);
  const creditsUsed = taskDetails.credit_usage;

  // Send response email to original sender
  await sendEmail({
    to: mapping.original_sender,
    subject: `Re: ${mapping.original_subject || 'Your request'}`,
    text: payload.message,
    attachments,
  });

  // Deduct credits and complete mapping
  await deductCredits(mapping.user_id, creditsUsed, `Workflow: ${mapping.workflow}`, mapping.id);
  await completeMapping(mapping.id, creditsUsed);

  console.log(`Completed mapping ${mapping.id}, charged ${creditsUsed} credits`);
}
```

### `src/db/approvedSenders.ts`

```typescript
import { query, queryOne } from './client';

export interface ApprovedSender {
  id: number;
  workflow_id: number;
  email: string;
  added_by_user_id: number | null;
  created_at: Date;
}

export async function getApprovedSenders(workflowId: number): Promise<ApprovedSender[]> {
  return query<ApprovedSender>(
    'SELECT * FROM workflow_approved_senders WHERE workflow_id = $1 ORDER BY email',
    [workflowId]
  );
}

export async function addApprovedSender(
  workflowId: number,
  email: string,
  addedByUserId?: number
): Promise<ApprovedSender> {
  const result = await queryOne<ApprovedSender>(
    `INSERT INTO workflow_approved_senders (workflow_id, email, added_by_user_id)
     VALUES ($1, $2, $3) RETURNING *`,
    [workflowId, email.toLowerCase(), addedByUserId || null]
  );
  return result!;
}

export async function removeApprovedSender(workflowId: number, email: string): Promise<boolean> {
  const result = await query(
    'DELETE FROM workflow_approved_senders WHERE workflow_id = $1 AND email = $2',
    [workflowId, email.toLowerCase()]
  );
  return result.length > 0;
}

export async function isApprovedSender(workflowId: number, email: string): Promise<boolean> {
  const result = await queryOne<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM workflow_approved_senders WHERE workflow_id = $1 AND email = $2) as exists',
    [workflowId, email.toLowerCase()]
  );
  return result?.exists || false;
}
```

---

## Modified Files

### `src/email/inbound.ts`

Replace email forwarding with Manus API:

```typescript
import { config } from '../config';
import { getUserByEmail } from '../db/users';
import { getWorkflowByName } from '../db/workflows';
import { createMapping, updateManusTaskId } from '../db/mappings';
import { isApprovedSender } from '../db/approvedSenders';
import { sendBounce } from './outbound';
import { ParsedEmail, extractWorkflow } from './parser';
import { createTask } from '../manus/client';

export async function handleInboundEmail(email: ParsedEmail): Promise<void> {
  const sender = email.from;
  const workflow = extractWorkflow(email.to);

  // Validate user
  const user = await getUserByEmail(sender);
  if (!user) {
    console.log(`Rejected: unregistered sender ${sender}`);
    await sendBounce(sender, 'Not registered. Sign up at fly-bot.net');
    return;
  }

  if (!user.is_approved) {
    console.log(`Rejected: unapproved user ${sender}`);
    await sendBounce(sender, 'Account pending approval');
    return;
  }

  // Validate workflow
  const workflowConfig = await getWorkflowByName(workflow);
  if (!workflowConfig) {
    console.log(`Rejected: unknown workflow ${workflow}`);
    await sendBounce(sender, `Unknown workflow: ${workflow}`);
    return;
  }

  if (!workflowConfig.is_active) {
    console.log(`Rejected: inactive workflow ${workflow}`);
    await sendBounce(sender, `Workflow '${workflow}' is currently inactive`);
    return;
  }

  // Check workflow access
  if (!workflowConfig.is_public) {
    const isCreator = workflowConfig.created_by_user_id === user.id;
    const approved = await isApprovedSender(workflowConfig.id, sender);
    if (!isCreator && !approved) {
      console.log(`Rejected: ${sender} not authorized for private workflow ${workflow}`);
      await sendBounce(sender, `Workflow '${workflow}' is private. Contact the creator for access.`);
      return;
    }
  }

  // Check credits (estimate - actual deducted on completion)
  if (user.credits < workflowConfig.credits_per_task) {
    console.log(`Rejected: insufficient credits for ${sender}`);
    await sendBounce(sender, `Insufficient credits. Balance: ${user.credits}, Estimated: ${workflowConfig.credits_per_task}`);
    return;
  }

  // Build prompt with instruction
  let prompt = email.text;
  if (workflowConfig.instruction) {
    prompt = `[Workflow Instruction]\n${workflowConfig.instruction}\n\n[User Request]\n${email.text}`;
  }

  // Convert email attachments to base64 for Manus API
  const attachments = email.attachments?.map((att) => ({
    type: 'base64' as const,
    data: att.content.toString('base64'),
    filename: att.filename || 'attachment',
    mediaType: att.contentType || 'application/octet-stream',
  }));

  // Create mapping first
  const mapping = await createMapping(email.messageId, sender, workflow, user.id, email.subject);

  try {
    // Create Manus task
    const result = await createTask({ prompt, attachments });
    await updateManusTaskId(mapping.id, result.task_id);
    console.log(`Created Manus task ${result.task_id} for mapping ${mapping.id}`);
  } catch (err) {
    console.error(`Failed to create Manus task for mapping ${mapping.id}:`, err);
    await sendBounce(sender, 'Failed to process your request. Please try again later.');
    // TODO: Mark mapping as failed
  }
}
```

### `src/api/routes.ts`

Add Manus webhook endpoint:

```typescript
import { handleManusWebhook } from '../manus/webhook';

// Manus webhook endpoint
router.post('/webhooks/manus', async (req, res) => {
  try {
    // Optional: verify webhook signature
    await handleManusWebhook(req.body);
    res.status(200).send('OK');
  } catch (err) {
    console.error('Manus webhook error:', err);
    res.status(500).send('Error');
  }
});
```

### `src/db/mappings.ts`

Update for task_id:

```typescript
// Add these functions:

export async function getMappingByTaskId(taskId: string): Promise<MappingWithUser | null> {
  return queryOne<MappingWithUser>(
    `SELECT m.*, u.id as user_id
     FROM email_mappings m
     JOIN users u ON u.email = m.original_sender
     WHERE m.manus_task_id = $1`,
    [taskId]
  );
}

export async function updateManusTaskId(id: number, taskId: string): Promise<void> {
  await query('UPDATE email_mappings SET manus_task_id = $1 WHERE id = $2', [taskId, id]);
}

export async function completeMapping(id: number, creditsUsed: number): Promise<void> {
  await query(
    `UPDATE email_mappings
     SET status = 'completed', completed_at = NOW(), credits_charged = $1, manus_credit_usage = $1
     WHERE id = $2`,
    [creditsUsed, id]
  );
}
```

---

## Files to Remove/Deprecate

These files are no longer needed with the API method:

- `src/email/response.ts` - Webhook handles responses
- `src/email/branding.ts` - No branding in API responses

The `relay@mail.fly-bot.net` SendGrid inbound parse can be disabled.

---

## Admin Panel Updates

### Backend: `src/api/admin/routes.ts`

Add new endpoints:

```typescript
import { createWorkflow, deleteWorkflow } from '../../db/workflows';
import { getApprovedSenders, addApprovedSender, removeApprovedSender } from '../../db/approvedSenders';

// Create workflow (official type)
adminRouter.post('/workflows', async (req, res) => {
  try {
    const { name, description, instruction, credits_per_task, is_public } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Name required' });
      return;
    }
    const workflow = await createWorkflow({
      name,
      description,
      instruction,
      credits_per_task: credits_per_task || 5,
      is_public: is_public !== false,
      type: 'official',
      created_by_user_id: null,
    });
    res.status(201).json(workflow);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Workflow name already exists' });
      return;
    }
    console.error('Create workflow error:', err);
    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

// Delete workflow
adminRouter.delete('/workflows/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const workflow = await getWorkflowById(id);
    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }
    if (workflow.type === 'native') {
      res.status(403).json({ error: 'Cannot delete native workflows' });
      return;
    }
    await deleteWorkflow(id);
    res.status(204).send();
  } catch (err) {
    console.error('Delete workflow error:', err);
    res.status(500).json({ error: 'Failed to delete workflow' });
  }
});

// Get approved senders
adminRouter.get('/workflows/:id/senders', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const senders = await getApprovedSenders(id);
    res.json(senders);
  } catch (err) {
    console.error('Get senders error:', err);
    res.status(500).json({ error: 'Failed to fetch senders' });
  }
});

// Add approved sender
adminRouter.post('/workflows/:id/senders', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { email } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email required' });
      return;
    }
    const sender = await addApprovedSender(id, email);
    res.status(201).json(sender);
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Email already approved' });
      return;
    }
    console.error('Add sender error:', err);
    res.status(500).json({ error: 'Failed to add sender' });
  }
});

// Remove approved sender
adminRouter.delete('/workflows/:id/senders/:email', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const email = decodeURIComponent(req.params.email);
    await removeApprovedSender(id, email);
    res.status(204).send();
  } catch (err) {
    console.error('Remove sender error:', err);
    res.status(500).json({ error: 'Failed to remove sender' });
  }
});
```

### Frontend: `admin/src/lib/api.ts`

Add new types and functions:

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
  // Stats (from JOIN)
  total_tasks?: number;
  completed_tasks?: number;
  total_credits_earned?: number;
}

export interface ApprovedSender {
  id: number;
  workflow_id: number;
  email: string;
  added_by_user_id: number | null;
  created_at: string;
}

export interface CreateWorkflowPayload {
  name: string;
  description?: string;
  instruction?: string;
  credits_per_task?: number;
  is_public?: boolean;
}

export async function createWorkflow(data: CreateWorkflowPayload): Promise<Workflow> {
  return request<Workflow>('/workflows', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteWorkflow(id: number): Promise<void> {
  await request<void>(`/workflows/${id}`, { method: 'DELETE' });
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
  await request<void>(`/workflows/${workflowId}/senders/${encodeURIComponent(email)}`, {
    method: 'DELETE',
  });
}
```

### Frontend: `admin/src/pages/Workflows.tsx`

Update to include:

1. **Create Workflow button** in header
2. **Type badges**: Native (gray), Official (blue), Community (purple)
3. **Visibility badges**: Public (green), Private (orange)
4. **Create/Edit modal** with conditional fields based on type
5. **Approved Senders modal** for private workflows
6. **Delete button** (hidden for native)

Modal fields by type:

| Field | Native | Official/Community |
|-------|--------|-------------------|
| Name | Read-only | Editable |
| Description | Editable | Editable |
| Instruction | Hidden | Editable (textarea) |
| Credits/Task | Editable | Editable |
| Is Public | Read-only (true) | Editable |
| Is Active | Editable | Editable |

---

## User Platform

### Backend: `src/api/user/middleware.ts`

```typescript
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { config } from '../../config';

export interface UserPayload {
  id: number;
  email: string;
}

export function userAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.JWT_SECRET + '_user') as UserPayload;
    (req as any).user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function signUserToken(payload: UserPayload): string {
  return jwt.sign(payload, config.JWT_SECRET + '_user', { expiresIn: '7d' });
}
```

### Backend: `src/api/user/routes.ts`

```typescript
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { userAuthMiddleware, signUserToken } from './middleware';
import { getUserByEmail, createUserWithPassword, verifyUserPassword } from '../../db/users';
import { getPublicWorkflows, getWorkflowsByUser, createWorkflow, updateWorkflow, deleteWorkflow } from '../../db/workflows';
import { getApprovedSenders, addApprovedSender, removeApprovedSender } from '../../db/approvedSenders';
import { getUserMappings, getUserTransactions } from '../../db/transactions';

export const userRouter = Router();

// Auth routes
userRouter.post('/auth/register', async (req, res) => {
  const { email, password } = req.body;
  // Create user with is_approved = false
  // Return success message about pending approval
});

userRouter.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  // Verify credentials, return JWT
});

userRouter.get('/auth/me', userAuthMiddleware, async (req, res) => {
  // Return current user info
});

// Account routes
userRouter.get('/account', userAuthMiddleware, async (req, res) => {
  // Return user profile + credits
});

userRouter.get('/account/usage', userAuthMiddleware, async (req, res) => {
  // Return user's task history
});

userRouter.get('/account/transactions', userAuthMiddleware, async (req, res) => {
  // Return user's credit transactions
});

// Workflow directory
userRouter.get('/workflows', userAuthMiddleware, async (req, res) => {
  // Return all accessible workflows (public + own + approved-for)
});

userRouter.get('/workflows/directory', async (req, res) => {
  // Public directory - no auth required
});

userRouter.get('/workflows/mine', userAuthMiddleware, async (req, res) => {
  // Return user's created workflows
});

// Workflow management
userRouter.post('/workflows', userAuthMiddleware, async (req, res) => {
  // Create community workflow
  // Set type = 'community', created_by_user_id = user.id
});

userRouter.patch('/workflows/:id', userAuthMiddleware, async (req, res) => {
  // Update own workflow only
});

userRouter.delete('/workflows/:id', userAuthMiddleware, async (req, res) => {
  // Delete own workflow only
});

// Approved senders (own workflows only)
userRouter.get('/workflows/:id/senders', userAuthMiddleware, async (req, res) => {
  // Verify ownership first
});

userRouter.post('/workflows/:id/senders', userAuthMiddleware, async (req, res) => {
  // Verify ownership first
});

userRouter.delete('/workflows/:id/senders/:email', userAuthMiddleware, async (req, res) => {
  // Verify ownership first
});
```

### Frontend: `portal/`

New Vite React app with pages:

1. **Login/Register** - Email + password auth
2. **Dashboard** - Credit balance, recent tasks
3. **Directory** - Browse all public workflows with search/filter
4. **My Workflows** - Create/edit/delete own workflows, manage approved senders
5. **Account** - Usage history, transactions

---

## Implementation Order

### Phase 1: Database
1. Create `migrations/003_custom_workflows.sql`
2. Run migration
3. Update seed script to set `type = 'native'` for existing workflows

### Phase 2: Core Backend
4. Create `src/db/approvedSenders.ts`
5. Update `src/db/workflows.ts` with new fields and functions
6. Update `src/db/mappings.ts` for task_id
7. Add password support to `src/db/users.ts`

### Phase 3: Manus Integration
8. Create `src/manus/client.ts`
9. Create `src/manus/webhook.ts`
10. Update `src/email/inbound.ts`
11. Add webhook route in `src/api/routes.ts`
12. Update `src/config.ts` for new env vars

### Phase 4: Admin Panel
13. Update `src/api/admin/routes.ts`
14. Update `admin/src/lib/api.ts`
15. Update `admin/src/pages/Workflows.tsx`

### Phase 5: User Platform
16. Create `src/api/user/middleware.ts`
17. Create `src/api/user/routes.ts`
18. Mount in `src/index.ts`
19. Create `portal/` frontend

### Phase 6: Cleanup
20. Remove `src/email/response.ts`
21. Remove `src/email/branding.ts`
22. Update docs

---

## Manus Setup Required

1. Get API key from Manus dashboard
2. Configure webhook URL: `https://yourdomain.com/webhooks/manus`
3. Verify webhook endpoint responds with 200

---

## Testing Checklist

- [ ] Native workflow (research) - email in, response back
- [ ] Official workflow with instruction - verify instruction prepended
- [ ] Community workflow - user creates, uses, edits, deletes
- [ ] Private workflow - unauthorized user gets bounce
- [ ] Private workflow - approved sender succeeds
- [ ] Credits deducted correctly (from Manus credit_usage)
- [ ] Attachments downloaded and sent in response email
- [ ] Admin panel CRUD works
- [ ] User portal CRUD works
- [ ] Workflow directory shows correct workflows per user
