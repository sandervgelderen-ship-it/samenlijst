import { Router } from 'express';
import { aiRouter } from './ai';

export const apiRouter = Router();

// Route map (all paths relative to /api):
//   GET  /health
//   POST /analyze, /route-items, /smart-add, /forgot, /sort-aisles, /elaborate, /voice-memo
apiRouter.use('/', aiRouter);
