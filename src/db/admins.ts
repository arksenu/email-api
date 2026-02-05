import bcrypt from 'bcrypt';
import { queryOne } from './client';

export interface Admin {
  id: number;
  username: string;
  password_hash: string;
  created_at: Date;
}

const SALT_ROUNDS = 10;

export async function findAdminByUsername(username: string): Promise<Admin | null> {
  return queryOne<Admin>(
    'SELECT * FROM admins WHERE username = $1',
    [username.toLowerCase()]
  );
}

export async function createAdmin(username: string, password: string): Promise<Admin> {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const result = await queryOne<Admin>(
    'INSERT INTO admins (username, password_hash) VALUES ($1, $2) RETURNING *',
    [username.toLowerCase(), passwordHash]
  );
  return result!;
}

export async function verifyPassword(admin: Admin, password: string): Promise<boolean> {
  return bcrypt.compare(password, admin.password_hash);
}
