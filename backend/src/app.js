import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import env from './config/env.js';
import { errorHandler } from './middleware/error.middleware.js';
import { notFound } from './middleware/notFound.middleware.js';
import routes from './routes/index.js';

/**
 * Minimal request logger middleware (S24 – Request Audit Logging).
 * Logs: timestamp, method, url, status code, and response time.
 * Skipped in test environments to keep test output clean.
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '-';
    // eslint-disable-next-line no-console
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms ${ip}`);
  });
  next();
};

export const createApp = (customEnv = env) => {
  const app = express();

  const isDev = customEnv.nodeEnv !== 'production';

  // Allowed development origins
  const devOrigins = [
    'http://localhost:59162',
    'http://127.0.0.1:59162',
    'http://localhost:4200',
    'http://127.0.0.1:4200',
  ];

  // Configured client URLs from environment (normalized, strip trailing slashes, remove wildcards)
  const configuredOrigins = (customEnv.clientUrls || (customEnv.clientUrl ? [customEnv.clientUrl] : []))
    .map((url) => String(url || '').trim().replace(/\/+$/, ''))
    .filter((url) => url && url !== '*');

  // In production, allowed origins must be ONLY explicitly configured trusted origins (no devOrigins, no wildcards)
  const allowedOrigins = isDev
    ? Array.from(new Set([...devOrigins, ...configuredOrigins]))
    : configuredOrigins;

  // Helmet security headers with Angular-compatible Content Security Policy
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
          connectSrc: [
            "'self'",
            ...(isDev
              ? ['http://localhost:*', 'http://127.0.0.1:*', 'ws://localhost:*', 'ws://127.0.0.1:*']
              : []),
            ...allowedOrigins,
          ],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: isDev ? null : [],
        },
      },
    }),
  );

  const corsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = String(origin).trim().replace(/\/+$/, '');

      // In production mode: enforce exact match strictly against explicitly configured trusted origins
      if (!isDev) {
        if (allowedOrigins.includes(normalizedOrigin)) {
          return callback(null, true);
        }
        return callback(null, false);
      }

      // In development mode: allow configured origins, devOrigins, or any localhost/127.0.0.1 port
      if (allowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalizedOrigin);
      if (isLocalhost) {
        return callback(null, true);
      }

      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    optionsSuccessStatus: 204,
  };

  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Request audit logging (skip in test to keep output clean)
  if (customEnv.nodeEnv !== 'test') {
    app.use(requestLogger);
  }

  app.use('/api', routes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
};
