import { queryOne } from './client';

export interface Workflow {
  id: number;
  name: string;
  manus_address: string;
  description: string | null;
  credits_per_task: number;
  is_active: boolean;
}

export async function getWorkflowByName(name: string): Promise<Workflow | null> {
  return queryOne<Workflow>(
    'SELECT * FROM workflows WHERE name = $1 AND is_active = TRUE',
    [name.toLowerCase()]
  );
}
