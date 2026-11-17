import { config } from './config.js';
import { logger } from './logger.js';
import { openDb } from './db.js';
import { seedDatabase } from './seed.js';
import { createApp } from './app.js';

const db = openDb(config.dbPath);
if (seedDatabase(db)) logger.info('empty database, loaded demo data (30 students, 5 subjects, 4 weeks)');

if (config.isProd && config.secret === 'dev-only-secret-change-me') {
  logger.warn('SESSION_SECRET is not set, using the insecure development default');
}

const server = createApp({ db }).listen(config.port, () => {
  logger.info({ port: config.port, db: config.dbPath }, 'AttendAlert API is up');
});

function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
