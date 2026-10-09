const rateLimit = require('express-rate-limit');
const LIMIT = parseInt(process.env.RATE_LIMIT_PER_MINUTE) || 60;
const rateLimiter = rateLimit({
  windowMs: 60 * 1000, max: LIMIT, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many requests', message: `Max ${LIMIT} requests/minute.` },
  skip: (req) => req.path === '/health'
});
module.exports = { rateLimiter };
