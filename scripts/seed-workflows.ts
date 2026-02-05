import 'dotenv/config';
import { pool, query } from '../src/db/client';

const workflows = [
  {
    name: 'research',
    manus_address: 'arksenu-research@manus.bot',
    description: 'Research the topic and provide comprehensive analysis',
    credits_per_task: 10,
  },
  {
    name: 'summarize',
    manus_address: 'arksenu-summarize@manus.bot',
    description: 'Summarize the attached document or email content',
    credits_per_task: 5,
  },
  {
    name: 'newsletter',
    manus_address: 'arksenu-newsletter@manus.bot',
    description: 'Process newsletter content and extract key insights',
    credits_per_task: 10,
  },
];

async function seed() {
  for (const wf of workflows) {
    await query(
      `INSERT INTO workflows (name, manus_address, description, credits_per_task)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO UPDATE SET
         manus_address = EXCLUDED.manus_address,
         description = EXCLUDED.description,
         credits_per_task = EXCLUDED.credits_per_task`,
      [wf.name, wf.manus_address, wf.description, wf.credits_per_task]
    );
    console.log(`Seeded workflow: ${wf.name}`);
  }
  await pool.end();
  console.log('Done');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
