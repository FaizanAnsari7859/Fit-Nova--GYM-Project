import cors from 'cors';
import express from 'express';
import env from './config/env.js';
import { errorHandler } from './middleware/error.middleware.js';
import { notFound } from './middleware/notFound.middleware.js';
import routes from './routes/index.js';

export const createApp = () => {
  const app = express();

  const isDev = env.nodeEnv !== 'production';

  // Allowed development origins
  const devOrigins = [
    'http://localhost:59162',
    'http://127.0.0.1:59162',
    'http://localhost:4200',
    'http://127.0.0.1:4200',
  ];

  // Configured client URLs from environment
  const configuredOrigins = env.clientUrls || (env.clientUrl ? [env.clientUrl] : []);

  const allowedOrigins = Array.from(new Set([...devOrigins, ...configuredOrigins]));

  const corsOptions = {
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      // Exact match with configured or development origins
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // In development mode, safely allow any localhost / 127.0.0.1 port
      if (isDev) {
        const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
        if (isLocalhost) {
          return callback(null, true);
        }
      }

      // In production, reject unauthorized origins
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
  app.use('/api', routes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
};
