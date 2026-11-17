import crypto from 'node:crypto';
import { HttpError } from './errors.js';

export function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(plain, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(plain, salt, expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

const sign = (body, secret) => crypto.createHmac('sha256', secret).update(body).digest('base64url');

export function signToken(claims, secret, ttlSeconds = 8 * 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = Buffer.from(JSON.stringify({ ...claims, exp })).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export function readToken(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const a = Buffer.from(sig ?? '');
  const b = Buffer.from(sign(body, secret));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
    return claims.exp > Math.floor(Date.now() / 1000) ? claims : null;
  } catch {
    return null;
  }
}

export function requireRole(role, secret) {
  return (req, _res, next) => {
    const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
    const claims = match ? readToken(match[1], secret) : null;
    if (!claims) return next(new HttpError(401, 'Please sign in to continue'));
    if (claims.role !== role) return next(new HttpError(403, 'You do not have access to this area'));
    req.user = { role: claims.role, id: claims.id };
    next();
  };
}
