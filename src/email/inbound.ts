import { config } from '../config';
import { getUserByEmail } from '../db/users';
import { getWorkflowByName, Workflow } from '../db/workflows';
import { createMapping, updateManusTaskId, getMappingByMessageId } from '../db/mappings';
import { isApprovedSender } from '../db/approvedSenders';
import { sendEmail, sendBounce } from './outbound';
import { ParsedEmail, extractWorkflow } from './parser';
import { createTask } from '../manus/client';

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
  if (!workflowConfig || !workflowConfig.is_active) {
    console.log(`Rejected: unknown or inactive workflow ${workflow}`);
    await sendBounce(sender, `Unknown workflow: ${workflow}`);
    return;
  }

  if (!workflowConfig.is_public) {
    const isCreator = workflowConfig.created_by_user_id === user.id;
    const isApproved = await isApprovedSender(workflowConfig.id, sender);
    if (!isCreator && !isApproved) {
      console.log(`Rejected: ${sender} not authorized for private workflow ${workflow}`);
      await sendBounce(sender, `Workflow '${workflow}' is private.`);
      return;
    }
  }

  if (user.credits < workflowConfig.credits_per_task) {
    console.log(`Rejected: insufficient credits for ${sender} (has ${user.credits}, needs ${workflowConfig.credits_per_task})`);
    await sendBounce(sender, `Insufficient credits. Balance: ${user.credits}, Required: ${workflowConfig.credits_per_task}`);
    return;
  }

  if (email.messageId) {
    const existingMapping = await getMappingByMessageId(email.messageId);
    if (existingMapping) {
      console.log(`Duplicate webhook: mapping already exists for message ${email.messageId}`);
      return;
    }
  }

  const mapping = await createMapping(email.messageId, sender, workflow);

  if (workflowConfig.type === 'native') {
    await handleNativeWorkflow(email, mapping.id, sender, workflowConfig);
  } else {
    await handleApiWorkflow(email, mapping.id, sender, workflowConfig);
  }
}

async function handleNativeWorkflow(
  email: ParsedEmail,
  mappingId: number,
  sender: string,
  workflowConfig: Workflow
): Promise<void> {
  const body = `[fly-bot.net request from: ${sender}]\n[Mapping ID: ${mappingId}]\n\n${email.text}`;

  const manusMessageId = await sendEmail({
    from: config.RELAY_ADDRESS,
    to: workflowConfig.manus_address,
    subject: email.subject,
    text: body,
    html: email.html ? `<p><em>[fly-bot.net request from: ${sender}]</em></p><p><em>[Mapping ID: ${mappingId}]</em></p>${email.html}` : undefined,
    attachments: email.attachments,
    headers: {
      'X-Flybot-Mapping-Id': String(mappingId),
      'X-Flybot-Original-Sender': sender,
    },
  });

  if (manusMessageId) {
    await updateManusTaskId(mappingId, manusMessageId);
  }

  console.log(`Forwarded mapping ${mappingId} from ${sender} to ${workflowConfig.manus_address} (native)`);
}

async function handleApiWorkflow(
  email: ParsedEmail,
  mappingId: number,
  sender: string,
  workflowConfig: Workflow
): Promise<void> {
  let prompt = email.text;
  if (workflowConfig.instruction) {
    prompt = `[Instruction]\n${workflowConfig.instruction}\n\n[User Request]\n${email.text}`;
  }

  const attachments = email.attachments?.map((att) => ({
    type: 'base64' as const,
    data: att.content.toString('base64'),
    filename: att.filename || 'attachment',
  }));

  try {
    const result = await createTask({
      prompt,
      attachments: attachments?.length ? attachments : undefined,
    });

    await updateManusTaskId(mappingId, result.task_id);
    console.log(`Created task ${result.task_id} for mapping ${mappingId} from ${sender} (API)`);
  } catch (err) {
    console.error(`Failed to create Manus task for mapping ${mappingId}:`, err);
    await sendBounce(sender, 'Failed to process your request. Please try again later.');
  }
}
