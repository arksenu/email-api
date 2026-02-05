import 'dotenv/config';
import express from 'express';
import path from 'path';
import { config } from './config';
import { router } from './api/routes';
import { adminRouter } from './api/admin/routes';
import { userRouter } from './api/user/routes';

const app = express();

// Preserve raw body for Manus webhook signature verification
app.use('/webhooks/manus', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Admin API routes
app.use('/admin/api', adminRouter);

// User API routes
app.use('/api', userRouter);

// Webhook routes
app.use(router);

// Serve admin frontend in production
const adminDistPath = path.join(__dirname, '../admin/dist');
app.use('/admin', express.static(adminDistPath));
app.get('/admin/*', (_req, res) => {
  res.sendFile(path.join(adminDistPath, 'index.html'));
});

// Serve user portal in production
const portalDistPath = path.join(__dirname, '../portal/dist');
app.use('/portal', express.static(portalDistPath));
app.get('/portal/*', (_req, res) => {
  res.sendFile(path.join(portalDistPath, 'index.html'));
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
  console.log(`Admin UI: http://localhost:${config.PORT}/admin`);
  console.log(`User Portal: http://localhost:${config.PORT}/portal`);
});
