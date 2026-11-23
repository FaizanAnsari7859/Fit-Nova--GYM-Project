import rateLimit from 'express-rate-limit';

/**
 * Factory function to create authentication rate limiters.
 * Defaults:
 * - 15 minute window
 * - 20 max attempts in production / development
 * - 100 max attempts in test environment (customizable via AUTH_RATE_LIMIT_MAX)
 */
export const createAuthLimiter = (customOptions = {}) => {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: (_req) => {
      if (process.env.AUTH_RATE_LIMIT_MAX) {
        const parsed = Number(process.env.AUTH_RATE_LIMIT_MAX);
        if (Number.isInteger(parsed) && parsed > 0) {
          return parsed;
        }
      }
      return process.env.NODE_ENV === 'test' ? 100 : 20;
    },
    standardHeaders: true, // draft-6 / draft-7 RateLimit headers
    legacyHeaders: false, // X-RateLimit-* headers
    statusCode: 429,
    handler: (_req, res, _next, options) => {
      res.status(options.statusCode || 429).json({
        success: false,
        message: 'Too many authentication attempts. Please try again later.',
      });
    },
    ...customOptions,
  });
};

export const authLimiter = createAuthLimiter();
