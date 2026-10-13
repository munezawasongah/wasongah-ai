# Deploy (Railway)

Required environment variable:
- `GEMINI_API_KEY` (create one free at https://aistudio.google.com/apikey)

Optional:
- `GEMINI_MODEL` (default `gemini-3.8-flash`)
- `FRONTEND_URL` (default `*`)
- `MAX_TOKENS` (default 4096)

No Supabase, Stripe or Anthropic configuration is needed. The app is open to everyone with no sign-in and no rate limit.

## Video generation
Uses Google Veo through the Gemini API. This needs billing enabled on the Google Cloud project behind `GEMINI_API_KEY` (no free tier for video).
- `VIDEO_DAILY_BUDGET_USD` (default 10): combined estimated spend per day across all users; once reached, new videos are refused until the next UTC day (or a restart).
- `VEO_MODEL_LITE`, `VEO_MODEL_FAST`, `VEO_MODEL_STANDARD`: override model names if Google renames them.
