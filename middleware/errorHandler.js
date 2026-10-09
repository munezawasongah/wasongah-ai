const errorHandler = (err, req, res, next) => {
  console.error('[Error]', err.message);
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  res.status(500).json({ error: 'Server error', message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message });
};
module.exports = { errorHandler };
