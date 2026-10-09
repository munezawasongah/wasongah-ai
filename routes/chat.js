const express = require('express');
const router = express.Router();
const { getClient } = require('../src/anthropic');

const SYSTEM = 'You are WasongahAI, a helpful, smart, and friendly AI assistant. Be conversational, accurate, and genuinely useful.';

// POST /api/chat
router.post('/', async (req, res) => {
  const { messages, system } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }
  try {
    const response = await getClient().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: parseInt(process.env.MAX_TOKENS) || 1500,
      system: system || SYSTEM,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });
    res.json({ success: true, text: response.content?.[0]?.text || '' });
  } catch (err) {
    console.error('[Chat Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
