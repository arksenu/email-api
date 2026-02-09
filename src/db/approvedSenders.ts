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
    'SELECT * FROM workflow_approved_senders WHERE workflow_id = $1 ORDER BY created_at DESC',
    [workflowId]
  );
}

export async function addApprovedSender(
  workflowId: number,
  email: string,
  addedBy?: number
): Promise<ApprovedSender> {
  const result = await queryOne<ApprovedSender>(
    `INSERT INTO workflow_approved_senders (workflow_id, email, added_by_user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (workflow_id, email) DO NOTHING
     RETURNING *`,
    [workflowId, email.toLowerCase(), addedBy ?? null]
  );
  if (!result) {
    const existing = await queryOne<ApprovedSender>(
      'SELECT * FROM workflow_approved_senders WHERE workflow_id = $1 AND email = $2',
      [workflowId, email.toLowerCase()]
    );
    return existing!;
  }
  return result;
}

export async function removeApprovedSender(workflowId: number, email: string): Promise<boolean> {
  const result = await query<{ id: number }>(
    'DELETE FROM workflow_approved_senders WHERE workflow_id = $1 AND email = $2 RETURNING id',
    [workflowId, email.toLowerCase()]
  );
  return result.length > 0;
}

export async function isApprovedSender(workflowId: number, email: string): Promise<boolean> {
  const result = await queryOne<{ exists: boolean }>(
    'SELECT EXISTS(SELECT 1 FROM workflow_approved_senders WHERE workflow_id = $1 AND email = $2) as exists',
    [workflowId, email.toLowerCase()]
  );
  return result?.exists ?? false;
}

export async function getApprovedSenderCount(workflowId: number): Promise<number> {
  const result = await queryOne<{ count: string }>(
    'SELECT COUNT(*) as count FROM workflow_approved_senders WHERE workflow_id = $1',
    [workflowId]
  );
  return parseInt(result?.count || '0', 10);
}
