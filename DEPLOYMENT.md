# Sentilytics Deployment

## Recommended Free Setup

Use Render as a single full-stack web service. The Express backend serves `/api/*` and the built Vite frontend from the same domain, so there is no frontend/backend CORS split to manage.

## Render Steps

1. Go to Render and create a new Blueprint or Web Service from the GitHub repository.
2. If using the blueprint, Render reads `render.yaml`.
3. Set these environment variables in Render:
   - `MONGODB_URI`
   - `YOUTUBE_API_KEY`
   - `RESEND_API_KEY`
   - `RESEND_FROM_EMAIL`
   - `JWT_SECRET` if Render does not generate it automatically
4. Use:
   - Build command: `npm ci && npm run build`
   - Start command: `npm start`
   - Health check path: `/api/health`

## Email Notes

Render free web services do not support outbound SMTP ports like `587`, so Gmail SMTP is not reliable there. Use Resend with `RESEND_API_KEY` for OTP emails.

## Security Notes

Do not commit `.env` or `.env.example`. Rotate any database or API credentials that were ever pushed to GitHub, then use the rotated values only in Render environment variables.
