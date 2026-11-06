import User from '../models/user.model.js';
import { ApiError } from '../utils/apiError.js';
import { signToken } from '../utils/token.js';
import { toPublicUser, validateLogin, validateRegistration } from '../utils/validators.js';

const rejectInvalid = (errors) => {
  if (errors.length) {
    const statusCode = errors.some((error) => error.includes('Admin accounts')) ? 403 : 400;
    throw new ApiError(statusCode, errors[0], errors);
  }
};

export const register = async (req, res) => {
  const { errors, value } = validateRegistration(req.body);
  rejectInvalid(errors);

  const user = await User.create(value);
  const token = signToken(user);

  res.status(201).json({
    success: true,
    message: 'Registration successful.',
    token,
    data: toPublicUser(user),
  });
};

export const login = async (req, res) => {
  const { errors, value } = validateLogin(req.body);
  rejectInvalid(errors);

  const user = await User.findOne({ email: value.email }).select('+password');

  if (!user || !(await user.comparePassword(value.password))) {
    throw new ApiError(401, 'Invalid email or password.');
  }

  const token = signToken(user);

  res.status(200).json({
    success: true,
    message: 'Login successful.',
    token,
    data: toPublicUser(user),
  });
};
