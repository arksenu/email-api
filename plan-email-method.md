# Custom Workflows - Email Relay Method Implementation Plan

Uses Manus email addresses for routing. Native workflows use dedicated Manus workflow emails, custom workflows use the main Manus email with prepended instructions.

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
If non-native: prepend instruction to body
    ↓
Forward email to Manus:
  - Native: arksenu-{workflow}@manus.bot
  - Custom: arksenu@manus.bot (with instruction)
    ↓
Store in email_mappings
    ↓
Return 200 to SendGrid

OUTBOUND FLOW:
Manus completes task → emails relay@mail.fly-bot.net
    ↓
SendGrid Inbound Parse → POST /webhooks/email/inbound
    ↓
Detect as Manus response (from @manus.bot)
    ↓
Skip if acknowledgment message ("I have received your task...")
    ↓
Match to original mapping via In-Reply-To or body markers
    ↓
Strip Manus branding from body
    ↓
Forward cleaned response to original sender
    ↓
Deduct credits, mark mapping complete
```

---

## Workflow Tiers

| Type | Badge | Manus Address | Instruction | Editable By |
|------|-------|---------------|-------------|-------------|
| **Native** | "Native" | arksenu-X@manus.bot | On Manus.im | Admin: credits, active only |
| **Official** | "Official" | arksenu@manus.bot | In our DB | Admin: all fields |
| **Community** | Creator name | arksenu@manus.bot | In our DB | Creator: all fields |

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

---

## Environment Variables

Existing (no changes needed):

```env
SENDGRID_API_KEY=...
FROM_DOMAIN=mail.fly-bot.net
RELAY_ADDRESS=relay@mail.fly-bot.net
```

---

## New Files

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

Add access check and instruction prepending:

```typescript
import { config } from '../config';
import { getUserByEmail } from '../db/users';
import { getWorkflowByName } from '../db/workflows';
import { createMapping, updateManusMessageId } from '../db/mappings';
import { isApprovedSender } from '../db/approvedSenders';
import { sendEmail, sendBounce } from './outbound';
import { ParsedEmail, extractWorkflow } from './parser';

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

  // Check workflow access (NEW)
  if (!workflowConfig.is_public) {
    const isCreator = workflowConfig.created_by_user_id === user.id;
    const approved = await isApprovedSender(workflowConfig.id, sender);
    if (!isCreator && !approved) {
      console.log(`Rejected: ${sender} not authorized for private workflow ${workflow}`);
      await sendBounce(sender, `Workflow '${workflow}' is private. Contact the creator for access.`);
      return;
    }
  }

  // Check credits
  if (user.credits < workflowConfig.credits_per_task) {
    console.log(`Rejected: insufficient credits for ${sender} (has ${user.credits}, needs ${workflowConfig.credits_per_task})`);
    await sendBounce(sender, `Insufficient credits. Balance: ${user.credits}, Required: ${workflowConfig.credits_per_task}`);
    return;
  }

  // Prepend instruction for non-native workflows (NEW)
  let textBody = email.text;
  let htmlBody = email.html;

  if (workflowConfig.type !== 'native' && workflowConfig.instruction) {
    // Prepend instruction to text body
    textBody = `[Workflow Instruction]\n${workflowConfig.instruction}\n\n[User Request]\n${email.text}`;

    // Prepend instruction to HTML body if present
    if (htmlBody) {
      const instructionHtml = workflowConfig.instruction.replace(/\n/g, '<br/>');
      htmlBody = `
        <div style="background:#f5f5f5;padding:12px;margin-bottom:16px;border-left:4px solid #0f4c75;font-family:sans-serif;">
          <strong style="color:#0f4c75;">Workflow Instruction:</strong><br/>
          <span style="color:#333;">${instructionHtml}</span>
        </div>
        <div style="margin-bottom:8px;"><strong>User Request:</strong></div>
        ${htmlBody}
      `;
    }
  }

  const mapping = await createMapping(email.messageId, sender, workflow);

  // Build body with fly-bot headers
  const body = `[fly-bot.net request from: ${sender}]\n[Mapping ID: ${mapping.id}]\n\n${textBody}`;

  const manusMessageId = await sendEmail({
    from: config.RELAY_ADDRESS,
    to: workflowConfig.manus_address,
    subject: email.subject,
    text: body,
    html: htmlBody ? `<p><em>[fly-bot.net request from: ${sender}]</em></p><p><em>[Mapping ID: ${mapping.id}]</em></p>${htmlBody}` : undefined,
    attachments: email.attachments,
    headers: {
      'X-Flybot-Mapping-Id': String(mapping.id),
      'X-Flybot-Original-Sender': sender,
    },
  });

  if (manusMessageId) {
    await updateManusMessageId(mapping.id, manusMessageId);
  }

  console.log(`Forwarded mapping ${mapping.id} from ${sender} to ${workflowConfig.manus_address}`);
}
```

### `src/db/workflows.ts`

Update createWorkflow to handle custom workflows:

```typescript
export async function createWorkflow(data: {
  name: string;
  description?: string | null;
  instruction?: string | null;
  credits_per_task?: number;
  is_public?: boolean;
  type?: 'official' | 'community';
  created_by_user_id?: number | null;
}): Promise<Workflow> {
  // Custom workflows always use main Manus address
  const manusAddress = 'arksenu@manus.bot';
  const type = data.type || 'community';

  const result = await queryOne<Workflow>(
    `INSERT INTO workflows (name, manus_address, description, instruction, credits_per_task, is_public, created_by_user_id, type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      data.name.toLowerCase(),
      manusAddress,
      data.description || null,
      data.instruction || null,
      data.credits_per_task || 5,
      data.is_public !== false,
      data.created_by_user_id || null,
      type,
    ]
  );
  return result!;
}

export async function deleteWorkflow(id: number): Promise<boolean> {
  const result = await query('DELETE FROM workflows WHERE id = $1 AND type != $2 RETURNING id', [id, 'native']);
  return result.length > 0;
}

export async function getPublicWorkflows(): Promise<Workflow[]> {
  return query<Workflow>(
    'SELECT * FROM workflows WHERE is_public = TRUE AND is_active = TRUE ORDER BY type, name'
  );
}

export async function getWorkflowsByUser(userId: number): Promise<Workflow[]> {
  return query<Workflow>(
    'SELECT * FROM workflows WHERE created_by_user_id = $1 ORDER BY name',
    [userId]
  );
}
```

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
    if (!instruction) {
      res.status(400).json({ error: 'Instruction required for custom workflows' });
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
  instruction: string;  // Required for email method
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
4. **Manus address display**: Shows actual routing address
5. **Create/Edit modal** with conditional fields based on type
6. **Approved Senders modal** for private workflows
7. **Delete button** (hidden for native)

Modal fields by type:

| Field | Native | Official/Community |
|-------|--------|-------------------|
| Name | Read-only | Editable |
| Manus Address | Read-only (dedicated) | Read-only (arksenu@manus.bot) |
| Description | Editable | Editable |
| Instruction | Hidden | Required (textarea) |
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
  // Require instruction field
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

## Manus.im Setup Required

1. **Approved sender**: `relay@mail.fly-bot.net` must be approved
2. **Workflow emails** (for native):
   - `arksenu-research@manus.bot`
   - `arksenu-summarize@manus.bot`
   - `arksenu-newsletter@manus.bot`
3. **Main email**: `arksenu@manus.bot` (for custom workflows)
4. **Disable memory**: Turn off conversation history for privacy

---

## Files to Keep

These existing files are still needed:

- `src/email/response.ts` - Handles Manus response emails
- `src/email/branding.ts` - Strips Manus branding from responses
- `relay@mail.fly-bot.net` - SendGrid inbound parse for Manus responses

---

## Implementation Order

### Phase 1: Database
1. Create `migrations/003_custom_workflows.sql`
2. Run migration
3. Update seed script to set `type = 'native'` for existing workflows

### Phase 2: Core Backend
4. Create `src/db/approvedSenders.ts`
5. Update `src/db/workflows.ts` with new fields and functions
6. Add password support to `src/db/users.ts`

### Phase 3: Inbound Handler
7. Update `src/email/inbound.ts` with access check and instruction prepending

### Phase 4: Admin Panel
8. Update `src/api/admin/routes.ts`
9. Update `admin/src/lib/api.ts`
10. Update `admin/src/pages/Workflows.tsx`

### Phase 5: User Platform
11. Create `src/api/user/middleware.ts`
12. Create `src/api/user/routes.ts`
13. Mount in `src/index.ts`
14. Create `portal/` frontend

---

## Key Difference from API Method

| Aspect | Email Method | API Method |
|--------|--------------|------------|
| **Instruction delivery** | Prepended to email body | Prepended to API prompt |
| **Response handling** | Parse incoming email | Webhook callback |
| **Attachments** | Email attachments | Download from S3 URLs |
| **Branding** | Must strip from response | None to strip |
| **Acknowledgments** | Must detect and skip | None (API doesn't send) |
| **Credit tracking** | Our own estimate | Exact from Manus API |
| **Dependencies** | None new | Manus API client |
| **Complexity** | More complex parsing | Cleaner webhook flow |

---

## Testing Checklist

- [ ] Native workflow (research) - email in, response back
- [ ] Official workflow with instruction - verify instruction visible in forwarded email
- [ ] Community workflow - user creates, uses, edits, deletes
- [ ] Private workflow - unauthorized user gets bounce
- [ ] Private workflow - approved sender succeeds
- [ ] Credits deducted on completion
- [ ] Attachments forwarded correctly
- [ ] Response email branding stripped
- [ ] Acknowledgment messages skipped
- [ ] Admin panel CRUD works
- [ ] User portal CRUD works
- [ ] Workflow directory shows correct workflows per user
