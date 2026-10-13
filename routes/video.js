// Text -> video using Google Veo (Gemini API). Async: start -> poll status -> stream file.
const express = require('express');
const { Readable } = require('stream');
const router = express.Router();

const ROOT = 'https://generativelanguage.googleapis.com/v1beta';

// quality -> model + estimated USD per second (720p, Gemini API paid tier)
const QUALITY = {
  lite:     { model: () => process.env.VEO_MODEL_LITE     || 'veo-3.1-lite-generate-preview', rate: 0.05 },
  fast:     { model: () => process.env.VEO_MODEL_FAST     || 'veo-3.1-fast-generate-preview', rate: 0.10 },
  standard: { model: () => process.env.VEO_MODEL_STANDARD || 'veo-3.1-generate-preview',      rate: 0.40 },
};

const { makeBudget } = require('../src/budget');
const budget = makeBudget('VIDEO_DAILY_BUDGET_USD', 10);
const charge = (usd) => budget.charge(usd);
const refund = (usd) => budget.refund(usd);

function key() {
  const k = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!k) throw new Error('GEMINI_API_KEY is not set on the server');
  return k;
}

async function googleError(res) {
  let msg = `Google API error (${res.status})`;
  try { msg = (await res.json()).error?.message || msg; } catch {}
  return new Error(msg);
}

// POST /api/video  { prompt, style?, aspectRatio?, duration?, quality?, image?: {data, mime} }
router.post('/', async (req, res) => {
  try {
    const { prompt, style, aspectRatio = '16:9', duration = 8, quality = 'fast', image } = req.body || {};
    if (!prompt || !String(prompt).trim()) return res.status(400).json({ error: 'prompt is required' });
    if (String(prompt).length > 2000) return res.status(400).json({ error: 'prompt is too long (max 2000 characters)' });

    let imageInput = null;
    if (image) {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(image.mime) || typeof image.data !== 'string' || image.data.length > 9e6) {
        return res.status(400).json({ error: 'image must be a PNG, JPEG or WEBP under 6 MB' });
      }
      imageInput = { bytesBase64Encoded: image.data, mimeType: image.mime };
    }

    const q = QUALITY[quality] || QUALITY.fast;
    const secs = [4, 6, 8].includes(Number(duration)) ? Number(duration) : 8;
    const ratio = ['16:9', '9:16'].includes(aspectRatio) ? aspectRatio : '16:9';
    const cost = q.rate * secs;

    if (!charge(cost)) {
      return res.status(429).json({ error: 'The daily video limit has been reached. Please try again tomorrow.' });
    }

    const text = style && style !== 'None' ? `${String(prompt).trim()}\n\nVisual style: ${style}.` : String(prompt).trim();

    const r = await fetch(`${ROOT}/models/${q.model()}:predictLongRunning`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key() },
      body: JSON.stringify({
        instances: [imageInput ? { prompt: text, image: imageInput } : { prompt: text }],
        parameters: { aspectRatio: ratio, durationSeconds: secs, resolution: '720p' },
      }),
    });
    if (!r.ok) { refund(cost); throw await googleError(r); }
    const data = await r.json();
    if (!data.name) { refund(cost); throw new Error('Google did not return a video job'); }
    res.json({ success: true, id: data.name });
  } catch (err) {
    console.error('[Video Start Error]', err.message);
    res.status(err.message.includes('required') ? 400 : 500).json({ error: err.message });
  }
});

// GET /api/video/status?id=models/<model>/operations/<id>
router.get('/status', async (req, res) => {
  try {
    const id = String(req.query.id || '');
    if (!/^models\/[\w.\-]+\/operations\/[\w\-]+$/.test(id)) return res.status(400).json({ error: 'invalid id' });

    const r = await fetch(`${ROOT}/${id}`, { headers: { 'x-goog-api-key': key() } });
    if (!r.ok) throw await googleError(r);
    const op = await r.json();

    if (!op.done) return res.json({ done: false });
    if (op.error) return res.json({ done: true, error: op.error.message || 'Video generation failed' });

    const resp = op.response?.generateVideoResponse || op.response || {};
    const uri = resp.generatedSamples?.[0]?.video?.uri || resp.generatedVideos?.[0]?.video?.uri;
    if (!uri) {
      const why = (resp.raiMediaFilteredReasons || []).join(' ') || 'The video was blocked by Google safety filters. Try rewording your description.';
      return res.json({ done: true, error: why });
    }
    res.json({ done: true, url: `/api/video/file?uri=${encodeURIComponent(uri)}` });
  } catch (err) {
    console.error('[Video Status Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/video/file?uri=...&download=1  (proxies the mp4 so the API key stays on the server)
router.get('/file', async (req, res) => {
  try {
    const uri = String(req.query.uri || '');
    let u;
    try { u = new URL(uri); } catch { return res.status(400).json({ error: 'invalid uri' }); }
    if (u.protocol !== 'https:' || u.hostname !== 'generativelanguage.googleapis.com') {
      return res.status(400).json({ error: 'invalid uri' });
    }

    const headers = { 'x-goog-api-key': key() };
    if (req.headers.range) headers.Range = req.headers.range;
    const r = await fetch(uri, { headers, redirect: 'follow' });
    if (!r.ok && r.status !== 206) throw await googleError(r);

    res.status(r.status);
    res.setHeader('Content-Type', r.headers.get('content-type') || 'video/mp4');
    for (const h of ['content-length', 'content-range', 'accept-ranges']) {
      const v = r.headers.get(h);
      if (v) res.setHeader(h, v);
    }
    if (!r.headers.get('accept-ranges')) res.setHeader('Accept-Ranges', 'bytes');
    if (req.query.download) res.setHeader('Content-Disposition', 'attachment; filename="wasongah-video.mp4"');
    Readable.fromWeb(r.body).pipe(res);
  } catch (err) {
    console.error('[Video File Error]', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;
