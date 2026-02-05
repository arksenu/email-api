import { query, queryOne } from './client';

export interface Workflow {
  id: number;
  name: string;
  manus_address: string;
  description: string | null;
  credits_per_task: number;
  is_active: boolean;
}

export interface WorkflowStats extends Workflow {
  total_tasks: number;
  pending_tasks: number;
  completed_tasks: number;
  total_credits_earned: number;
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

export async function updateWorkflow(
  id: number,
  updates: { description?: string; credits_per_task?: number; is_active?: boolean }
): Promise<Workflow | null> {
  const setClauses: string[] = [];
  const params: (string | number | boolean)[] = [];
  let paramIndex = 1;

  if (updates.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    params.push(updates.description);
  }
  if (updates.credits_per_task !== undefined) {
    setClauses.push(`credits_per_task = $${paramIndex++}`);
    params.push(updates.credits_per_task);
  }
  if (updates.is_active !== undefined) {
    setClauses.push(`is_active = $${paramIndex++}`);
    params.push(updates.is_active);
  }

  if (setClauses.length === 0) return getWorkflowById(id);

  params.push(id);
  return queryOne<Workflow>(
    `UPDATE workflows SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    params
  );
}

export async function createWorkflow(
  name: string,
  manusAddress: string,
  description: string | null = null,
  creditsPerTask: number = 1
): Promise<Workflow> {
  const result = await queryOne<Workflow>(
    'INSERT INTO workflows (name, manus_address, description, credits_per_task) VALUES ($1, $2, $3, $4) RETURNING *',
    [name.toLowerCase(), manusAddress, description, creditsPerTask]
  );
  return result!;
}
