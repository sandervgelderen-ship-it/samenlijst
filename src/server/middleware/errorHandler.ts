import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  const statusCode = err.status || (err.message && err.message.includes('429') ? 429 : 500);
  
  if (statusCode !== 429) {
    console.error('[Exception:', new Date().toISOString(), ']', err.stack || err);
  } else {
    console.log('[Notice:', new Date().toISOString(), '] Rate limit or quota exhausted (429).');
  }
  
  res.status(statusCode).json({
    error: err.message || 'Internal Server Error'
  });
}
