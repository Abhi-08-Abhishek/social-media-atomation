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

In a second terminal, from this directory:

```powershell
.venv/Scripts/python.exe -m app.worker
```

Start the frontend separately with `npm run dev` from ../frontend.
API: http://localhost:8005. UI: http://localhost:3000.
Use `python -m app` on Windows: it selects the event loop required by psycopg.
The HTTP server does not run the queue; the Python worker must remain running.

## Configuration and safety

Keep database, OAuth, model, storage and encryption secrets in backend/.env only.
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

## Database and durable execution

SQLAlchemy Core reflects the 12 existing PostgreSQL tables; startup does not recreate or migrate them.
LangGraph orchestrates Python agents. AgentTask records store completed stages and research query/search
checkpoints; PostgreSQL leases and heartbeats protect worker execution. This is application-level
checkpointing, not LangGraph's native PostgresSaver. Failed plans require an explicit retry.
The browser only polls progress. Recommendations create another plan only after user approval.

The Alembic baseline in migrations/ is for an EMPTY public-schema database.
For an existing database, back it up and verify its schema before stamping the baseline:
`alembic stamp 001_baseline`. Do not run the baseline upgrade against existing tables.
No destructive database migration or backup-restoration test was performed during this cutover.

## Content and media

Pydantic validates model outputs, evidence, API inputs and quality reviews.
SenseNova and Tavily remain external providers with their own cost and availability.
Images and 4-7 slide carousels use Pillow editorial templates; 3-5 scene Reels use
English Windows speech (pyttsx3) and FFmpeg/ffprobe. ImageKit stores finished media.
These are text-led editorial visuals, not cinematic generated footage or premium narration.
One rendering job runs at a time per process; use one worker on this local host.
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
a SenseNova synthesis timeout. A later saved-checkpoint run passed with four verified quotes, but
another run still timed out during quote correction despite the bounded-output improvements.
Live research reliability remains unresolved. A database-backed, rolled-back integration check
passed the complete six-agent path and recommendation approval with mocked providers. Live Zernio
account lookup and an existing post's analytics lookup passed (the post is still scheduled).
Full Google callback,
ImageKit upload and real publishing were not exercised.
The old TypeScript backend recovery archive was also removed; no local rollback archive remains.
