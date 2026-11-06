import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import env from './config/env.js';
import { seedAdmin } from './config/seedAdmin.js';

if (!env.jwtSecret || env.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be a random string of at least 32 characters.');
}

const app = createApp();

try {
  await connectDB();
  await seedAdmin();
  app.listen(env.port, () => {
    console.log(`FitNova API listening on port ${env.port} (${env.nodeEnv})`);
  });
} catch (error) {
  console.error(`FitNova API failed to start: ${error.message}`);
  process.exit(1);
}
