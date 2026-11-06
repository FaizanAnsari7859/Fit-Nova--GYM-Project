import User from '../models/user.model.js';
import { ApiError } from '../utils/apiError.js';
import { pick } from '../utils/pick.js';
import { toPublicUser } from '../utils/validators.js';

const UPDATABLE_FIELDS = ['fullName', 'email', 'phone', 'gender', 'dateOfBirth', 'profileImage'];

export const getMe = async (req, res) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    throw new ApiError(404, 'User not found.');
  }

  res.status(200).json({ success: true, data: toPublicUser(user) });
};

export const updateMe = async (req, res) => {
  const user = await User.findByIdAndUpdate(req.user.id, pick(req.body, UPDATABLE_FIELDS), {
    new: true,
    runValidators: true,
  });

  if (!user) {
    throw new ApiError(404, 'User not found.');
  }

  res.status(200).json({
    success: true,
    message: 'Profile updated.',
    data: toPublicUser(user),
  });
};
