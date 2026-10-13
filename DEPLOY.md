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

## Chat features
- Saved chats, language setting and the Web toggle are stored in the user's browser (localStorage); nothing is kept on the server.
- The Web toggle uses Gemini's Google Search grounding. Gemini 3 models include 5,000 free search requests per month (shared), then $14 per 1,000 requests.
- Installable app: `public/` holds the manifest, service worker and icons.

## Image Creator
Uses Google's Nano Banana image models (paid tier). Create from text, or upload a photo to edit or restyle it. Roughly $0.03-0.04 per standard image and $0.13 per Pro image.
- `IMAGE_DAILY_BUDGET_USD` (default 3): combined daily spend across all users.
- `IMAGE_MODEL_STANDARD`, `IMAGE_MODEL_PRO`: override model names. If a model is retired, the server automatically tries the next one in its list.
- Created images can be animated: the Video tool also accepts a starting photo (image-to-video).

## Bot protection (optional, Cloudflare Turnstile)
Create a free Turnstile widget at https://dash.cloudflare.com (Turnstile), then set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` in Railway. Visitors pass a quick check once, then get a 2-hour cookie. Leave both unset to keep it off. Works when the page and API share one domain (the default).
