export interface ParsedEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  messageId: string | null;
  inReplyTo: string | null;
  attachments: Attachment[];
}

export interface Attachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export function parseWebhookPayload(body: Record<string, unknown>, files?: Express.Multer.File[]): ParsedEmail {
  // Log all fields SendGrid is sending
  console.log('DEBUG raw webhook fields:', Object.keys(body));
  console.log('DEBUG raw webhook body:', JSON.stringify(body, null, 2).slice(0, 2000));

  const from = extractEmail(String(body.from || ''));
  const to = extractEmail(String(body.to || ''));
  const subject = String(body.subject || '');
  const rawText = String(body.text || '');
  const html = String(body.html || '');
  const text = rawText || stripHtml(html);
  const headers = parseHeaders(String(body.headers || ''));

  const attachments: Attachment[] = (files || []).map((f) => ({
    filename: f.originalname,
    contentType: f.mimetype,
    content: f.buffer,
  }));

  return {
    from,
    to,
    subject,
    text,
    html,
    messageId: headers['message-id'] || null,
    inReplyTo: headers['in-reply-to'] || null,
    attachments,
  };
}

function extractEmail(header: string): string {
  const match = header.match(/<([^>]+)>/) || header.match(/([^\s<]+@[^\s>]+)/);
  return match ? match[1].toLowerCase() : header.toLowerCase();
}

function parseHeaders(raw: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const lines = raw.split(/\r?\n/);
  let currentKey = '';
  let currentValue = '';

  for (const line of lines) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      currentValue += ' ' + line.trim();
    } else {
      if (currentKey) {
        headers[currentKey.toLowerCase()] = currentValue;
      }
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        currentKey = line.slice(0, colonIndex);
        currentValue = line.slice(colonIndex + 1).trim();
      }
    }
  }
  if (currentKey) {
    headers[currentKey.toLowerCase()] = currentValue;
  }
  return headers;
}

export function extractWorkflow(recipient: string): string {
  const local = recipient.split('@')[0];
  return local.toLowerCase();
}

function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
