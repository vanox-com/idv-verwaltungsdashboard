import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

export const SESSION_HOURS = 12;

export async function hashPassword(klartext) {
  return bcrypt.hash(klartext, 12);
}

export async function verifyPassword(klartext, hash) {
  if (!hash) return false;
  return bcrypt.compare(klartext, hash);
}

export function newSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}
