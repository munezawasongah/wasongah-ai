-- ================================================
--   WasongahAI — Supabase Database Schema
--   Run this entire file in your Supabase SQL editor
--   Dashboard → SQL Editor → New Query → Paste → Run
-- ================================================

-- ── Users (extends Supabase auth.users) ─────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email         TEXT NOT NULL,
  full_name     TEXT,
  avatar_url    TEXT,
  credits       INTEGER NOT NULL DEFAULT 20,  -- 20 free credits on signup
  total_spent   NUMERIC(10,2) DEFAULT 0,
  plan          TEXT NOT NULL DEFAULT 'free', -- free | pro
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Credit Packages ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.credit_packages (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,
  credits       INTEGER NOT NULL,
  price_kes     NUMERIC(10,2) NOT NULL,
  price_usd     NUMERIC(10,2) NOT NULL,
  is_popular    BOOLEAN DEFAULT false,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default packages
INSERT INTO public.credit_packages (name, credits, price_kes, price_usd, is_popular) VALUES
  ('Starter',   100,   150,  1.00, false),
  ('Basic',     300,   399,  2.99, false),
  ('Popular',   700,   799,  5.99, true),
  ('Pro',      1500,  1499, 10.99, false),
  ('Power',    3500,  2999, 21.99, false)
ON CONFLICT DO NOTHING;

-- ── Transactions ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transactions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,         -- mpesa | stripe | bonus
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | completed | failed
  amount_kes      NUMERIC(10,2),
  amount_usd      NUMERIC(10,2),
  credits_bought  INTEGER NOT NULL,
  package_id      UUID REFERENCES public.credit_packages(id),
  -- M-Pesa fields
  mpesa_checkout_id   TEXT,
  mpesa_receipt       TEXT,
  mpesa_phone         TEXT,
  -- Stripe fields
  stripe_payment_intent TEXT,
  stripe_session_id     TEXT,
  -- Meta
  metadata        JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── AI Usage Log ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.usage_logs (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  tool          TEXT NOT NULL,           -- chat | write | summarize | translate | code | image | ideas | email
  credits_used  INTEGER NOT NULL,
  tokens_in     INTEGER,
  tokens_out    INTEGER,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Chat History ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  title         TEXT DEFAULT 'New Chat',
  messages      JSONB DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Row Level Security ───────────────────────────
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions  ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only read/update their own
CREATE POLICY "Users can view own profile"   ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Transactions: users see only their own
CREATE POLICY "Users view own transactions"  ON public.transactions FOR SELECT USING (auth.uid() = user_id);

-- Usage: users see only their own
CREATE POLICY "Users view own usage"         ON public.usage_logs FOR SELECT USING (auth.uid() = user_id);

-- Chat: users see only their own
CREATE POLICY "Users view own chats"         ON public.chat_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own chats"       ON public.chat_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users insert own chats"       ON public.chat_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own chats"       ON public.chat_sessions FOR DELETE USING (auth.uid() = user_id);

-- credit_packages is public read
CREATE POLICY "Anyone can view packages"     ON public.credit_packages FOR SELECT USING (true);

-- ── Auto-create profile on signup ────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, credits)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    20
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Updated_at trigger ────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at    BEFORE UPDATE ON public.profiles    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER chats_updated_at       BEFORE UPDATE ON public.chat_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Done! Your database is ready.
SELECT 'WasongahAI database setup complete ✓' AS status;
