const { getSupabase } = require('./supabase');

const COSTS = {
  chat:      parseInt(process.env.CREDITS_PER_CHAT)  || 2,
  stream:    parseInt(process.env.CREDITS_PER_CHAT)  || 2,
  write:     parseInt(process.env.CREDITS_PER_TOOL)  || 3,
  summarize: parseInt(process.env.CREDITS_PER_TOOL)  || 3,
  translate: parseInt(process.env.CREDITS_PER_TOOL)  || 3,
  code:      parseInt(process.env.CREDITS_PER_TOOL)  || 3,
  ideas:     parseInt(process.env.CREDITS_PER_TOOL)  || 3,
  email:     parseInt(process.env.CREDITS_PER_TOOL)  || 3,
  image:     parseInt(process.env.CREDITS_PER_IMAGE) || 5,
};

async function deductCredits(userId, tool, tokensIn = 0, tokensOut = 0) {
  const cost = COSTS[tool] || 3;
  const supabase = getSupabase();

  // Atomic decrement
  const { data, error } = await supabase.rpc('deduct_credits', {
    p_user_id: userId,
    p_amount: cost,
  });

  if (error) throw new Error('Failed to deduct credits: ' + error.message);

  // Log usage
  await supabase.from('usage_logs').insert({
    user_id: userId,
    tool,
    credits_used: cost,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
  });

  return cost;
}

function getCost(tool) {
  return COSTS[tool] || 3;
}

module.exports = { deductCredits, getCost, COSTS };
