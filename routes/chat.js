const express = require('express');
const router = express.Router();
const { requireAuth, requireCredits } = require('../middleware/auth');
const { getClient } = require('../src/anthropic');
const { deductCredits, getCost } = require('../src/credits');
const { getSupabase } = require('../src/supabase');

const SYSTEM = 'You are WasongahAI, a helpful, smart, and friendly AI assistant. Be conversational, accurate, and genuinely useful.';

// POST /api/chat
router.post('/', requireAuth, requireCredits(getCost('chat')), async (req, res) => {
  const { messages, session_id, system } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: parseInt(process.env.MAX_TOKENS) || 1500,
      system: system || SYSTEM,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    const text = response.content?.[0]?.text || '';

    // Deduct credits
    await deductCredits(req.user.id, 'chat', response.usage?.input_tokens, response.usage?.output_tokens);

    // Save/update chat session
    const supabase = getSupabase();
    const allMessages = [...messages, { role: 'assistant', content: text }];

    if (session_id) {
      await supabase.from('chat_sessions')
        .update({ messages: allMessages, updated_at: new Date().toISOString() })
        .eq('id', session_id).eq('user_id', req.user.id);
    } else {
      // Auto-generate title from first message
      const title = messages[0]?.content?.slice(0, 60) || 'New Chat';
      const { data: newSession } = await supabase.from('chat_sessions')
        .insert({ user_id: req.user.id, title, messages: allMessages })
        .select().single();

      return res.json({
        success: true, text,
        session_id: newSession?.id,
        credits_used: getCost('chat'),
        credits_remaining: req.user.profile.credits - getCost('chat'),
      });
    }

    res.json({
      success: true, text, session_id,
      credits_used: getCost('chat'),
      credits_remaining: req.user.profile.credits - getCost('chat'),
    });
  } catch (err) {
    console.error('[Chat Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
