# Custom Workflows - Email Method Implementation Plan

## Overview

Expand the workflow system to support three tiers of workflows with public/private visibility. Uses **Manus Email** for task execution with email-based response handling via relay address.

### Architecture

```
INBOUND:
User → workflow@mail.fly-bot.net → SendGrid → Server
    ↓
Validate user, check credits, check workflow access
    ↓
Prepend instruction to body (for non-native)
    ↓
Forward to arksenu@manus.bot (or arksenu-X@manus.bot for native)
From: relay@mail.fly-bot.net
    ↓
Store message_id in email_mappings

OUTBOUND:
Manus → relay@mail.fly-bot.net → SendGrid → Server
    ↓
Skip if acknowledgment message
    ↓
Match to mapping via headers/content
    ↓
Strip Manus branding
    ↓
Relay to original sender
    ↓
Deduct credits, mark mapping complete
```

### Workflow Tiers

| Type | Badge | Created By | Manus Address | Instruction |
|------|-------|------------|---------------|-------------|
| **Native** | "Native" | System | arksenu-X@manus.bot | On Manus.im (max 3) |
| **Official** | "Official" | Admin | arksenu@manus.bot | Prepended by server |
| **Community** | Creator name | User | arksenu@manus.bot | Prepended by server |

### Considerations
- Native workflows limited to 3 (Manus.im restriction)
- Official/Community workflows unlimited (all route through main email)
- Requires acknowledgment detection to skip "task received" messages
- Requires branding stripping from responses
- Response matching via email headers or body content

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

### File: `src/db/workflows.ts`

**Updated Interface:**
```typescript
export interface Workflow {
  id: number;
  name: string;
  manus_address: string;          // arksenu-X@manus.bot or arksenu@manus.bot
  description: string | null;     // Display text for directory
  instruction: string | null;     // Prepended to body (null for native)
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

## Phase 2: Email Handler Updates

### File: `src/email/inbound.ts` (modify)

Add access check and instruction prepending:

```typescript
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

  // NEW: Check workflow access (public or approved sender)
  if (!workflowConfig.is_public) {
    const isCreator = workflowConfig.created_by_user_id === user.id;
    const isApproved = await isApprovedSender(workflowConfig.id, sender);
    if (!isCreator && !isApproved) {
      await sendBounce(sender, `Workflow '${workflow}' is private. Request access from the creator.`);
      return;
    }
  }

  // ... existing credit check ...

  // Build body with instruction prepended (for non-native workflows)
  let body = email.text;
  let htmlBody = email.html;

  if (workflowConfig.type !== 'native' && workflowConfig.instruction) {
    const instructionBlock = `[Workflow Instruction]\n${workflowConfig.instruction}\n\n[User Request]\n`;
    body = instructionBlock + body;

    if (htmlBody) {
      htmlBody = `
        <div style="background:#f5f5f5;padding:12px;margin-bottom:16px;border-left:4px solid #0f4c75;">
          <strong>Workflow Instruction:</strong><br/>
          ${workflowConfig.instruction.replace(/\n/g, '<br/>')}
        </div>
        <div><strong>User Request:</strong></div>
        ${htmlBody}`;
    }
  }

  // Create mapping
  const mapping = await createMapping(email.messageId, sender, workflow);

  // Determine target address
  // Native: use specific manus address (arksenu-research@manus.bot)
  // Official/Community: use main manus email (arksenu@manus.bot)
  const targetAddress = workflowConfig.type === 'native'
    ? workflowConfig.manus_address
    : 'arksenu@manus.bot';

  // Forward to Manus
  const bodyWithMeta = `[fly-bot.net request from: ${sender}]\n[Mapping ID: ${mapping.id}]\n\n${body}`;
  const htmlWithMeta = htmlBody
    ? `<p><em>[fly-bot.net request from: ${sender}]</em></p><p><em>[Mapping ID: ${mapping.id}]</em></p>${htmlBody}`
    : undefined;

  const manusMessageId = await sendEmail({
    from: config.RELAY_ADDRESS,
    to: targetAddress,
    subject: email.subject,
    text: bodyWithMeta,
    html: htmlWithMeta,
    attachments: email.attachments,
    headers: {
      'X-Flybot-Mapping-Id': String(mapping.id),
      'X-Flybot-Original-Sender': sender,
    },
  });

  if (manusMessageId) {
    await updateManusMessageId(mapping.id, manusMessageId);
  }

  console.log(`Forwarded mapping ${mapping.id} to ${targetAddress}`);
}
```

### File: `src/email/response.ts` (existing, verify)

Ensure response handler:
1. Detects and skips acknowledgment messages
2. Matches response to original mapping
3. Strips Manus branding
4. Relays to original sender
5. Deducts credits

No major changes needed if already working, but verify it handles:
- Responses from `arksenu@manus.bot` (for official/community workflows)
- Mapping lookup works correctly

### File: `src/email/branding.ts` (existing, verify)

Ensure acknowledgment detection patterns are accurate:
- "I have received your task"
- "I'll get started"
- etc.

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
  if (!instruction) {
    return res.status(400).json({ error: 'Instruction required for official workflows' });
  }

  // Check name not taken
  const existing = await getWorkflowByName(name);
  if (existing) {
    return res.status(409).json({ error: 'Workflow name already exists' });
  }

  const workflow = await createWorkflow({
    name: name.toLowerCase(),
    manus_address: 'arksenu@manus.bot',  // All official/community use main email
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
  instruction: string;  // Required for official
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
   - Info text: "Native workflows use dedicated Manus addresses. Official/Community workflows route through the main Manus email."

2. **Workflow Cards Display:**
   - Type badge: "Native" (gray), "Official" (blue), "Community" (purple)
   - Visibility: "Public" (green) / "Private" (orange)
   - For native: show manus address (e.g., arksenu-research@manus.bot)
   - For official/community: show "via arksenu@manus.bot"
   - For community: show creator email
   - For private: show approved sender count
   - Email format preview: `{name}@mail.fly-bot.net`

3. **Modal States:**
   ```typescript
   type ModalType = 'create' | 'edit' | 'delete' | 'senders' | null;
   ```

4. **Create Modal Fields:**
   - Name (required, lowercase enforced)
   - Description (textarea, for directory display)
   - Instruction (textarea, required, with explanation: "This instruction will be prepended to every email sent to this workflow")
   - Credits per Task (number)
   - Is Public (checkbox)

5. **Edit Modal Fields:**
   | Field | Native | Official | Community |
   |-------|--------|----------|-----------|
   | Name | Read-only | Editable | Editable |
   | Manus Address | Read-only | Read-only | Read-only |
   | Description | Editable | Editable | Editable |
   | Instruction | Hidden (on Manus.im) | Editable | Editable |
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
import { getUserByEmail, getUserById, createUserWithPassword, verifyUserPassword } from '../../db/users';
import { getPublicWorkflows, getWorkflowsByUser, createWorkflow, updateWorkflow, deleteWorkflow, getWorkflowById, getWorkflowByName } from '../../db/workflows';
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
  if (!instruction) {
    return res.status(400).json({ error: 'Instruction required' });
  }

  const existing = await getWorkflowByName(name);
  if (existing) {
    return res.status(409).json({ error: 'Workflow name already taken' });
  }

  const workflow = await createWorkflow({
    name: name.toLowerCase(),
    manus_address: 'arksenu@manus.bot',  // All community use main email
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
- Each card shows:
  - Name
  - Type badge (Native shows "Powered by dedicated Manus workflow")
  - Description
  - Credits cost
  - Creator (for community)
- Click card for details

**MyWorkflows.tsx**
- List of user's created workflows
- "Create Workflow" button
- Each workflow: name, status badges, edit/delete actions
- Create/Edit modal with fields:
  - Name
  - Description (for directory)
  - Instruction (with help text: "This will be prepended to emails")
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
    manus_address: 'arksenu-research@manus.bot',  // Dedicated Manus workflow
    description: 'Conduct wide research based on the email content.',
    instruction: null,  // Native - instruction lives on Manus.im
    type: 'native',
    is_public: true,
    credits_per_task: 10,
  },
  {
    name: 'summarize',
    manus_address: 'arksenu-summarize@manus.bot',
    description: 'Summarize the contents of the email.',
    instruction: null,
    type: 'native',
    is_public: true,
    credits_per_task: 5,
  },
  {
    name: 'newsletter',
    manus_address: 'arksenu-newsletter@manus.bot',
    description: 'Gather information sources for the daily newsletter.',
    instruction: null,
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
- `src/api/user/middleware.ts`
- `src/api/user/routes.ts`
- `portal/` (entire directory)

### Modified Files
- `src/db/workflows.ts` - New fields, new functions
- `src/db/users.ts` - Password functions
- `src/db/mappings.ts` - getByUser function
- `src/db/transactions.ts` - getByUser function
- `src/email/inbound.ts` - Access checks, instruction prepending
- `src/api/admin/routes.ts` - Workflow CRUD, approved senders
- `src/index.ts` - Mount user API, serve portal
- `admin/src/lib/api.ts` - New types and functions
- `admin/src/pages/Workflows.tsx` - Create/senders modals, badges
- `scripts/seed-workflows.ts` - Add type field
- `package.json` - Portal scripts, migrate update

### Existing Files (no changes)
- `src/email/response.ts` - Keep as-is
- `src/email/branding.ts` - Keep as-is

---

## Comparison: Email Method vs API Method

| Aspect | Email Method | API Method |
|--------|--------------|------------|
| **Native workflows** | 3 max (Manus.im limit) | Unlimited (all use API) |
| **Response handling** | Parse email, match headers | Webhook with structured data |
| **Attachments** | Email attachments | Download from S3 URLs |
| **Credit tracking** | Manual tracking | `credit_usage` from API |
| **Acknowledgment messages** | Must detect and skip | None |
| **Branding** | Must strip | None |
| **Relay address** | Required | Not needed |
| **Complexity** | Higher | Lower |
| **Existing code reuse** | Most code stays | Replace email forwarding |

---

## Verification Checklist

### Database
```bash
npm run migrate
docker compose exec db psql -U flybot -d flybot -c "\d workflows"
docker compose exec db psql -U flybot -d flybot -c "\d workflow_approved_senders"
docker compose exec db psql -U flybot -d flybot -c "SELECT name, type, manus_address FROM workflows"
```

### Admin Panel
1. Login to `/admin`
2. Verify existing workflows show "Native" badge
3. Create new "Official" workflow with instruction
4. Verify it shows "via arksenu@manus.bot"
5. Set to private, add approved senders
6. Delete a non-native workflow

### Email Flow (Native)
1. Send email to `research@mail.fly-bot.net`
2. Check logs: should forward to `arksenu-research@manus.bot`
3. Wait for Manus response
4. Verify user receives response email

### Email Flow (Official/Community)
1. Create workflow "powerpoint" with instruction
2. Send email to `powerpoint@mail.fly-bot.net`
3. Check logs: should forward to `arksenu@manus.bot` with instruction prepended
4. Verify response received

### Private Workflow Access
1. Create private workflow
2. Send from non-approved email → verify bounce
3. Add sender to approved list
4. Send again → verify success

### User Portal
1. Register at `/portal/register`
2. Admin approves user via admin panel
3. Login, browse directory
4. Create community workflow with instruction
5. Test email to own workflow
