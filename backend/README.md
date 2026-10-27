# Socialix Python backend

All application backend logic lives here: Google OAuth and sessions, PostgreSQL access, campaign/post APIs, encrypted user credentials, research, content and media generation, agent orchestration, scheduling, analytics and recommendations. The frontend contains UI and HTTP clients only.

## Run locally (PowerShell)

From this directory:

```powershell
python -m venv .venv
.venv/Scripts/python.exe -m pip install -e .
# Configure .env using .env.example. Keep existing encryption keys unchanged.
.venv/Scripts/python.exe -m app
```

This applies pending safe database migrations, then starts both the API and background worker.
Start the frontend separately with `npm run dev` from ../frontend.
API: http://localhost:8005. UI: http://localhost:3000.
Use `python -m app` on Windows: it selects the event loop required by psycopg.

## Configuration and safety

Keep shared server configuration, database, Google OAuth, model, storage and encryption secrets in backend/.env only.
Existing user-bound AES-GCM credentials and database IDs are preserved.
Never change CREDENTIAL_ENCRYPTION_KEY without re-encrypting saved keys.
SESSION_SECRET must be a stable random secret of at least 32 characters.
Users sign in again after migration; old NextAuth sessions are not reused.
The frontend proxies the existing Google callback
http://localhost:3000/api/auth/callback/google to FastAPI; register that exact URL in Google.
Use HTTPS, COOKIE_SECURE=true and matching origins/callbacks for deployment.

PUBLISHING_ENABLED defaults to false. It blocks external scheduling, rescheduling and cancellation writes.
Enable it only after checking connected accounts and reviewing drafts.
Scheduling preserves stable idempotency keys across ambiguous failures. Changed requests or attempts
older than 23 hours require reconciliation; do not blindly resubmit them.
Legacy unresolved attempts with incompatible request fingerprints also require reconciliation.

## Meta Ads (separate from Zernio)

Meta paid ads use their own API module, database tables, routes, UI, analytics sync,
recommendations and audit log. They do not read or write Zernio credentials, organic campaigns,
posts or metrics.

Each signed-in user enters one Meta Ad Account ID and a user or system-user access token in Settings.
The backend verifies that the token can read that exact account, encrypts it for the user, and never
returns it. The token must have `ads_read`, `ads_management`, `pages_show_list` and
`pages_read_engagement`; Meta app review and Business permissions may still be required. Replacing the
connection replaces only that user's encrypted token. There is no Meta callback or shared Meta secret.

The `/ads` workspace includes AI-guided campaign planning when the `GROQ_*` settings are
configured. Generation creates an editable preview only. Retargeting lists Custom Audiences that the
connected token can access; audience IDs, Pages and Pixels are revalidated before a local draft is saved.

Keep `META_ADS_WRITES_ENABLED=false` while testing connection, accounts and assets. Set it to `true`
only when ready to create remote campaigns; all remote objects are created paused. Keep
`META_ADS_ACTIVATION_ENABLED=false` until activation and budget settings have been reviewed. Pausing
an existing campaign remains available as a safety action. The bundled worker synchronizes Meta
Insights and creates evidence-based recommendations; approving a recommendation records the decision
and executes only the action shown to the user. Currently, the only executable recommendation is pausing
a weak ad; all other recommendation approvals are recorded for manual follow-up.

## Database and durable execution

Startup upgrades the database to the current Alembic revision before the API and worker begin. An
empty database receives the baseline; an older untracked database is adopted only when every expected
baseline table exists. Partial schemas fail safely. Startup never runs a downgrade or deletes tables.
LangGraph orchestrates Python agents. AgentTask records store completed stages and research query/search
checkpoints; PostgreSQL leases and heartbeats protect worker execution. This is application-level
checkpointing, not LangGraph's native PostgresSaver. Failed plans require an explicit retry.
The browser only polls progress. Recommendations create another plan only after user approval.

The Alembic baseline in migrations/ supports an empty database and validates complete legacy schemas.
No destructive database migration or backup-restoration test was performed during this cutover.

## Content and media

Pydantic validates model outputs, evidence, API inputs and quality reviews.
Groq is the primary text provider, with SenseNova as its configured fallback. Cloudflare Workers AI
generates media, and Tavily provides research search; each remains an external dependency.
Cloudflare generates images and 4-7 slide carousels. Reels use Cloudflare scene art,
English Windows speech (pyttsx3) and FFmpeg/ffprobe. ImageKit stores finished media.
One rendering job runs at a time in the bundled local worker.
Carousels and Reels always require review. Missing media/review failures preserve drafts for review.

Research requests use streamed model output with low reasoning effort and explicit provider token
limits (1024 for query planning, 4096 for evidence synthesis, including reasoning). Evidence reports
are limited to four claims; exact-quote validation and a bounded correction attempt remain mandatory.
Logs record per-attempt duration, first response/answer timing and completion reason, not prompts,
credentials or model reasoning. Partial or token-truncated responses are never accepted.

## Verification history

Test suites and one-off migration/check scripts were removed at the user's request after cutover.
Their recovery archive was subsequently removed at the user's request.
Cutover verification: 19 Python tests, 9 frontend tests, frontend production build, database contracts,
Google authorization redirect, and local carousel/narrated Reel rendering passed. The live research
check reached Tavily but encountered invalid model evidence; a subsequent bounded-repair test hit
a previous-provider synthesis timeout. A later saved-checkpoint run passed with four verified quotes, but
another run still timed out during quote correction despite the bounded-output improvements.
Live research reliability remains unresolved. A database-backed, rolled-back integration check
passed the complete six-agent path and recommendation approval with mocked providers. Live Zernio
account lookup and an existing post's analytics lookup passed (the post is still scheduled).
Full Google callback,
ImageKit upload and real publishing were not exercised.
The old TypeScript backend recovery archive was also removed; no local rollback archive remains.
