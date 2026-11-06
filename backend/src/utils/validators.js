const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['member', 'trainer'];
const GENDERS = ['male', 'female', 'other'];

export const normalizePhone = (value) => String(value || '').replace(/\D/g, '');

export const toPublicUser = (user) => {
  const plain = user.toObject();
  delete plain.password;
  return plain;
};

const isOldEnough = (dateOfBirth) => {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 13);
  return dateOfBirth <= cutoff;
};

export const validateRegistration = (body) => {
  const errors = [];
  const fullName = String(body.fullName || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const phone = normalizePhone(body.phone);
  const password = String(body.password || '');
  const confirmPassword = String(body.confirmPassword || '');
  const gender = String(body.gender || '').trim().toLowerCase();
  const role = String(body.role || '').trim().toLowerCase();
  const dateOfBirth = new Date(body.dateOfBirth);

  if (fullName.length < 2 || fullName.length > 80) {
    errors.push('Full name must be between 2 and 80 characters.');
  }

  if (!EMAIL_PATTERN.test(email)) {
    errors.push('A valid email address is required.');
  }

  if (!/^\d{10,15}$/.test(phone)) {
    errors.push('Phone number must contain 10 to 15 digits.');
  }

  if (password.length < 8 || password.length > 64) {
    errors.push('Password must be between 8 and 64 characters.');
  }

  if (password !== confirmPassword) {
    errors.push('Confirm password must match the password.');
  }

  if (!GENDERS.includes(gender)) {
    errors.push('Gender must be male, female, or other.');
  }

  if (Number.isNaN(dateOfBirth.getTime()) || dateOfBirth >= new Date()) {
    errors.push('Date of birth must be a valid past date.');
  } else if (!isOldEnough(dateOfBirth)) {
    errors.push('You must be at least 13 years old.');
  }

  if (role === 'admin') {
    errors.push('Admin accounts cannot be created through public registration.');
  } else if (!ROLES.includes(role)) {
    errors.push('Role must be member or trainer.');
  }

  return {
    errors,
    value: {
      fullName,
      email,
      phone,
      password,
      gender,
      dateOfBirth,
      role,
      profileImage: String(body.profileImage || '').trim(),
    },
  };
};

export const validateLogin = (body) => {
  const errors = [];
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!EMAIL_PATTERN.test(email)) {
    errors.push('A valid email address is required.');
  }

  if (!password) {
    errors.push('Password is required.');
  }

  return { errors, value: { email, password } };
};
