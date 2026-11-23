import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const port = Number(process.env.PORT) || 5000;

if (!Number.isInteger(port) || port <= 0) {
  throw new Error('PORT must be a positive integer.');
}

const isProduction = process.env.NODE_ENV === 'production';

const clientUrlRaw = process.env.CLIENT_URL || (isProduction ? '' : 'http://localhost:4200');
const clientUrls = clientUrlRaw
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);

const KNOWN_WEAK_SECRETS = new Set([
  'secret',
  'password',
  'jwtsecret',
  'replace-with-a-long-random-string',
  '12345678901234567890123456789012',
  'abcdefghijklmnopqrstuvwxyz123456',
]);

export const validateJwtSecret = (secret) => {
  if (!secret || typeof secret !== 'string' || !secret.trim()) {
    throw new Error('JWT_SECRET is required and cannot be empty.');
  }

  const trimmed = secret.trim();

  if (trimmed.length < 32) {
    throw new Error(`JWT_SECRET must be at least 32 characters long. Current length is ${trimmed.length}.`);
  }

  if (KNOWN_WEAK_SECRETS.has(trimmed.toLowerCase())) {
    throw new Error('JWT_SECRET is a known insecure placeholder. Please generate a strong random secret.');
  }

  return trimmed;
};

export const validateProductionEnv = (config) => {
  if (config.nodeEnv !== 'production') {
    return;
  }

  const errors = [];

  if (!config.mongoUri || !config.mongoUri.trim()) {
    errors.push('MONGO_URI is required in production.');
  }

  if (!config.clientUrls || config.clientUrls.length === 0) {
    errors.push('CLIENT_URL is required in production.');
  } else {
    for (const url of config.clientUrls) {
      if (url === '*') {
        errors.push('Wildcard (*) CLIENT_URL is not permitted in production.');
      } else {
        try {
          const parsed = new URL(url);
          if (!['http:', 'https:'].includes(parsed.protocol)) {
            errors.push(`CLIENT_URL "${url}" must use http or https protocol.`);
          }
        } catch {
          errors.push(`CLIENT_URL "${url}" is not a valid URL.`);
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Production environment validation failed:\n- ${errors.join('\n- ')}`);
  }
};

const jwtSecret = validateJwtSecret(process.env.JWT_SECRET);

const env = {
  port,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: clientUrls[0] || (isProduction ? '' : 'http://localhost:4200'),
  clientUrls,
  mongoUri: process.env.MONGO_URI || '',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  adminName: process.env.ADMIN_NAME || '',
  adminEmail: process.env.ADMIN_EMAIL || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  adminPhone: process.env.ADMIN_PHONE || '',
};

validateProductionEnv(env);

export default env;
