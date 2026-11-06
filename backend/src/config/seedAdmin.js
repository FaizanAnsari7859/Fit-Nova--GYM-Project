import env from './env.js';
import User from '../models/user.model.js';

export const seedAdmin = async () => {
  if (!env.adminName || !env.adminEmail || !env.adminPassword || !env.adminPhone) {
    return;
  }

  if (env.adminPassword.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters.');
  }

  const email = env.adminEmail.trim().toLowerCase();
  const existing = await User.findOne({ email });

  if (existing) {
    return;
  }

  await User.create({
    fullName: env.adminName.trim(),
    email,
    phone: env.adminPhone,
    password: env.adminPassword,
    gender: 'other',
    dateOfBirth: new Date('1990-01-01'),
    role: 'admin',
  });

  console.log('Bootstrap admin account created from environment variables.');
};
