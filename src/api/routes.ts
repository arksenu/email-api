import { Router, Request, Response } from 'express';
import multer from 'multer';
import express from 'express';
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

router.post('/webhooks/manus', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  try {
    const rawBody = req.body.toString('utf8');
    const payload: TaskStoppedPayload = JSON.parse(rawBody);

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const url = `${protocol}://${host}${req.originalUrl}`;

    await handleManusWebhook(
      payload,
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
