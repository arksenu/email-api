import { Router, Request, Response } from 'express';
import multer from 'multer';
import { config } from '../config';
import { healthCheck } from '../db/client';
import { parseWebhookPayload } from '../email/parser';
import { handleInboundEmail } from '../email/inbound';
import { handleManusResponse } from '../email/response';
import { handleManusWebhook, TaskStoppedPayload } from '../manus/webhook';

const upload = multer({ storage: multer.memoryStorage() });
const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  const dbOk = await healthCheck();
  if (dbOk) {
    res.json({ status: 'ok', database: 'connected' });
  } else {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

router.post('/webhooks/email/inbound', upload.any(), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    const email = parseWebhookPayload(req.body, files);

    const isFromManus = email.from.endsWith('@manus.bot');
    const isToRelay = email.to === config.RELAY_ADDRESS;

    if (isFromManus && isToRelay) {
      await handleManusResponse(email);
    } else {
      await handleInboundEmail(email);
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('Email webhook error:', err);
    res.status(500).send('Internal error');
  }
});

router.post('/webhooks/manus', async (req: Request, res: Response) => {
  try {
    // Handle both pre-parsed JSON (from global middleware) and raw Buffer
    let payload: Record<string, unknown>;
    let rawBody: string;

    if (Buffer.isBuffer(req.body)) {
      rawBody = req.body.toString('utf8');
      if (!rawBody || rawBody.trim() === '') {
        console.log('Manus webhook: empty body (verification request)');
        res.status(200).send('OK');
        return;
      }
      payload = JSON.parse(rawBody);
    } else if (typeof req.body === 'object' && req.body !== null) {
      payload = req.body;
      rawBody = JSON.stringify(req.body);
    } else {
      console.log('Manus webhook: empty or invalid body (verification request)');
      res.status(200).send('OK');
      return;
    }

    // Handle ping/verification events
    if (!payload.event_type || payload.event_type === 'ping') {
      console.log('Manus webhook: ping/verification event');
      res.status(200).send('OK');
      return;
    }

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const url = `${protocol}://${host}${req.originalUrl}`;

    await handleManusWebhook(
      payload as unknown as TaskStoppedPayload,
      {
        signature: req.headers['x-webhook-signature'] as string,
        timestamp: req.headers['x-webhook-timestamp'] as string,
      },
      url,
      rawBody
    );

    res.status(200).send('OK');
  } catch (err) {
    console.error('Manus webhook error:', err);
    res.status(500).send('Error');
  }
});

export { router };
