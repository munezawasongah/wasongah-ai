// Text -> image (and photo editing) using Google's Nano Banana models via the Gemini API.
const express = require('express');
const router = express.Router();
const { makeBudget } = require('../src/budget');

const ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';
const budget = makeBudget('IMAGE_DAILY_BUDGET_USD', 3);

// Models are tried in order; if one is retired/unavailable the next is used.
const MODELS = {
  standard: () => [process.env.IMAGE_MODEL_STANDARD, 'gemini-nano-banana-2.1', 'gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image'].filter(Boolean),
  pro:      () => [process.env.IMAGE_MODEL_PRO, 'gemini-3-pro-image'].filter(Boolean),
};
const PRICE = { standard: 0.04, pro: 0.14 }; // USD per 1K image, rounded up

function key() {
  const k = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!k) throw new Error('GEMINI_API_KEY is not set on the server');
  return k;
}

async function call(model, parts, aspectRatio, withConfig) {
  const generationConfig = { responseModalities: ['TEXT', 'IMAGE'] };
  if (withConfig) generationConfig.imageConfig = { aspectRatio, imageSize: '1K' };
  const r = await fetch(`${ROOT}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key() },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig }),
  });
  if (!r.ok) {
    let msg = `Google API error (${r.status})`;
    try { msg = (await r.json()).error?.message || msg; } catch {}
    const e = new Error(msg); e.status = r.status; throw e;
  }
  const data = await r.json();
  const outParts = data.candidates?.[0]?.content?.parts || [];
  const img = outParts.find(p => (p.inlineData || p.inline_data)?.data);
  if (img) {
    const d = img.inlineData || img.inline_data;
    return { mimeType: d.mimeType || d.mime_type || 'image/png', data: d.data };
  }
  const why = data.promptFeedback?.blockReason
    ? `blocked by Google safety filters (${data.promptFeedback.blockReason})`
    : (outParts.map(p => p.text).filter(Boolean).join(' ').slice(0, 300) || 'no image was returned');
  const e = new Error(`The model did not return an image: ${why}`); e.noImage = true; throw e;
}

const retiredLike = (e) => e.status === 404 || /not found|no longer available|not supported|deprecated|shut down|permission/i.test(e.message);
const configLike  = (e) => e.status === 400 && /imageConfig|image_config|aspect|image_size|imageSize|unknown name|invalid json/i.test(e.message);

// POST /api/image { prompt, style?, aspectRatio?, quality?, image?: {data, mime} }
router.post('/', async (req, res) => {
  const { prompt, style, aspectRatio = '1:1', quality = 'standard', image } = req.body || {};
  if (!prompt || !String(prompt).trim()) return res.status(400).json({ error: 'prompt is required' });
  if (String(prompt).length > 2000) return res.status(400).json({ error: 'prompt is too long (max 2000 characters)' });
  const q = MODELS[quality] ? quality : 'standard';
  const ratio = ['1:1', '16:9', '9:16', '4:3', '3:4'].includes(aspectRatio) ? aspectRatio : '1:1';

  const parts = [];
  if (image) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(image.mime) || typeof image.data !== 'string' || image.data.length > 9e6) {
      return res.status(400).json({ error: 'image must be a PNG, JPEG or WEBP under 6 MB' });
    }
    parts.push({ inlineData: { mimeType: image.mime, data: image.data } });
  }
  const text = String(prompt).trim() + (style && style !== 'None' ? `\n\nStyle: ${style}.` : '');
  parts.push({ text });

  if (!budget.charge(PRICE[q])) {
    return res.status(429).json({ error: 'The daily image limit has been reached. Please try again tomorrow.' });
  }

  let lastErr;
  try {
    for (const model of MODELS[q]()) {
      try {
        let out;
        try { out = await call(model, parts, ratio, true); }
        catch (e) {
          if (!configLike(e)) throw e;
          // model rejected imageConfig: retry without it, hinting the ratio in the prompt
          const hinted = parts.slice(0, -1).concat({ text: `${text}\n\nAspect ratio: ${ratio}.` });
          out = await call(model, hinted, ratio, false);
        }
        return res.json({ success: true, model, ...out });
      } catch (e) {
        lastErr = e;
        if (!retiredLike(e)) throw e;
        console.warn(`[Image] ${model} unavailable: ${e.message}`);
      }
    }
    throw lastErr || new Error('No image model available');
  } catch (err) {
    budget.refund(PRICE[q]);
    console.error('[Image Error]', err.message);
    res.status(err.noImage ? 422 : 500).json({ error: err.message });
  }
});

module.exports = router;
