import env from './env.js';
import User from '../models/user.model.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\d{10,15}$/;

export const seedAdmin = async () => {
  if (!env.adminName || !env.adminEmail || !env.adminPassword || !env.adminPhone) {
    return;
  }

  if (env.adminPassword.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters.');
  }

  const email = env.adminEmail.trim().toLowerCase();

  if (!EMAIL_PATTERN.test(email)) {
    throw new Error('ADMIN_EMAIL must be a valid email address.');
  }

  const phone = String(env.adminPhone || '').replace(/\D/g, '');
  if (!PHONE_PATTERN.test(phone)) {
    throw new Error('ADMIN_PHONE must contain 10 to 15 digits.');
  }

  const existing = await User.findOne({ email });

  if (existing) {
    return;
  }

  await User.create({
    fullName: env.adminName.trim(),
    email,
    phone,
    password: env.adminPassword,
    gender: 'other',
    dateOfBirth: new Date('1990-01-01'),
    role: 'admin',
  });

  console.log('Bootstrap admin account created from environment variables.');
};
