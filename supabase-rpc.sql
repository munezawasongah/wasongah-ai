-- ================================================
--   WasongahAI — Supabase RPC Functions
--   Run this AFTER the main schema file
-- ================================================

-- Atomic credit deduction (prevents race conditions)
CREATE OR REPLACE FUNCTION public.deduct_credits(p_user_id UUID, p_amount INTEGER)
RETURNS INTEGER AS $$
DECLARE
  current_credits INTEGER;
BEGIN
  SELECT credits INTO current_credits FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF current_credits < p_amount THEN
    RAISE EXCEPTION 'Insufficient credits: % available, % required', current_credits, p_amount;
  END IF;
  UPDATE public.profiles SET credits = credits - p_amount WHERE id = p_user_id;
  RETURN current_credits - p_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic credit addition (after payment)
CREATE OR REPLACE FUNCTION public.add_credits(p_user_id UUID, p_amount INTEGER)
RETURNS INTEGER AS $$
DECLARE
  new_credits INTEGER;
BEGIN
  UPDATE public.profiles SET credits = credits + p_amount WHERE id = p_user_id
  RETURNING credits INTO new_credits;
  RETURN new_credits;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT 'RPC functions created ✓' AS status;
