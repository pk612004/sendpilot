import { ZodError } from 'zod';
import { log, errMsg } from './logger.js';

export class HttpError extends Error {
  status;
  details;
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Wrap async route handlers so thrown errors reach the error middleware. */
export const ah = (fn) => (req, res, next) => {
  fn(req, res, next).catch(next);
};

export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  log.error('unhandled_error', { path: req.path, error: errMsg(err), stack: err?.stack });
  return res.status(500).json({ error: 'Internal server error' });
}
