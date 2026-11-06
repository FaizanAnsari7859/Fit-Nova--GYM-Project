import mongoose from 'mongoose';

export const getHealth = (req, res) => {
  const connected = mongoose.connection.readyState === 1;

  res.status(200).json({
    success: true,
    service: 'FitNova API',
    status: 'ok',
    database: connected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
};
