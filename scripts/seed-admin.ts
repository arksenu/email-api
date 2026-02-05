import 'dotenv/config';
import { createAdmin, findAdminByUsername } from '../src/db/admins';
import { pool } from '../src/db/client';

const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme123';

async function seedAdmin() {
  try {
    const existing = await findAdminByUsername(DEFAULT_USERNAME);
    if (existing) {
      console.log(`Admin user '${DEFAULT_USERNAME}' already exists`);
      process.exit(0);
    }

    const admin = await createAdmin(DEFAULT_USERNAME, DEFAULT_PASSWORD);
    console.log(`Created admin user: ${admin.username}`);
    console.log(`Password: ${DEFAULT_PASSWORD}`);
    console.log('\nIMPORTANT: Change the password after first login!');
  } catch (err) {
    console.error('Failed to seed admin:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedAdmin();
