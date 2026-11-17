import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..');

export const config = {
  port: Number(process.env.PORT) || 4000,
  dbPath: process.env.DB_PATH || path.join(serverRoot, 'data', 'attendalert.db'),
  certDir: process.env.CERT_DIR || path.join(serverRoot, 'data', 'certificates'),
  clientDist: path.resolve(serverRoot, '..', 'client', 'dist'),
  secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
  logLevel: process.env.LOG_LEVEL || 'info',
  isProd: process.env.NODE_ENV === 'production',
  defaultStudentPassword: 'student123',
};
