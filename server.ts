import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import rateLimit from 'express-rate-limit';
import { apiRouter } from './src/server/routes/index';
import { errorHandler } from './src/server/middleware/errorHandler';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // ─── CORS for the Android app ────────────────────────────────────────────────
  // The Capacitor app is served from http://localhost inside the WebView and calls
  // this server cross-origin, so /api answers CORS preflights.
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
    next();
  });

  // ─── Body Parsing ────────────────────────────────────────────────────────────
  // The photo and voice-memo routes get a larger limit. It is
  // registered first: once a body is parsed, the general parser skips it.
  app.use('/api/smart-add', express.json({ limit: '12mb' }));
  app.use('/api/voice-memo', express.json({ limit: '12mb' }));
  app.use(express.json({ limit: '1mb' }));

  // ─── Rate Limiting ───────────────────────────────────────────────────────────
  // General API: 60 requests per minute per IP
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Te veel verzoeken. Probeer het over een minuut opnieuw.' },
  });
  app.use('/api', apiLimiter);
  // ─────────────────────────────────────────────────────────────────────────────

  app.use('/api', apiRouter);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Error handler middleware must be strictly last
  app.use(errorHandler);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
