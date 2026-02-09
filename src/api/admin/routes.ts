import { Router, Request, Response } from 'express';
import { authMiddleware, signToken } from './middleware';
import { findAdminByUsername, verifyPassword } from '../../db/admins';
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  addCredits,
  sanitizeUser,
} from '../../db/users';
import {
  getAllWorkflows,
  getWorkflowById,
  isWorkflowNameTaken,
  updateWorkflow,
  createWorkflow,
  deleteWorkflow,
} from '../../db/workflows';
import {
  getApprovedSenders,
  addApprovedSender,
  removeApprovedSender,
} from '../../db/approvedSenders';
import { getAllMappings, getMappingById } from '../../db/mappings';
import { getAllTransactions } from '../../db/transactions';
import { query, queryOne } from '../../db/client';

export const adminRouter = Router();

// Auth routes (no middleware)
adminRouter.post('/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password required' });
      return;
    }

    const admin = await findAdminByUsername(username);
    if (!admin) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await verifyPassword(admin, password);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = signToken({ id: admin.id, username: admin.username });
    res.json({ token, admin: { id: admin.id, username: admin.username } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// All routes below require auth
adminRouter.use(authMiddleware);

// Dashboard stats
adminRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [usersCount, workflowsCount, mappingsStats, creditsStats] = await Promise.all([
      queryOne<{ count: string }>('SELECT COUNT(*) as count FROM users'),
      queryOne<{ count: string }>('SELECT COUNT(*) as count FROM workflows WHERE is_active = TRUE'),
      queryOne<{ total: string; pending: string; completed: string }>(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status = 'completed') as completed
        FROM email_mappings
      `),
      queryOne<{ total_credits: string; total_spent: string }>(`
        SELECT
          COALESCE(SUM(credits), 0) as total_credits,
          COALESCE(ABS(SUM(CASE WHEN credits_delta < 0 THEN credits_delta ELSE 0 END)), 0) as total_spent
        FROM users u
        LEFT JOIN transactions t ON u.id = t.user_id
      `),
    ]);

    res.json({
      users: {
        total: parseInt(usersCount?.count || '0', 10),
      },
      workflows: {
        active: parseInt(workflowsCount?.count || '0', 10),
      },
      tasks: {
        total: parseInt(mappingsStats?.total || '0', 10),
        pending: parseInt(mappingsStats?.pending || '0', 10),
        completed: parseInt(mappingsStats?.completed || '0', 10),
      },
      credits: {
        totalInSystem: parseInt(creditsStats?.total_credits || '0', 10),
        totalSpent: parseInt(creditsStats?.total_spent || '0', 10),
      },
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Users CRUD
adminRouter.get('/users', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const result = await getAllUsers(page, pageSize);
    res.json({ ...result, data: result.data.map(sanitizeUser) });
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

adminRouter.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const user = await getUserById(id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(sanitizeUser(user));
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

adminRouter.post('/users', async (req: Request, res: Response) => {
  try {
    const { email, credits, is_approved } = req.body;
    if (!email) {
      res.status(400).json({ error: 'Email required' });
      return;
    }
    const user = await createUser(email, credits || 0, is_approved || false);
    res.status(201).json(sanitizeUser(user));
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Email already exists' });
      return;
    }
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

adminRouter.patch('/users/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { email, credits, is_approved } = req.body;
    const user = await updateUser(id, { email, credits, is_approved });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(sanitizeUser(user));
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Email already exists' });
      return;
    }
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

adminRouter.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = await deleteUser(id);
    if (!deleted) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

adminRouter.post('/users/:id/credits', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { amount, reason } = req.body;
    if (typeof amount !== 'number') {
      res.status(400).json({ error: 'Amount required' });
      return;
    }
    const user = await addCredits(id, amount, reason || 'Admin adjustment');
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(sanitizeUser(user));
  } catch (err) {
    console.error('Add credits error:', err);
    res.status(500).json({ error: 'Failed to add credits' });
  }
});

// Workflows
adminRouter.get('/workflows', async (_req: Request, res: Response) => {
  try {
    const workflows = await getAllWorkflows();
    res.json(workflows);
  } catch (err) {
    console.error('Get workflows error:', err);
    res.status(500).json({ error: 'Failed to fetch workflows' });
  }
});

adminRouter.get('/workflows/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const workflow = await getWorkflowById(id);
    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }
    res.json(workflow);
  } catch (err) {
    console.error('Get workflow error:', err);
    res.status(500).json({ error: 'Failed to fetch workflow' });
  }
});

adminRouter.post('/workflows', async (req: Request, res: Response) => {
  try {
    const { name, description, instruction, credits_per_task, is_public } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Name required' });
      return;
    }

    const taken = await isWorkflowNameTaken(name);
    if (taken) {
      res.status(409).json({ error: 'Workflow name already exists' });
      return;
    }

    const workflow = await createWorkflow({
      name: name.toLowerCase(),
      manus_address: 'arksenu@manus.bot',
      description,
      instruction,
      credits_per_task: credits_per_task || 10,
      is_public: is_public ?? true,
      type: 'official',
      created_by_user_id: null,
    });

    res.status(201).json(workflow);
  } catch (err) {
    console.error('Create workflow error:', err);
    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

adminRouter.patch('/workflows/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, manus_address, description, instruction, credits_per_task, is_active, is_public } = req.body;
    const workflow = await updateWorkflow(id, { name, manus_address, description, instruction, credits_per_task, is_active, is_public });
    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }
    res.json(workflow);
  } catch (err) {
    console.error('Update workflow error:', err);
    res.status(500).json({ error: 'Failed to update workflow' });
  }
});

adminRouter.delete('/workflows/:id', async (req: Request, res: Response) => {
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

// Approved senders
adminRouter.get('/workflows/:id/senders', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const senders = await getApprovedSenders(id);
    res.json(senders);
  } catch (err) {
    console.error('Get approved senders error:', err);
    res.status(500).json({ error: 'Failed to fetch approved senders' });
  }
});

adminRouter.post('/workflows/:id/senders', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email required' });
      return;
    }

    const sender = await addApprovedSender(id, email);
    res.status(201).json(sender);
  } catch (err) {
    console.error('Add approved sender error:', err);
    res.status(500).json({ error: 'Failed to add approved sender' });
  }
});

adminRouter.delete('/workflows/:id/senders/:email', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const email = decodeURIComponent(req.params.email);
    await removeApprovedSender(id, email);
    res.status(204).send();
  } catch (err) {
    console.error('Remove approved sender error:', err);
    res.status(500).json({ error: 'Failed to remove approved sender' });
  }
});

// Mappings (activity)
adminRouter.get('/mappings', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const filters = {
      status: req.query.status as string,
      workflow: req.query.workflow as string,
      sender: req.query.sender as string,
      dateFrom: req.query.dateFrom as string,
      dateTo: req.query.dateTo as string,
    };
    const result = await getAllMappings(page, pageSize, filters);
    res.json(result);
  } catch (err) {
    console.error('Get mappings error:', err);
    res.status(500).json({ error: 'Failed to fetch mappings' });
  }
});

adminRouter.get('/mappings/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const mapping = await getMappingById(id);
    if (!mapping) {
      res.status(404).json({ error: 'Mapping not found' });
      return;
    }
    res.json(mapping);
  } catch (err) {
    console.error('Get mapping error:', err);
    res.status(500).json({ error: 'Failed to fetch mapping' });
  }
});

// Transactions
adminRouter.get('/transactions', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const userId = req.query.userId ? parseInt(req.query.userId as string, 10) : undefined;
    const result = await getAllTransactions(page, pageSize, userId);
    res.json(result);
  } catch (err) {
    console.error('Get transactions error:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});
