// Combined daily spend guard (all users). Resets each UTC day or on restart.
function makeBudget(envName, defaultUsd) {
  let st = { day: '', usd: 0 };
  const limit = () => parseFloat(process.env[envName] || defaultUsd);
  const today = () => new Date().toISOString().slice(0, 10);
  return {
    charge(usd) {
      if (st.day !== today()) st = { day: today(), usd: 0 };
      if (st.usd + usd > limit()) return false;
      st.usd += usd;
      return true;
    },
    refund(usd) { st.usd = Math.max(0, st.usd - usd); },
  };
}
module.exports = { makeBudget };
