# Socialix frontend

Next.js/React UI only, running on port 3000. Python FastAPI owns authentication, data,
integrations and all agent execution on port 8005. No Next.js API handlers or Node agent worker remain.

## Run

```powershell
npm install
# Configure .env using .env.example.
npm run dev
```

Production: `npm run build`, then `npm run start`.

Set NEXT_PUBLIC_API_BASE_URL=http://localhost:8005.
Never put shared service keys, database credentials or OAuth secrets in frontend environment files or source.
See ../backend/README.md for backend startup.

Google login uses the Python API and HttpOnly sessions. The existing
/api/auth/callback/google URL is a Next.js rewrite to the Python backend, not a TypeScript auth handler.
The UI sends credentialed API requests and CSRF tokens for mutations.
You must sign in again after migration.

The browser polls workflow progress but does not execute agent steps.
The Python backend runs its worker so plans keep progressing with the browser closed.

After Google sign-in, each user verifies a Meta Ad Account ID and access token in Settings. The token
is sent only to the backend and stored encrypted. The `/ads` screen is the
separate Meta paid-ad workspace. It creates reviewed drafts,
creates remote campaigns paused, requires explicit activation, and displays synchronized performance
recommendations. AI-guided setup fills the same editable form used by manual setup, and Custom Audiences
can be selected for retargeting. It does not use the Zernio integration.
