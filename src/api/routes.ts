import { Router, Request, Response } from 'express';
import multer from 'multer';
import { config } from '../config';
import { healthCheck } from '../db/client';
import { parseWebhookPayload } from '../email/parser';
import { handleInboundEmail } from '../email/inbound';
import { handleManusResponse } from '../email/response';

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
    console.error('Webhook error:', err);
    res.status(500).send('Internal error');
  }
});

export { router };
