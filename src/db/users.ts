import bcrypt from 'bcrypt';
import { query, queryOne } from './client';

const SALT_ROUNDS = 10;

export interface User {
  id: number;
  email: string;
  credits: number;
  is_approved: boolean;
  created_at: Date;
  password_hash: string | null;
}

export interface UserStats extends User {
  total_tasks: number;
  pending_tasks: number;
  completed_tasks: number;
  total_spent: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  return queryOne<User>(
    'SELECT * FROM users WHERE email = $1',
    [email.toLowerCase()]
  );
}

export async function getUserById(id: number): Promise<User | null> {
  return queryOne<User>('SELECT * FROM users WHERE id = $1', [id]);
}

export async function getAllUsers(page: number = 1, pageSize: number = 20): Promise<PaginatedResult<UserStats>> {
  const offset = (page - 1) * pageSize;

  const countResult = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM users');
  const total = parseInt(countResult?.count || '0', 10);

  const data = await query<UserStats>(`
    SELECT
      u.*,
      COALESCE(m.total_tasks, 0)::int as total_tasks,
      COALESCE(m.pending_tasks, 0)::int as pending_tasks,
      COALESCE(m.completed_tasks, 0)::int as completed_tasks,
      COALESCE(ABS(t.total_spent), 0)::int as total_spent
    FROM users u
    LEFT JOIN (
      SELECT
        original_sender,
        COUNT(*) as total_tasks,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_tasks,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_tasks
      FROM email_mappings
      GROUP BY original_sender
    ) m ON LOWER(u.email) = LOWER(m.original_sender)
    LEFT JOIN (
      SELECT user_id, SUM(credits_delta) as total_spent
      FROM transactions
      WHERE credits_delta < 0
      GROUP BY user_id
    ) t ON u.id = t.user_id
    ORDER BY u.created_at DESC
    LIMIT $1 OFFSET $2
  `, [pageSize, offset]);

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function createUser(email: string, credits: number = 0, isApproved: boolean = false): Promise<User> {
  const result = await queryOne<User>(
    'INSERT INTO users (email, credits, is_approved) VALUES ($1, $2, $3) RETURNING *',
    [email.toLowerCase(), credits, isApproved]
  );
  return result!;
}

export async function updateUser(
  id: number,
  updates: { email?: string; credits?: number; is_approved?: boolean }
): Promise<User | null> {
  const setClauses: string[] = [];
  const params: (string | number | boolean)[] = [];
  let paramIndex = 1;

  if (updates.email !== undefined) {
    setClauses.push(`email = $${paramIndex++}`);
    params.push(updates.email.toLowerCase());
  }
  if (updates.credits !== undefined) {
    setClauses.push(`credits = $${paramIndex++}`);
    params.push(updates.credits);
  }
  if (updates.is_approved !== undefined) {
    setClauses.push(`is_approved = $${paramIndex++}`);
    params.push(updates.is_approved);
  }

  if (setClauses.length === 0) return getUserById(id);

  params.push(id);
  return queryOne<User>(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    params
  );
}

export async function deleteUser(id: number): Promise<boolean> {
  const result = await query<{ id: number }>(
    'DELETE FROM users WHERE id = $1 RETURNING id',
    [id]
  );
  return result.length > 0;
}

export async function addCredits(
  userId: number,
  amount: number,
  reason: string
): Promise<User | null> {
  const result = await queryOne<User>(
    'UPDATE users SET credits = credits + $1 WHERE id = $2 RETURNING *',
    [amount, userId]
  );
  if (result) {
    await createTransaction(userId, amount, reason);
  }
  return result;
}

export async function deductCredits(userId: number, amount: number): Promise<boolean> {
  const result = await query<{ id: number }>(
    'UPDATE users SET credits = credits - $1 WHERE id = $2 AND credits >= $1 RETURNING id',
    [amount, userId]
  );
  return result.length > 0;
}

export async function createTransaction(
  userId: number,
  creditsDelta: number,
  reason: string,
  emailMappingId?: number
): Promise<void> {
  await query(
    'INSERT INTO transactions (user_id, credits_delta, reason, email_mapping_id) VALUES ($1, $2, $3, $4)',
    [userId, creditsDelta, reason, emailMappingId ?? null]
  );
}

export async function createUserWithPassword(
  email: string,
  password: string,
  credits: number = 0,
  isApproved: boolean = false
): Promise<User> {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const result = await queryOne<User>(
    'INSERT INTO users (email, password_hash, credits, is_approved) VALUES ($1, $2, $3, $4) RETURNING *',
    [email.toLowerCase(), passwordHash, credits, isApproved]
  );
  return result!;
}

export async function verifyUserPassword(user: User, password: string): Promise<boolean> {
  if (!user.password_hash) return false;
  return bcrypt.compare(password, user.password_hash);
}

export async function setUserPassword(userId: number, password: string): Promise<void> {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  await query(
    'UPDATE users SET password_hash = $1 WHERE id = $2',
    [passwordHash, userId]
  );
}
