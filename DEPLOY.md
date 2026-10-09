# WasongahAI — Complete Deployment Guide
## From zero to live, monetized AI platform

---

## What's in this package

```
wasongah-ai/
├── src/
│   ├── server.js          ← Main Express app
│   ├── anthropic.js       ← Anthropic client
│   ├── supabase.js        ← Supabase client
│   └── credits.js         ← Credit deduction logic
├── routes/
│   ├── auth.js            ← Signup, login, logout, forgot password
│   ├── chat.js            ← Streaming chat with credit deduction
│   ├── tools.js           ← All 8 AI tools
│   ├── stream.js          ← Word-by-word streaming
│   ├── payments.js        ← M-Pesa STK Push + Stripe
│   └── user.js            ← Profile, usage history, transactions
├── middleware/
│   ├── auth.js            ← JWT validation + credit guard
│   ├── rateLimiter.js
│   └── errorHandler.js
├── supabase-schema.sql    ← Run this FIRST in Supabase
├── supabase-rpc.sql       ← Run this SECOND in Supabase
├── frontend.html          ← Complete frontend
├── package.json
├── .env.example
└── DEPLOY.md              ← This file
```

---

## STEP 1 — Supabase (Database + Auth)

**1.1 Create project**
- Go to https://supabase.com → New Project
- Name it: `wasongah-ai`
- Choose region: `East Africa (Nairobi)` if available, else `EU West`
- Set a strong database password (save it!)

**1.2 Run database schema**
- Dashboard → SQL Editor → New Query
- Paste contents of `supabase-schema.sql` → Run
- Paste contents of `supabase-rpc.sql` → Run
- You should see: `WasongahAI database setup complete ✓`

**1.3 Enable email auth**
- Dashboard → Authentication → Providers → Email → Enable
- Optionally: turn off "Confirm email" for easier testing

**1.4 Get your keys**
- Dashboard → Settings → API
- Copy: `Project URL` → goes into `SUPABASE_URL`
- Copy: `service_role` key → goes into `SUPABASE_SERVICE_KEY`

---

## STEP 2 — Stripe (Card Payments)

**2.1 Create account**
- Go to https://dashboard.stripe.com → Sign up
- Complete business verification (use your business name)

**2.2 Get API keys**
- Dashboard → Developers → API Keys
- Copy `Secret key` (starts with `sk_test_...` for test mode)
- → goes into `STRIPE_SECRET_KEY`

**2.3 Set up webhook (after Railway deploy)**
- Dashboard → Developers → Webhooks → Add endpoint
- URL: `https://your-backend.railway.app/api/payments/stripe/webhook`
- Events to listen for: `checkout.session.completed`
- Copy the webhook signing secret → goes into `STRIPE_WEBHOOK_SECRET`

---

## STEP 3 — M-Pesa Daraja

**3.1 Create developer account**
- Go to https://developer.safaricom.co.ke
- Sign up → Create App → Select "Lipa Na M-Pesa Sandbox"

**3.2 Get sandbox credentials**
- Copy Consumer Key → `MPESA_CONSUMER_KEY`
- Copy Consumer Secret → `MPESA_CONSUMER_SECRET`
- Shortcode: `174379` (sandbox default)
- Passkey: Get from Daraja portal → `MPESA_PASSKEY`

**3.3 Going live (production)**
- Apply for go-live on Daraja portal
- Replace sandbox credentials with production ones
- Change `MPESA_ENV=production` in Railway
- Update `MPESA_SHORTCODE` to your real paybill/till

---

## STEP 4 — Anthropic API Key

- Go to https://console.anthropic.com
- Sign up → API Keys → Create Key
- Copy key (starts with `sk-ant-...`) → `ANTHROPIC_API_KEY`
- Add billing: Settings → Billing → Add payment method

---

## STEP 5 — Deploy Backend to Railway

**5.1 Push to GitHub**
```bash
cd wasongah-ai
git init
git add .
git commit -m "WasongahAI backend"
git remote add origin https://github.com/YOUR_USERNAME/wasongah-ai.git
git push -u origin main
```

**5.2 Deploy on Railway**
- Go to https://railway.app → New Project → Deploy from GitHub
- Select `wasongah-ai` repo
- Railway auto-detects Node.js ✓

**5.3 Add ALL environment variables on Railway**

Go to your project → Variables → Add these one by one:

```
ANTHROPIC_API_KEY        = sk-ant-your-key
SUPABASE_URL             = https://your-project.supabase.co
SUPABASE_SERVICE_KEY     = your-service-role-key
JWT_SECRET               = make-this-32+-random-characters
STRIPE_SECRET_KEY        = sk_test_your-stripe-key
STRIPE_WEBHOOK_SECRET    = whsec_your-webhook-secret
MPESA_CONSUMER_KEY       = your-mpesa-consumer-key
MPESA_CONSUMER_SECRET    = your-mpesa-consumer-secret
MPESA_SHORTCODE          = 174379
MPESA_PASSKEY            = your-mpesa-passkey
MPESA_ENV                = sandbox
NODE_ENV                 = production
FRONTEND_URL             = *
RATE_LIMIT_PER_MINUTE    = 60
MAX_TOKENS               = 1500
CREDITS_PER_CHAT         = 2
CREDITS_PER_TOOL         = 3
CREDITS_PER_IMAGE        = 5
```

**5.4 Get your Railway URL**
- Railway → Settings → Domains → Generate Domain
- Copy URL e.g. `https://wasongah-ai-production.up.railway.app`

**5.5 Update M-Pesa callback**
```
MPESA_CALLBACK_URL = https://wasongah-ai-production.up.railway.app/api/payments/mpesa/callback
```

---

## STEP 6 — Deploy Frontend to Vercel

**6.1 Update backend URL in frontend.html**
Open `frontend.html` and find this line near the top of the script:
```javascript
const BACKEND = localStorage.getItem('wasongah_backend') || 'https://YOUR-RAILWAY-URL.up.railway.app';
```
Replace with your actual Railway URL.

**6.2 Deploy to Vercel**
- Go to https://vercel.com → Add New → Project
- Drag and drop `frontend.html` OR connect your GitHub repo
- Vercel gives you a URL like `https://wasongah-ai.vercel.app`

**6.3 Update CORS**
Back in Railway → Variables:
```
FRONTEND_URL = https://wasongah-ai.vercel.app
```

---

## STEP 7 — Final Checks

Test each of these URLs in your browser or Postman:

```bash
# 1. Health check
GET https://your-backend.railway.app/api/health

# 2. Signup
POST https://your-backend.railway.app/api/auth/signup
{"email":"test@test.com","password":"123456","full_name":"Test User"}

# 3. Login
POST https://your-backend.railway.app/api/auth/login
{"email":"test@test.com","password":"123456"}

# 4. Get packages (no auth needed)
GET https://your-backend.railway.app/api/payments/packages

# 5. Test a tool (needs auth token)
POST https://your-backend.railway.app/api/tools/translate
Headers: Authorization: Bearer YOUR_TOKEN
{"text":"Hello world","from":"English","to":"Swahili"}
```

---

## How the Credit System Works

| Event | Credits |
|---|---|
| New signup | +20 free credits |
| Chat message | -2 credits |
| Writer / Summarize / Translate / Code / Ideas / Email | -3 credits |
| Image analysis | -5 credits |

### Credit Packages (edit in Supabase → credit_packages table)

| Package | Credits | KES | USD |
|---|---|---|---|
| Starter | 100 | 150 | 1.00 |
| Basic | 300 | 399 | 2.99 |
| Popular | 700 | 799 | 5.99 |
| Pro | 1,500 | 1,499 | 10.99 |
| Power | 3,500 | 2,999 | 21.99 |

To change prices: Supabase Dashboard → Table Editor → credit_packages → Edit rows

---

## Revenue Projection

At KES 799 for 700 credits (most popular pack):

| Monthly Users | Avg Spend | Monthly Revenue |
|---|---|---|
| 50 | KES 400 | KES 20,000 |
| 200 | KES 400 | KES 80,000 |
| 500 | KES 600 | KES 300,000 |

Your Anthropic API cost at 500 active users ≈ KES 8,000–15,000/month
**Net margin: ~70–80%**

---

## Monitoring & Admin

### View all users
Supabase → Table Editor → profiles

### View all transactions
Supabase → Table Editor → transactions

### View usage patterns
Supabase → Table Editor → usage_logs

### Manually add credits to a user
Supabase → SQL Editor:
```sql
SELECT add_credits('USER_UUID_HERE', 100);
```

### Railway logs
Railway → Your project → Deployments → View Logs

---

## Next Steps After Launch

1. **Custom domain** — Railway Settings → Custom Domain → point your domain
2. **Email notifications** — Add Resend.com for payment receipts
3. **Admin dashboard** — Build a simple admin panel to manage users
4. **Referral system** — Give users 20 credits for each referral
5. **Google/Facebook login** — Enable in Supabase Auth → Providers
6. **Mobile app** — Wrap the frontend in Capacitor for iOS/Android
