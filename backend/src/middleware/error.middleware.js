export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0];
    const message =
      field === 'phone'
        ? 'Phone number is already registered.'
        : field === 'email'
          ? 'Email is already registered.'
          : field === 'transactionReference'
            ? 'Transaction reference is already in use.'
            : 'A record with that value already exists.';

    return res.status(409).json({ success: false, message });
  }

  if (err?.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((item) => item.message);
    return res.status(400).json({
      success: false,
      message: errors[0] || 'Validation failed.',
      errors,
    });
  }

  if (err?.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid record id.',
    });
  }

  const statusCode = err.statusCode || 500;
  const message =
    statusCode === 500 ? 'Internal server error.' : err.message || 'Internal server error.';

  if (statusCode === 500) {
    console.error(err);
  }

  return res.status(statusCode).json({
    success: false,
    message,
    ...(err.errors?.length ? { errors: err.errors } : {}),
  });
};
