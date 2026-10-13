// Optional Cloudflare Turnstile bot protection. Inert unless both env vars are set:
//   TURNSTILE_SITE_KEY and TURNSTILE_SECRET
const crypto = require('crypto');

const enabled = () => !!(process.env.TURNSTILE_SECRET && process.env.TURNSTILE_SITE_KEY);
const sign = (exp) => crypto.createHmac('sha256', process.env.TURNSTILE_SECRET).update(String(exp)).digest('hex');

function cookieOk(req) {
  const m = /(?:^|;\s*)wg=(\d+)\.([a-f0-9]+)/.exec(req.headers.cookie || '');
  if (!m || Number(m[1]) < Date.now()) return false;
  const a = Buffer.from(m[2]), b = Buffer.from(sign(m[1]));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireHuman(req, res, next) {
  if (!enabled() || cookieOk(req)) return next();
  res.status(401).json({ error: 'verification_required' });
}

async function verify(req, res) {
  if (!enabled()) return res.json({ success: true });
  try {
    const token = String(req.body?.token || '');
    if (!token) return res.status(400).json({ error: 'token required' });
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET, response: token, remoteip: req.ip || '' }),
    });
    const data = await r.json();
    if (!data.success) return res.status(403).json({ error: 'verification failed' });
    const ttl = 2 * 60 * 60 * 1000;
    const exp = Date.now() + ttl;
    res.setHeader('Set-Cookie', `wg=${exp}.${sign(exp)}; Path=/; Max-Age=${ttl / 1000}; HttpOnly; SameSite=Lax${req.secure ? '; Secure' : ''}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Verify Error]', err.message);
    res.status(500).json({ error: 'verification error' });
  }
}

module.exports = { enabled, requireHuman, verify };
