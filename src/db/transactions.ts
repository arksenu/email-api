import { query, queryOne } from './client';

export interface Transaction {
  id: number;
  user_id: number;
  credits_delta: number;
  reason: string | null;
  email_mapping_id: number | null;
  created_at: Date;
}

export interface TransactionWithUser extends Transaction {
  user_email: string;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getAllTransactions(
  page: number = 1,
  pageSize: number = 20,
  userId?: number
): Promise<PaginatedResult<TransactionWithUser>> {
  const offset = (page - 1) * pageSize;

  let countQuery = 'SELECT COUNT(*) as count FROM transactions';
  let dataQuery = `
    SELECT t.*, u.email as user_email
    FROM transactions t
    JOIN users u ON t.user_id = u.id
  `;
  const params: (number | string)[] = [];

  if (userId) {
    countQuery += ' WHERE user_id = $1';
    dataQuery += ' WHERE t.user_id = $1';
    params.push(userId);
  }

  dataQuery += ` ORDER BY t.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(pageSize, offset);

  const countResult = await queryOne<{ count: string }>(countQuery, userId ? [userId] : []);
  const total = parseInt(countResult?.count || '0', 10);
  const data = await query<TransactionWithUser>(dataQuery, params);

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getTransactionsByUser(
  userId: number,
  page: number = 1,
  pageSize: number = 20
): Promise<PaginatedResult<Transaction>> {
  const offset = (page - 1) * pageSize;

  const countResult = await queryOne<{ count: string }>(
    'SELECT COUNT(*) as count FROM transactions WHERE user_id = $1',
    [userId]
  );
  const total = parseInt(countResult?.count || '0', 10);

  const data = await query<Transaction>(
    'SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
    [userId, pageSize, offset]
  );

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
