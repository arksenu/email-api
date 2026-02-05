import { query, queryOne } from './client';

export interface EmailMapping {
  id: number;
  original_message_id: string | null;
  original_sender: string;
  workflow: string;
  manus_message_id: string | null;
  status: string;
  credits_charged: number | null;
  created_at: Date;
  completed_at: Date | null;
}

export async function createMapping(
  originalMessageId: string | null,
  originalSender: string,
  workflow: string
): Promise<EmailMapping> {
  const rows = await query<EmailMapping>(
    `INSERT INTO email_mappings (original_message_id, original_sender, workflow)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [originalMessageId, originalSender.toLowerCase(), workflow]
  );
  return rows[0];
}

export async function getMappingByMessageId(messageId: string): Promise<EmailMapping | null> {
  return queryOne<EmailMapping>(
    'SELECT * FROM email_mappings WHERE original_message_id = $1',
    [messageId]
  );
}

export async function getMappingById(id: number): Promise<EmailMapping | null> {
  return queryOne<EmailMapping>(
    'SELECT * FROM email_mappings WHERE id = $1',
    [id]
  );
}

export async function updateMappingStatus(
  id: number,
  status: string,
  creditsCharged?: number
): Promise<void> {
  if (status === 'completed') {
    await query(
      'UPDATE email_mappings SET status = $1, credits_charged = $2, completed_at = NOW() WHERE id = $3',
      [status, creditsCharged ?? null, id]
    );
  } else {
    await query(
      'UPDATE email_mappings SET status = $1 WHERE id = $2',
      [status, id]
    );
  }
}

export async function updateManusMessageId(id: number, manusMessageId: string): Promise<void> {
  await query(
    'UPDATE email_mappings SET manus_message_id = $1 WHERE id = $2',
    [manusMessageId, id]
  );
}
