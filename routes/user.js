const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getSupabase } = require('../src/supabase');
const { COSTS } = require('../src/credits');

// GET /api/user/profile
router.get('/profile', requireAuth, async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      email: req.user.email,
      full_name: req.user.profile.full_name,
      credits: req.user.profile.credits,
      plan: req.user.profile.plan,
      total_spent: req.user.profile.total_spent,
      created_at: req.user.profile.created_at,
    }
  });
});

// PUT /api/user/profile
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { full_name } = req.body;
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('profiles')
      .update({ full_name })
      .eq('id', req.user.id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, profile: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/user/credits
router.get('/credits', requireAuth, (req, res) => {
  res.json({
    success: true,
    credits: req.user.profile.credits,
    costs: COSTS,
  });
});

// GET /api/user/usage
router.get('/usage', requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('usage_logs')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, usage: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/user/transactions
router.get('/transactions', requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('transactions')
      .select('*, credit_packages(name)')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, transactions: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/user/chats
router.get('/chats', requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('id, title, created_at, updated_at')
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false })
      .limit(20);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, chats: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/user/chats/:id
router.get('/chats/:id', requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Chat not found' });
    res.json({ success: true, chat: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/user/chats/:id
router.delete('/chats/:id', requireAuth, async (req, res) => {
  try {
    const supabase = getSupabase();
    await supabase.from('chat_sessions').delete().eq('id', req.params.id).eq('user_id', req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
