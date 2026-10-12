const express = require('express');
const router = express.Router();
const { generate } = require('../src/gemini');

const SYSTEM = 'You are WasongahAI, a helpful, smart, and friendly AI assistant. Be conversational, accurate, and genuinely useful.';

// POST /api/chat
router.post('/', async (req, res) => {
  const { messages, system } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }
  try {
    const text = await generate({ messages, system: system || SYSTEM });
    res.json({ success: true, text });
  } catch (err) {
    console.error('[Chat Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
