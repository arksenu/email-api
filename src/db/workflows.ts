import { query, queryOne } from './client';

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
  created_at: Date;
}

export interface WorkflowStats extends Workflow {
  total_tasks: number;
  pending_tasks: number;
  completed_tasks: number;
  total_credits_earned: number;
}

export interface CreateWorkflowData {
  name: string;
  manus_address: string;
  description?: string | null;
  instruction?: string | null;
  credits_per_task?: number;
  is_public?: boolean;
  type: WorkflowType;
  created_by_user_id?: number | null;
}

export interface UpdateWorkflowData {
  name?: string;
  manus_address?: string;
  description?: string | null;
  instruction?: string | null;
  credits_per_task?: number;
  is_active?: boolean;
  is_public?: boolean;
}

export async function getWorkflowByName(name: string): Promise<Workflow | null> {
  return queryOne<Workflow>(
    'SELECT * FROM workflows WHERE name = $1 AND is_active = TRUE',
    [name.toLowerCase()]
  );
}

export async function getWorkflowById(id: number): Promise<Workflow | null> {
  return queryOne<Workflow>('SELECT * FROM workflows WHERE id = $1', [id]);
}

export async function getAllWorkflows(): Promise<WorkflowStats[]> {
  return query<WorkflowStats>(`
    SELECT
      w.*,
      COALESCE(m.total_tasks, 0)::int as total_tasks,
      COALESCE(m.pending_tasks, 0)::int as pending_tasks,
      COALESCE(m.completed_tasks, 0)::int as completed_tasks,
      COALESCE(m.total_credits, 0)::int as total_credits_earned
    FROM workflows w
    LEFT JOIN (
      SELECT
        workflow,
        COUNT(*) as total_tasks,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_tasks,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_tasks,
        SUM(COALESCE(credits_charged, 0)) as total_credits
      FROM email_mappings
      GROUP BY workflow
    ) m ON w.name = m.workflow
    ORDER BY w.name
  `);
}

export async function getPublicWorkflows(): Promise<Workflow[]> {
  return query<Workflow>(
    'SELECT * FROM workflows WHERE is_public = TRUE AND is_active = TRUE ORDER BY type, name'
  );
}

export async function getWorkflowsByUser(userId: number): Promise<WorkflowStats[]> {
  return query<WorkflowStats>(`
    SELECT
      w.*,
      COALESCE(m.total_tasks, 0)::int as total_tasks,
      COALESCE(m.pending_tasks, 0)::int as pending_tasks,
      COALESCE(m.completed_tasks, 0)::int as completed_tasks,
      COALESCE(m.total_credits, 0)::int as total_credits_earned
    FROM workflows w
    LEFT JOIN (
      SELECT
        workflow,
        COUNT(*) as total_tasks,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_tasks,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_tasks,
        SUM(COALESCE(credits_charged, 0)) as total_credits
      FROM email_mappings
      GROUP BY workflow
    ) m ON w.name = m.workflow
    WHERE w.created_by_user_id = $1
    ORDER BY w.created_at DESC
  `, [userId]);
}

export async function isWorkflowNameTaken(name: string): Promise<boolean> {
  const result = await queryOne<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM workflows WHERE name = $1) as exists',
    [name.toLowerCase()]
  );
  return result?.exists ?? false;
}

export async function updateWorkflow(
  id: number,
  updates: UpdateWorkflowData
): Promise<Workflow | null> {
  const setClauses: string[] = [];
  const params: (string | number | boolean | null)[] = [];
  let paramIndex = 1;

  if (updates.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    params.push(updates.name.toLowerCase());
  }
  if (updates.manus_address !== undefined) {
    setClauses.push(`manus_address = $${paramIndex++}`);
    params.push(updates.manus_address);
  }
  if (updates.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    params.push(updates.description);
  }
  if (updates.instruction !== undefined) {
    setClauses.push(`instruction = $${paramIndex++}`);
    params.push(updates.instruction);
  }
  if (updates.credits_per_task !== undefined) {
    setClauses.push(`credits_per_task = $${paramIndex++}`);
    params.push(updates.credits_per_task);
  }
  if (updates.is_active !== undefined) {
    setClauses.push(`is_active = $${paramIndex++}`);
    params.push(updates.is_active);
  }
  if (updates.is_public !== undefined) {
    setClauses.push(`is_public = $${paramIndex++}`);
    params.push(updates.is_public);
  }

  if (setClauses.length === 0) return getWorkflowById(id);

  params.push(id);
  return queryOne<Workflow>(
    `UPDATE workflows SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    params
  );
}

export async function createWorkflow(data: CreateWorkflowData): Promise<Workflow> {
  const result = await queryOne<Workflow>(
    `INSERT INTO workflows (name, manus_address, description, instruction, credits_per_task, is_public, type, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      data.name.toLowerCase(),
      data.manus_address,
      data.description ?? null,
      data.instruction ?? null,
      data.credits_per_task ?? 10,
      data.is_public ?? true,
      data.type,
      data.created_by_user_id ?? null,
    ]
  );
  return result!;
}

export async function deleteWorkflow(id: number): Promise<boolean> {
  const workflow = await getWorkflowById(id);
  if (!workflow) return false;
  if (workflow.type === 'native') {
    throw new Error('Cannot delete native workflows');
  }
  const result = await query<{ id: number }>(
    'DELETE FROM workflows WHERE id = $1 RETURNING id',
    [id]
  );
  return result.length > 0;
}
