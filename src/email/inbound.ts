import { config } from '../config';
import { getUserByEmail } from '../db/users';
import { getWorkflowByName } from '../db/workflows';
import { createMapping, updateManusMessageId } from '../db/mappings';
import { sendEmail, sendBounce } from './outbound';
import { ParsedEmail, extractWorkflow } from './parser';

export async function handleInboundEmail(email: ParsedEmail): Promise<void> {
  const sender = email.from;
  const workflow = extractWorkflow(email.to);

  const user = await getUserByEmail(sender);
  if (!user) {
    console.log(`Rejected: unregistered sender ${sender}`);
    await sendBounce(sender, 'Not registered. Sign up at fly-bot.net');
    return;
  }

  if (!user.is_approved) {
    console.log(`Rejected: unapproved user ${sender}`);
    await sendBounce(sender, 'Account pending approval');
    return;
  }

  const workflowConfig = await getWorkflowByName(workflow);
  if (!workflowConfig) {
    console.log(`Rejected: unknown workflow ${workflow}`);
    await sendBounce(sender, `Unknown workflow: ${workflow}. Available: research, summarize, newsletter`);
    return;
  }

  if (user.credits < workflowConfig.credits_per_task) {
    console.log(`Rejected: insufficient credits for ${sender} (has ${user.credits}, needs ${workflowConfig.credits_per_task})`);
    await sendBounce(sender, `Insufficient credits. Balance: ${user.credits}, Required: ${workflowConfig.credits_per_task}`);
    return;
  }

  const mapping = await createMapping(email.messageId, sender, workflow);

  const body = `[fly-bot.net request from: ${sender}]\n[Mapping ID: ${mapping.id}]\n\n${email.text}`;

  const manusMessageId = await sendEmail({
    from: config.RELAY_ADDRESS,
    to: workflowConfig.manus_address,
    subject: email.subject,
    text: body,
    html: email.html ? `<p><em>[fly-bot.net request from: ${sender}]</em></p><p><em>[Mapping ID: ${mapping.id}]</em></p>${email.html}` : undefined,
    attachments: email.attachments,
    headers: {
      'X-Flybot-Mapping-Id': String(mapping.id),
      'X-Flybot-Original-Sender': sender,
    },
  });

  if (manusMessageId) {
    await updateManusMessageId(mapping.id, manusMessageId);
  }

  console.log(`Forwarded mapping ${mapping.id} from ${sender} to ${workflowConfig.manus_address}`);
}
