const jwt = require('jsonwebtoken');
const { getSupabase } = require('../src/supabase');

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized', message: 'No token provided' });
    }

    const token = header.split(' ')[1];

    // Verify with Supabase
    const supabase = getSupabase();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }

    // Fetch profile with credits
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return res.status(401).json({ error: 'Profile not found' });
    }

    req.user = { ...user, profile };
    next();
  } catch (err) {
    console.error('[Auth Error]', err.message);
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Check user has enough credits for the operation
function requireCredits(cost = 1) {
  return (req, res, next) => {
    const credits = req.user?.profile?.credits || 0;
    if (credits < cost) {
      return res.status(402).json({
        error: 'Insufficient credits',
        message: `This action requires ${cost} credits. You have ${credits}.`,
        credits_available: credits,
        credits_required: cost,
      });
    }
    next();
  };
}

module.exports = { requireAuth, requireCredits };
