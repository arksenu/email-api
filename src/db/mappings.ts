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

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface MappingFilters {
  status?: string;
  workflow?: string;
  sender?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function getAllMappings(
  page: number = 1,
  pageSize: number = 20,
  filters: MappingFilters = {}
): Promise<PaginatedResult<EmailMapping>> {
  const offset = (page - 1) * pageSize;
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let paramIndex = 1;

  if (filters.status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(filters.status);
  }
  if (filters.workflow) {
    conditions.push(`workflow = $${paramIndex++}`);
    params.push(filters.workflow);
  }
  if (filters.sender) {
    conditions.push(`LOWER(original_sender) LIKE $${paramIndex++}`);
    params.push(`%${filters.sender.toLowerCase()}%`);
  }
  if (filters.dateFrom) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(filters.dateTo);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM email_mappings ${whereClause}`,
    params
  );
  const total = parseInt(countResult?.count || '0', 10);

  const dataParams = [...params, pageSize, offset];
  const data = await query<EmailMapping>(
    `SELECT * FROM email_mappings ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    dataParams
  );

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
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
