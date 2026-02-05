const BRANDING_PATTERNS = [
  /\[Manus\]/gi,
  /Manus:/gi,
  /Powered by Manus/gi,
  /manus\.im/gi,
  /manus\.bot/gi,
  /— Manus/gi,
  /--\s*Manus/gi,
];

const ACKNOWLEDGMENT_INDICATORS = [
  'task has been started',
  'working on your request',
  'processing your email',
  'received your request',
  'task is now running',
  'i have received your task',
  'and started working',
  'i will do the following',
];

export function stripBranding(text: string): string {
  let result = text;
  for (const pattern of BRANDING_PATTERNS) {
    result = result.replace(pattern, '');
  }
  return result.replace(/\n{3,}/g, '\n\n').trim();
}

export function isAcknowledgment(body: string): boolean {
  const lower = body.toLowerCase();
  return ACKNOWLEDGMENT_INDICATORS.some((ind) => lower.includes(ind));
}
