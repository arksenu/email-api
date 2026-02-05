import 'dotenv/config';
import { pool, query } from '../src/db/client';

const workflows = [
  {
    name: 'research',
    manus_address: 'arksenu-research@manus.bot',
    description: 'Conduct wide research based on the email content.',
    instruction: 'Conduct wide research based on the email content. Follow any specific instructions about format, scope, or deliverables provided in the email. Otherwise, use your discretion.',
    type: 'native',
    is_public: true,
    credits_per_task: 10,
  },
  {
    name: 'summarize',
    manus_address: 'arksenu-summarize@manus.bot',
    description: 'Summarize the contents of the email.',
    instruction: 'Summarize the contents of the email, which may also include external sources/links as well as attachments. Use discretion where not specified.',
    type: 'native',
    is_public: true,
    credits_per_task: 5,
  },
  {
    name: 'newsletter',
    manus_address: 'arksenu-newsletter@manus.bot',
    description: 'Gather information sources for the daily newsletter.',
    instruction: 'Gather informations sources for the daily newsletter and organize them into slides.',
    type: 'native',
    is_public: true,
    credits_per_task: 10,
  },
];

async function seed() {
  for (const wf of workflows) {
    await query(
      `INSERT INTO workflows (name, manus_address, description, instruction, type, is_public, credits_per_task)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (name) DO UPDATE SET
         manus_address = EXCLUDED.manus_address,
         description = EXCLUDED.description,
         instruction = EXCLUDED.instruction,
         type = EXCLUDED.type,
         is_public = EXCLUDED.is_public,
         credits_per_task = EXCLUDED.credits_per_task`,
      [wf.name, wf.manus_address, wf.description, wf.instruction, wf.type, wf.is_public, wf.credits_per_task]
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
