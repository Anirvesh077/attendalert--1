import pino from 'pino';
import { config } from './config.js';

// One JSON line per event. Pipe through `npx pino-pretty` if you want it readable in dev.
export const logger = pino({
  level: config.logLevel,
  base: { svc: 'attendalert' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: ['req.headers.authorization', 'password'],
});
