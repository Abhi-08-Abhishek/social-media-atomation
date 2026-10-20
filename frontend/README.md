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
Never put service keys, database credentials or OAuth secrets in this directory.
See ../backend/README.md for API and worker startup.

Google login uses the Python API and HttpOnly sessions. The existing
/api/auth/callback/google URL is a Next.js rewrite to the Python backend, not a TypeScript auth handler.
The UI sends credentialed API requests and CSRF tokens for mutations.
You must sign in again after migration.

The browser polls workflow progress but does not execute agent steps.
Keep the separate Python worker running to progress plans with the browser closed.
