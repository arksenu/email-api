import sgMail from '@sendgrid/mail';
import { config } from '../config';
import type { Attachment } from './parser';

sgMail.setApiKey(config.SENDGRID_API_KEY);

interface EmailOptions {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Attachment[];
  headers?: Record<string, string>;
  inReplyTo?: string;
}

export async function sendEmail(options: EmailOptions): Promise<string | null> {
  const msg: sgMail.MailDataRequired = {
    from: options.from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html || options.text,
    headers: options.headers,
    attachments: options.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content.toString('base64'),
      type: a.contentType,
      disposition: 'attachment',
    })),
  };

  if (options.inReplyTo) {
    msg.headers = { ...msg.headers, 'In-Reply-To': options.inReplyTo };
  }

  try {
    const [response] = await sgMail.send(msg);
    return response.headers['x-message-id'] as string || null;
  } catch (err: unknown) {
    const error = err as { response?: { body?: { errors?: Array<{ message: string; field?: string }> } } };
    if (error.response?.body?.errors) {
      console.error('SendGrid errors:', JSON.stringify(error.response.body.errors, null, 2));
    }
    throw err;
  }
}

export async function sendBounce(to: string, reason: string): Promise<void> {
  await sendEmail({
    from: `noreply@${config.FROM_DOMAIN}`,
    to,
    subject: `[Fly-Bot] Request Could Not Be Processed`,
    text: `Your email could not be processed.\n\nReason: ${reason}\n\nIf you believe this is an error, please contact support.`,
  });
}
