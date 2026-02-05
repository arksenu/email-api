import { query, queryOne } from './client';

export interface User {
  id: number;
  email: string;
  credits: number;
  is_approved: boolean;
  created_at: Date;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  return queryOne<User>(
    'SELECT * FROM users WHERE email = $1',
    [email.toLowerCase()]
  );
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
