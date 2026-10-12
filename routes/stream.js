const express = require('express');
const router = express.Router();
const { getClient } = require('../src/anthropic');

router.post('/', async (req, res) => {
  const { messages, system } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const stream = getClient().messages.stream({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
      max_tokens: parseInt(process.env.MAX_TOKENS) || 1500,
      system: system || 'You are WasongahAI, a helpful and smart AI assistant.',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    stream.on('text', (text) => res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`));
    stream.on('finalMessage', () => {
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    });
    stream.on('error', (err) => {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
      res.end();
    });
    req.on('close', () => stream.abort());
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

module.exports = router;
