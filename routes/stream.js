const express = require('express');
const router = express.Router();
const { stream } = require('../src/gemini');

router.post('/', async (req, res) => {
  const { messages, system, search, language } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const ac = new AbortController();
  res.on('close', () => ac.abort());
  const send = (o) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(o)}\n\n`); };

  try {
    await stream({
      messages,
      system: (system || 'You are WasongahAI, a helpful and smart assistant. Be accurate and clear. Use short paragraphs and simple formatting.')
        + (language && language !== 'Auto' ? ` Always reply in ${String(language).slice(0, 30)} unless the user asks for another language.` : ''),
      search: !!search,
      signal: ac.signal,
      onSources: (sources) => send({ type: 'sources', sources }),
      onText: (text) => send({ type: 'text', text }),
    });
    send({ type: 'done' });
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('[Stream Error]', err.message);
      send({ type: 'error', message: err.message });
    }
  }
  res.end();
});

module.exports = router;
