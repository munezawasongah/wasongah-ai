const express = require('express');
const router = express.Router();
const axios = require('axios');
const { requireAuth } = require('../middleware/auth');
const { getSupabase } = require('../src/supabase');

// ── Helpers ──────────────────────────────────────────────────

async function getMpesaToken() {
  const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const url = process.env.MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
    : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
  const { data } = await axios.get(url, { headers: { Authorization: `Basic ${auth}` } });
  return data.access_token;
}

function getMpesaTimestamp() {
  return new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
}

function getMpesaPassword(timestamp) {
  const raw = `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`;
  return Buffer.from(raw).toString('base64');
}

// ── GET /api/payments/packages ────────────────────────────────
router.get('/packages', async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('credit_packages')
      .select('*')
      .eq('is_active', true)
      .order('price_usd');
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, packages: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments/mpesa/initiate ─────────────────────────
router.post('/mpesa/initiate', requireAuth, async (req, res) => {
  try {
    const { phone, package_id } = req.body;
    if (!phone || !package_id) return res.status(400).json({ error: 'phone and package_id are required' });

    // Normalize phone: 0712... → 254712...
    let normalizedPhone = phone.replace(/\s+/g, '');
    if (normalizedPhone.startsWith('0')) normalizedPhone = '254' + normalizedPhone.slice(1);
    if (!normalizedPhone.startsWith('254')) normalizedPhone = '254' + normalizedPhone;

    // Get package
    const supabase = getSupabase();
    const { data: pkg } = await supabase.from('credit_packages').select('*').eq('id', package_id).single();
    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    // Create pending transaction
    const { data: txn } = await supabase.from('transactions').insert({
      user_id: req.user.id,
      type: 'mpesa',
      status: 'pending',
      amount_kes: pkg.price_kes,
      credits_bought: pkg.credits,
      package_id: pkg.id,
      mpesa_phone: normalizedPhone,
    }).select().single();

    // Initiate STK Push
    const token = await getMpesaToken();
    const timestamp = getMpesaTimestamp();
    const password = getMpesaPassword(timestamp);
    const stkUrl = process.env.MPESA_ENV === 'production'
      ? 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest'
      : 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';

    const { data: stkRes } = await axios.post(stkUrl, {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(pkg.price_kes),
      PartyA: normalizedPhone,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: normalizedPhone,
      CallBackURL: process.env.MPESA_CALLBACK_URL,
      AccountReference: `WasongahAI-${txn.id.slice(0,8)}`,
      TransactionDesc: `${pkg.credits} WasongahAI Credits`,
    }, { headers: { Authorization: `Bearer ${token}` } });

    // Save checkout request ID
    await supabase.from('transactions')
      .update({ mpesa_checkout_id: stkRes.CheckoutRequestID })
      .eq('id', txn.id);

    res.json({
      success: true,
      message: 'STK Push sent. Check your phone to complete payment.',
      transaction_id: txn.id,
      checkout_request_id: stkRes.CheckoutRequestID,
    });
  } catch (err) {
    console.error('[M-Pesa Error]', err.response?.data || err.message);
    res.status(500).json({ error: 'M-Pesa initiation failed', details: err.response?.data?.errorMessage || err.message });
  }
});

// ── POST /api/payments/mpesa/callback ────────────────────────
// Called by Safaricom after payment
router.post('/mpesa/callback', async (req, res) => {
  try {
    const callback = req.body?.Body?.stkCallback;
    if (!callback) return res.status(400).json({ error: 'Invalid callback' });

    const supabase = getSupabase();
    const checkoutId = callback.CheckoutRequestID;
    const resultCode = callback.ResultCode;

    const { data: txn } = await supabase
      .from('transactions')
      .select('*')
      .eq('mpesa_checkout_id', checkoutId)
      .single();

    if (!txn) return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

    if (resultCode === 0) {
      // Payment successful
      const meta = callback.CallbackMetadata?.Item || [];
      const receipt = meta.find(i => i.Name === 'MpesaReceiptNumber')?.Value;

      // Update transaction
      await supabase.from('transactions').update({
        status: 'completed',
        mpesa_receipt: receipt,
        metadata: callback,
      }).eq('id', txn.id);

      // Credit the user
      await supabase.rpc('add_credits', {
        p_user_id: txn.user_id,
        p_amount: txn.credits_bought,
      });

      // Update total spent
      await supabase.from('profiles')
        .update({ total_spent: supabase.raw(`total_spent + ${txn.amount_kes}`) })
        .eq('id', txn.user_id);

    } else {
      // Payment failed
      await supabase.from('transactions')
        .update({ status: 'failed', metadata: callback })
        .eq('id', txn.id);
    }

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    console.error('[M-Pesa Callback Error]', err.message);
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' }); // Always 200 to Safaricom
  }
});

// ── POST /api/payments/mpesa/status ──────────────────────────
router.post('/mpesa/status', requireAuth, async (req, res) => {
  try {
    const { transaction_id } = req.body;
    const supabase = getSupabase();
    const { data: txn } = await supabase
      .from('transactions')
      .select('status, credits_bought, mpesa_receipt')
      .eq('id', transaction_id)
      .eq('user_id', req.user.id)
      .single();
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });
    res.json({ success: true, status: txn.status, credits_bought: txn.credits_bought, receipt: txn.mpesa_receipt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments/stripe/create-session ─────────────────
router.post('/stripe/create-session', requireAuth, async (req, res) => {
  try {
    const { package_id } = req.body;
    if (!package_id) return res.status(400).json({ error: 'package_id is required' });

    const supabase = getSupabase();
    const { data: pkg } = await supabase.from('credit_packages').select('*').eq('id', package_id).single();
    if (!pkg) return res.status(404).json({ error: 'Package not found' });

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `WasongahAI — ${pkg.name} Pack`,
            description: `${pkg.credits} AI Credits`,
          },
          unit_amount: Math.round(pkg.price_usd * 100), // cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}?payment=cancelled`,
      metadata: {
        user_id: req.user.id,
        package_id: pkg.id,
        credits: pkg.credits,
      },
    });

    // Save pending transaction
    await supabase.from('transactions').insert({
      user_id: req.user.id,
      type: 'stripe',
      status: 'pending',
      amount_usd: pkg.price_usd,
      credits_bought: pkg.credits,
      package_id: pkg.id,
      stripe_session_id: session.id,
    });

    res.json({ success: true, checkout_url: session.url });
  } catch (err) {
    console.error('[Stripe Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/payments/stripe/webhook ────────────────────────
// Raw body required — registered before json middleware in server.js
router.post('/stripe/webhook', async (req, res) => {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const supabase = getSupabase();
    const { user_id, credits } = session.metadata;

    // Update transaction
    await supabase.from('transactions')
      .update({ status: 'completed', stripe_payment_intent: session.payment_intent })
      .eq('stripe_session_id', session.id);

    // Add credits
    await supabase.rpc('add_credits', { p_user_id: user_id, p_amount: parseInt(credits) });
  }

  res.json({ received: true });
});

module.exports = router;
