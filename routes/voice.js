// Voice: speech -> text (/api/transcribe) and text -> speech (/api/speak), both via Gemini.
const express = require('express');
const router = express.Router();
const { generate, apiKey } = require('../src/gemini');
const { makeBudget } = require('../src/budget');

const ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';
const sttBudget = makeBudget('VOICE_DAILY_BUDGET_USD', 2);
const ttsBudget = makeBudget('TTS_DAILY_BUDGET_USD', 2);

// ── Speech to text ──
const AUDIO_OK = ['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/flac', 'audio/aac'];

router.post('/transcribe', async (req, res) => {
  const { audio, language } = req.body || {};
  if (!audio || !AUDIO_OK.includes(audio.mime) || typeof audio.data !== 'string' || !audio.data) {
    return res.status(400).json({ error: 'a WAV, MP3, OGG, FLAC or AAC recording is required' });
  }
  if (audio.data.length > 5.2e6) return res.status(400).json({ error: 'recording is too long (max about 90 seconds)' });
  if (!sttBudget.charge(0.01)) return res.status(429).json({ error: 'The daily voice limit has been reached. Please try again tomorrow.' });

  try {
    const hint = language && language !== 'Auto' ? ` The speaker is most likely using ${String(language).slice(0, 30)}, but transcribe whatever language is actually spoken.` : '';
    const text = await generate({
      model: process.env.TRANSCRIBE_MODEL || undefined,
      system: 'You are a precise speech transcription engine. Output only the transcript, never commentary.',
      messages: [{ role: 'user', content: [
        { inlineData: { mimeType: audio.mime, data: audio.data } },
        { text: `Transcribe the speech in this audio exactly as spoken, with natural punctuation.${hint} If there is no intelligible speech, return an empty string.` },
      ] }],
    });
    res.json({ success: true, text: text.trim() });
  } catch (err) {
    sttBudget.refund(0.01);
    console.error('[Transcribe Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Text to speech ──
const TTS_MODELS = () => [process.env.TTS_MODEL, 'gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-3.1-flash-tts-preview'].filter(Boolean);
const VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede', 'Zephyr', 'Leda', 'Orus'];

function plain(t) {
  return String(t)
    .replace(/```[\s\S]*?```/g, ' code block. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(^|\s)[*_]([^*_\n]+)[*_](?=\s|$|[.,;:!?])/g, '$1$2')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function wavFromPcm(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function tts(model, text, voice) {
  const r = await fetch(`${ROOT}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey() },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    }),
  });
  if (!r.ok) {
    let msg = `Google API error (${r.status})`;
    try { msg = (await r.json()).error?.message || msg; } catch {}
    const e = new Error(msg); e.status = r.status; throw e;
  }
  const data = await r.json();
  const part = (data.candidates?.[0]?.content?.parts || []).find(p => (p.inlineData || p.inline_data)?.data);
  if (!part) throw new Error('No audio was returned');
  const d = part.inlineData || part.inline_data;
  const rate = Number(/rate=(\d+)/.exec(d.mimeType || d.mime_type || '')?.[1]) || 24000;
  return wavFromPcm(Buffer.from(d.data, 'base64'), rate);
}

const retiredLike = (e) => e.status === 404 || /not found|no longer available|not supported|deprecated|shut down/i.test(e.message);

// POST /api/speak { text, voice? }
router.post('/speak', async (req, res) => {
  let text = plain(req.body?.text || '');
  if (!text) return res.status(400).json({ error: 'text is required' });
  if (text.length > 1500) {
    const cut = text.slice(0, 1500);
    text = cut.slice(0, Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'), 800) + 1);
  }
  const voice = VOICES.includes(req.body?.voice) ? req.body.voice : 'Kore';
  const cost = Math.max(0.005, (text.length / 15 / 10) * 0.0045); // ~15 chars per second, worst-case 2027 rate
  if (!ttsBudget.charge(cost)) return res.status(429).json({ error: 'The daily read-aloud limit has been reached.' });

  let lastErr;
  try {
    for (const model of TTS_MODELS()) {
      try {
        const wav = await tts(model, text, voice);
        return res.json({ success: true, mimeType: 'audio/wav', data: wav.toString('base64') });
      } catch (e) {
        lastErr = e;
        if (!retiredLike(e)) throw e;
        console.warn(`[TTS] ${model} unavailable: ${e.message}`);
      }
    }
    throw lastErr || new Error('No speech model available');
  } catch (err) {
    ttsBudget.refund(cost);
    console.error('[Speak Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
