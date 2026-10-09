const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getClient } = require('../src/anthropic');
const { deductCredits, getCost } = require('../src/credits');

router.post('/', requireAuth, async (req, res) => {
  const { messages, system, session_id } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages required' });

  const cost = getCost('stream');
  if ((req.user.profile.credits || 0) < cost) {
    return res.status(402).json({ error: 'Insufficient credits', credits_available: req.user.profile.credits, credits_required: cost });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const client = getClient();
  let fullText = '';

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: parseInt(process.env.MAX_TOKENS) || 1500,
      system: system || 'You are WasongahAI, a helpful and smart AI assistant.',
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    stream.on('text', (text) => {
      fullText += text;
      res.write(`data: ${JSON.stringify({ type:'text', text })}\n\n`);
    });

    stream.on('finalMessage', async (message) => {
      // Deduct credits after successful completion
      await deductCredits(req.user.id, 'stream', message.usage?.input_tokens, message.usage?.output_tokens);
      res.write(`data: ${JSON.stringify({ type:'done', credits_used: cost, credits_remaining: req.user.profile.credits - cost })}\n\n`);
      res.end();
    });

    stream.on('error', (err) => {
      res.write(`data: ${JSON.stringify({ type:'error', message: err.message })}\n\n`);
      res.end();
    });

    req.on('close', () => stream.abort());
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type:'error', message: err.message })}\n\n`);
    res.end();
  }
});

module.exports = router;
