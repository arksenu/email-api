import crypto from 'crypto';
import { getMappingByTaskId, completeMapping } from '../db/mappings';
import { deductCredits, getUserByEmail, createTransaction } from '../db/users';
import { getTask, downloadAttachment, getPublicKey } from './client';
import { sendEmail } from '../email/outbound';
import { config } from '../config';

export interface WebhookAttachment {
  file_name: string;
  url: string;
  size_bytes: number;
}

export interface TaskDetail {
  task_id: string;
  task_title: string;
  task_url: string;
  message: string;
  stop_reason: 'finish' | 'ask';
  attachments: WebhookAttachment[];
}

export interface TaskStoppedPayload {
  event_id: string;
  event_type: 'task_stopped';
  task_detail: TaskDetail;
}

let cachedPublicKey: string | null = null;
let publicKeyFetchedAt = 0;
const PUBLIC_KEY_TTL = 60 * 60 * 1000; // 1 hour

async function getManusPublicKey(): Promise<string> {
  const now = Date.now();
  if (cachedPublicKey && now - publicKeyFetchedAt < PUBLIC_KEY_TTL) {
    return cachedPublicKey;
  }
  const { public_key } = await getPublicKey();
  cachedPublicKey = public_key;
  publicKeyFetchedAt = now;
  return public_key;
}

export function verifyWebhookSignature(
  signature: string,
  timestamp: string,
  url: string,
  body: string,
  publicKey: string
): boolean {
  const ts = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) {
    console.error('Webhook timestamp outside 5-minute window');
    return false;
  }

  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
  const signatureString = `${timestamp}.${url}.${bodyHash}`;

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(signatureString);

  try {
    return verifier.verify(publicKey, signature, 'base64');
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

export interface WebhookHeaders {
  signature: string;
  timestamp: string;
}

export async function handleManusWebhook(
  payload: TaskStoppedPayload,
  headers: WebhookHeaders,
  url: string,
  rawBody: string
): Promise<void> {
  const publicKey = await getManusPublicKey();
  if (!verifyWebhookSignature(headers.signature, headers.timestamp, url, rawBody, publicKey)) {
    throw new Error('Invalid webhook signature');
  }

  if (payload.event_type !== 'task_stopped') {
    console.log(`Ignoring event type: ${payload.event_type}`);
    return;
  }

  const detail = payload.task_detail;
  if (!detail) {
    console.error('Webhook missing task_detail');
    return;
  }

  if (detail.stop_reason !== 'finish') {
    console.log(`Task ${detail.task_id} needs input (stop_reason: ${detail.stop_reason}), skipping`);
    return;
  }

  const mapping = await getMappingByTaskId(detail.task_id);
  if (!mapping) {
    console.error(`No mapping found for task ${detail.task_id}`);
    return;
  }

  const attachments = await Promise.all(
    (detail.attachments || []).map(async (att) => ({
      filename: att.file_name,
      contentType: 'application/octet-stream',
      content: await downloadAttachment(att.url),
    }))
  );

  await sendEmail({
    from: `${mapping.workflow}@${config.FROM_DOMAIN}`,
    to: mapping.original_sender,
    subject: `Re: Your ${mapping.workflow} task`,
    text: detail.message,
    attachments,
  });

  const task = await getTask(detail.task_id);
  const creditsUsed = task.credit_usage || 0;

  const user = await getUserByEmail(mapping.original_sender);
  if (user) {
    const deducted = await deductCredits(user.id, creditsUsed);
    if (deducted) {
      await createTransaction(user.id, -creditsUsed, `Task: ${mapping.workflow}`, mapping.id);
    }
  }

  await completeMapping(mapping.id, creditsUsed);

  console.log(`Completed task ${detail.task_id} for mapping ${mapping.id}, charged ${creditsUsed} credits`);
}
