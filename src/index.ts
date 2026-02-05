import 'dotenv/config';
import express from 'express';
import path from 'path';
import { config } from './config';
import { router } from './api/routes';
import { adminRouter } from './api/admin/routes';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Admin API routes
app.use('/admin/api', adminRouter);

// Webhook routes
app.use(router);

// Serve admin frontend in production
const adminDistPath = path.join(__dirname, '../admin/dist');
app.use('/admin', express.static(adminDistPath));
app.get('/admin/*', (_req, res) => {
  res.sendFile(path.join(adminDistPath, 'index.html'));
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
  console.log(`Admin UI: http://localhost:${config.PORT}/admin`);
});
