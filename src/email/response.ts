import { config } from '../config';
import { getUserByEmail, deductCredits, createTransaction } from '../db/users';
import { getWorkflowByName } from '../db/workflows';
import { getMappingByMessageId, getMappingById, updateMappingStatus } from '../db/mappings';
import { sendEmail } from './outbound';
import { stripBranding, isAcknowledgment } from './branding';
import { ParsedEmail } from './parser';

export async function handleManusResponse(email: ParsedEmail): Promise<void> {
  let mapping = email.inReplyTo ? await getMappingByMessageId(email.inReplyTo) : null;

  if (!mapping) {
    const mappingIdMatch = email.text.match(/\[Mapping ID:\s*(\d+)\]/);
    if (mappingIdMatch) {
      mapping = await getMappingById(parseInt(mappingIdMatch[1], 10));
    }
  }

  if (!mapping) {
    console.error(`Unmatched Manus response: ${email.subject}`);
    return;
  }

  if (isAcknowledgment(email.text)) {
    await updateMappingStatus(mapping.id, 'acknowledged');
    console.log(`Mapping ${mapping.id} acknowledged`);
    return;
  }

  if (mapping.status === 'completed') {
    console.log(`Mapping ${mapping.id} already completed, skipping`);
    return;
  }

  const user = await getUserByEmail(mapping.original_sender);
  const workflowConfig = await getWorkflowByName(mapping.workflow);

  if (!user || !workflowConfig) {
    console.error(`Missing user or workflow for mapping ${mapping.id}`);
    return;
  }

  const cleanSubject = stripBranding(email.subject);
  const cleanText = stripBranding(email.text);
  const cleanHtml = email.html ? stripBranding(email.html) : undefined;

  await sendEmail({
    from: `${mapping.workflow}@${config.FROM_DOMAIN}`,
    to: mapping.original_sender,
    subject: `[Fly-Bot] ${cleanSubject}`,
    text: cleanText,
    html: cleanHtml,
    attachments: email.attachments,
    inReplyTo: mapping.original_message_id || undefined,
  });

  await deductCredits(user.id, workflowConfig.credits_per_task);
  await createTransaction(user.id, -workflowConfig.credits_per_task, `Task: ${mapping.workflow}`, mapping.id);
  await updateMappingStatus(mapping.id, 'completed', workflowConfig.credits_per_task);

  console.log(`Completed mapping ${mapping.id}, charged ${workflowConfig.credits_per_task} credits to ${user.email}`);
}
