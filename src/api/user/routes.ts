import { Router, Request, Response } from 'express';
import { userAuthMiddleware, signUserToken, AuthenticatedRequest } from './middleware';
import {
  getUserByEmail,
  getUserById,
  createUserWithPassword,
  verifyUserPassword,
} from '../../db/users';
import {
  getPublicWorkflows,
  getWorkflowsByUser,
  getWorkflowByName,
  getWorkflowById,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  isWorkflowNameTaken,
} from '../../db/workflows';
import {
  getApprovedSenders,
  addApprovedSender,
  removeApprovedSender,
  isApprovedSender,
} from '../../db/approvedSenders';
import { getMappingsByUser } from '../../db/mappings';
import { getTransactionsByUser } from '../../db/transactions';

export const userRouter = Router();

// ============ Public Routes ============

// Register
userRouter.post('/auth/register', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const user = await createUserWithPassword(email, password);
    res.status(201).json({
      message: 'Registration successful. Your account is pending approval.',
      user: { id: user.id, email: user.email, is_approved: user.is_approved },
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
userRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' });
      return;
    }

    const user = await getUserByEmail(email);
    if (!user || !user.password_hash) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await verifyUserPassword(user, password);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = signUserToken({ id: user.id, email: user.email });
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        credits: user.credits,
        is_approved: user.is_approved,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ============ Protected Routes ============

userRouter.use(userAuthMiddleware);

// Current user
userRouter.get('/auth/me', async (req: Request, res: Response) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const fullUser = await getUserById(user.id);
    if (!fullUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({
      id: fullUser.id,
      email: fullUser.email,
      credits: fullUser.credits,
      is_approved: fullUser.is_approved,
      created_at: fullUser.created_at,
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Account
userRouter.get('/account', async (req: Request, res: Response) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const fullUser = await getUserById(user.id);
    if (!fullUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({
      id: fullUser.id,
      email: fullUser.email,
      credits: fullUser.credits,
      is_approved: fullUser.is_approved,
      created_at: fullUser.created_at,
    });
  } catch (err) {
    console.error('Get account error:', err);
    res.status(500).json({ error: 'Failed to get account' });
  }
});

userRouter.get('/account/usage', async (req: Request, res: Response) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const mappings = await getMappingsByUser(user.email, page, pageSize);
    res.json(mappings);
  } catch (err) {
    console.error('Get usage error:', err);
    res.status(500).json({ error: 'Failed to get usage' });
  }
});

userRouter.get('/account/transactions', async (req: Request, res: Response) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const transactions = await getTransactionsByUser(user.id, page, pageSize);
    res.json(transactions);
  } catch (err) {
    console.error('Get transactions error:', err);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

// Workflow Directory (public workflows)
userRouter.get('/workflows/directory', async (_req: Request, res: Response) => {
  try {
    const workflows = await getPublicWorkflows();
    res.json(workflows);
  } catch (err) {
    console.error('Get directory error:', err);
    res.status(500).json({ error: 'Failed to get workflows' });
  }
});

// User's own workflows
userRouter.get('/workflows/mine', async (req: Request, res: Response) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const workflows = await getWorkflowsByUser(user.id);
    res.json(workflows);
  } catch (err) {
    console.error('Get my workflows error:', err);
    res.status(500).json({ error: 'Failed to get workflows' });
  }
});

// All accessible workflows (public + own + approved sender)
userRouter.get('/workflows', async (req: Request, res: Response) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const publicWorkflows = await getPublicWorkflows();
    const myWorkflows = await getWorkflowsByUser(user.id);

    const publicIds = new Set(publicWorkflows.map((w) => w.id));
    const myIds = new Set(myWorkflows.map((w) => w.id));

    const combined = [...publicWorkflows];
    for (const w of myWorkflows) {
      if (!publicIds.has(w.id)) {
        combined.push(w);
      }
    }

    res.json(combined);
  } catch (err) {
    console.error('Get workflows error:', err);
    res.status(500).json({ error: 'Failed to get workflows' });
  }
});

// Get single workflow
userRouter.get('/workflows/:id', async (req: Request, res: Response) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const id = parseInt(req.params.id, 10);
    const workflow = await getWorkflowById(id);

    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    // Check access: public, or creator, or approved sender
    if (!workflow.is_public) {
      const isCreator = workflow.created_by_user_id === user.id;
      const isApproved = await isApprovedSender(workflow.id, user.email);
      if (!isCreator && !isApproved) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
    }

    res.json(workflow);
  } catch (err) {
    console.error('Get workflow error:', err);
    res.status(500).json({ error: 'Failed to get workflow' });
  }
});

// Create community workflow
userRouter.post('/workflows', async (req: Request, res: Response) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const { name, description, instruction, credits_per_task, is_public } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Name required' });
      return;
    }

    const normalizedName = name.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (normalizedName.length < 2) {
      res.status(400).json({ error: 'Name must be at least 2 characters (letters, numbers, hyphens only)' });
      return;
    }

    if (await isWorkflowNameTaken(normalizedName)) {
      res.status(409).json({ error: 'Workflow name already taken' });
      return;
    }

    const validCredits = credits_per_task !== undefined
      ? (typeof credits_per_task === 'number' && Number.isInteger(credits_per_task) && credits_per_task >= 1 ? credits_per_task : null)
      : 10;
    if (validCredits === null) {
      res.status(400).json({ error: 'credits_per_task must be a positive integer' });
      return;
    }

    const workflow = await createWorkflow({
      name: normalizedName,
      manus_address: 'arksenu@manus.bot',
      description: description || null,
      instruction: instruction || null,
      credits_per_task: validCredits,
      is_public: is_public ?? true,
      type: 'community',
      created_by_user_id: user.id,
    });

    res.status(201).json(workflow);
  } catch (err) {
    console.error('Create workflow error:', err);
    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

// Update own workflow
userRouter.patch('/workflows/:id', async (req: Request, res: Response) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const id = parseInt(req.params.id, 10);

    const workflow = await getWorkflowById(id);
    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    if (workflow.created_by_user_id !== user.id) {
      res.status(403).json({ error: 'Not your workflow' });
      return;
    }

    const { name, description, instruction, credits_per_task, is_public, is_active } = req.body;
    const updates: Record<string, unknown> = {};

    if (name !== undefined) {
      const normalizedName = name.toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (normalizedName !== workflow.name) {
        if (await isWorkflowNameTaken(normalizedName)) {
          res.status(409).json({ error: 'Workflow name already taken' });
          return;
        }
        updates.name = normalizedName;
      }
    }

    if (description !== undefined) updates.description = description;
    if (instruction !== undefined) updates.instruction = instruction;
    if (credits_per_task !== undefined) {
      if (typeof credits_per_task !== 'number' || credits_per_task < 1 || !Number.isInteger(credits_per_task)) {
        res.status(400).json({ error: 'credits_per_task must be a positive integer' });
        return;
      }
      updates.credits_per_task = credits_per_task;
    }
    if (is_public !== undefined) updates.is_public = is_public;
    if (is_active !== undefined) updates.is_active = is_active;

    const updated = await updateWorkflow(id, updates);
    res.json(updated);
  } catch (err) {
    console.error('Update workflow error:', err);
    res.status(500).json({ error: 'Failed to update workflow' });
  }
});

// Delete own workflow
userRouter.delete('/workflows/:id', async (req: Request, res: Response) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const id = parseInt(req.params.id, 10);

    const workflow = await getWorkflowById(id);
    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    if (workflow.created_by_user_id !== user.id) {
      res.status(403).json({ error: 'Not your workflow' });
      return;
    }

    await deleteWorkflow(id);
    res.status(204).send();
  } catch (err) {
    console.error('Delete workflow error:', err);
    res.status(500).json({ error: 'Failed to delete workflow' });
  }
});

// Approved senders for own workflows
userRouter.get('/workflows/:id/senders', async (req: Request, res: Response) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const id = parseInt(req.params.id, 10);

    const workflow = await getWorkflowById(id);
    if (!workflow || workflow.created_by_user_id !== user.id) {
      res.status(403).json({ error: 'Not your workflow' });
      return;
    }

    const senders = await getApprovedSenders(id);
    res.json(senders);
  } catch (err) {
    console.error('Get senders error:', err);
    res.status(500).json({ error: 'Failed to get senders' });
  }
});

userRouter.post('/workflows/:id/senders', async (req: Request, res: Response) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const id = parseInt(req.params.id, 10);
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email required' });
      return;
    }

    const workflow = await getWorkflowById(id);
    if (!workflow || workflow.created_by_user_id !== user.id) {
      res.status(403).json({ error: 'Not your workflow' });
      return;
    }

    const sender = await addApprovedSender(id, email, user.id);
    res.status(201).json(sender);
  } catch (err) {
    console.error('Add sender error:', err);
    res.status(500).json({ error: 'Failed to add sender' });
  }
});

userRouter.delete('/workflows/:id/senders/:email', async (req: Request, res: Response) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const id = parseInt(req.params.id, 10);
    const email = decodeURIComponent(req.params.email);

    const workflow = await getWorkflowById(id);
    if (!workflow || workflow.created_by_user_id !== user.id) {
      res.status(403).json({ error: 'Not your workflow' });
      return;
    }

    await removeApprovedSender(id, email);
    res.status(204).send();
  } catch (err) {
    console.error('Remove sender error:', err);
    res.status(500).json({ error: 'Failed to remove sender' });
  }
});
