# Production environment and deployment

The application keeps its existing architecture: React/Vite uses Supabase Auth
directly; FastAPI validates Supabase bearer tokens with the public anon key and
stores user/trip data in MongoDB. Supabase database/RLS and a Supabase service
role key are not used by this application. Never put a service-role/secret key
in a `VITE_` variable or frontend hosting settings.

Use the root `.env.example` as a variable-name template for local development.
It contains placeholders only. Copy it to `.env`, replace the values locally,
and keep `.env` out of version control.

## Local development

Run the backend from the repository root in one terminal:

```powershell
& "C:\Program Files\Python312\python.exe" -m uvicorn main:app --host 127.0.0.1 --port 8001
```

Run the frontend from `frontend` in a second terminal:

```powershell
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

The Vite development proxy sends `/health`, `/api/v1`, and `/plan` to port
`8001`. This workspace uses that port because an existing process on port
`8000` does not serve the current repository's health endpoints. Once that
process is safely stopped, the proxy target may be changed back to `8000`.

## Supabase project

1. Create a Supabase project and choose its region and a strong database
   password. The Supabase Postgres database is not used by this application.
2. In **Project Settings → API** (or **Project Settings → API Keys** in the
   current dashboard), copy the project URL and the public `anon`/publishable
   key. Do not copy the `service_role`/secret key.
3. Set the URL as both frontend `VITE_SUPABASE_URL` and backend
   `SUPABASE_URL`. Set the same public key as frontend
   `VITE_SUPABASE_ANON_KEY` and backend `SUPABASE_ANON_KEY`. The backend accepts
   `VITE_SUPABASE_ANON_KEY` as a legacy fallback, but use the backend-specific
   variable in hosting settings.
4. In **Authentication → URL Configuration**, add local URLs
   (`http://localhost:5173`, `http://127.0.0.1:5173`) and the eventual Vercel
   deployment/custom domain to **Site URL** and **Redirect URLs** as applicable.
   The app sends password reset links to `/forgot-password`. Email-confirmation
   behavior is controlled by Supabase Auth settings.
5. Enable Email auth in **Authentication → Providers → Email**. Set up SMTP
   before launch if production registration/confirmation emails are required.

The frontend stores and refreshes the Supabase session. Registration uses
email/password and stores the name as user metadata; when email confirmation is
required it displays a confirmation notice instead of treating registration as
a completed sign-in. Login/logout use Supabase Auth. Protected routes redirect
to login with a safe local `next` path. Profile loading and protected API
operations also require the backend and MongoDB to be available.

## MongoDB Atlas

1. Create an Atlas organization/project and a cluster in a region appropriate
   for the backend. Keep automated backups and production access controls
   enabled as appropriate for your plan.
2. In **Database Access**, create a dedicated application database user with a
   strong, unique password. Grant only the permissions needed for the
   application database (read/write on `pack_go`); do not use an Atlas account
   owner credential.
3. In **Network Access**, allow the backend host's outbound IP addresses. For
   Render, use a static outbound IP plan/add-on if required to maintain a
   narrow allowlist. Avoid `0.0.0.0/0` for production; if you use it temporarily
   for diagnosis, remove it immediately.
4. In **Database → Connect → Drivers**, choose the Python driver and copy the
   SRV connection URI. Replace the username/password placeholders and URL
   encode reserved characters in the password. Select/create the `pack_go`
   database (the application creates its collections and indexes; it does not
   drop or migrate existing collections).
5. Keep the URI only in backend environment settings as `MONGODB_URI` and set
   `MONGODB_DATABASE=pack_go`. The backend pings Atlas and creates/ensures
   indexes for `users`, `trips`, `trip_messages`, `notifications`, `expenses`,
   `journal_entries`, and `knowledge_sources`.

`GET /health` checks that the process is up. `GET /health/ready` attempts a
MongoDB ping and returns 503 with a sanitized configuration/connectivity message
when MongoDB is unavailable. Do not include a connection URI in diagnostics or
support reports.

## Backend hosting (Render)

Create a **Web Service** from the GitHub repository:

- Root directory: repository root (`.`).
- Runtime: Python; use Python 3.12 (also the repository's declared minimum).
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Health check path: `/health/ready`
- Set `PACK_GO_ALLOWED_ORIGINS` to the exact deployed frontend origin(s), with
  no trailing slash; comma-separate preview/custom origins only if they are
  intentionally allowed. Do not use `*` with credentialed requests.

Set these backend environment variables in Render (never in Vercel):

| Variable | Required/use |
|---|---|
| `SUPABASE_URL` | Required for bearer-token verification |
| `SUPABASE_ANON_KEY` | Required; public anon/publishable key used for token verification |
| `MONGODB_URI` | Required; private Atlas connection URI |
| `MONGODB_DATABASE` | Required; normally `pack_go` |
| `PACK_GO_ALLOWED_ORIGINS` | Required in production; actual Vercel origin(s) |
| `GROQ_API_KEY` | AI itinerary/chat primary provider |
| `GOOGLE_API_KEY` | AI provider fallback |
| `TAVILY_API_KEY` | Set if the configured research workflow needs Tavily |
| `OPENWEATHERMAP_API_KEY` | Set for live weather integration |
| `EXCHANGE_RATE_API_KEY` | Set for live currency conversion |

Provider keys are optional for the service to start, but corresponding features
may fall back or be unavailable without them. Never configure
`SUPABASE_SERVICE_ROLE_KEY`; the current code does not need it. Do not enable
Render pre-deploy commands that clear, recreate, or migrate production data.

### Persistent RAG and uploaded knowledge (optional)

ChromaDB indexes and uploaded knowledge PDFs are local files, not MongoDB
collections. Render's filesystem is ephemeral unless a persistent disk is
attached. To preserve these features across deploys/restarts, attach a Render
disk mounted at `/var/data` (this requires a plan that supports persistent
disks) and set:

- `CHROMA_PERSIST_DIRECTORY=/var/data/chroma_db` — used by both knowledge
  retrieval and long-term trip-preference memory.
- `RAG_STORAGE_DIRECTORY=/var/data/knowledge_storage` — uploaded PDF files.

Without the disk, the core app can still run, but local vector indexes,
preference memory, and uploaded PDFs may be lost on restart or redeploy. The
ignored local `chroma_db` directory is not deployed or copied to Atlas. Back
up and intentionally re-import existing knowledge content rather than
overwriting a production index.

## Frontend hosting (Vercel)

Import the GitHub repository in Vercel and set **Root Directory** to
`frontend`. Framework preset: **Vite**; build command `npm run build`; output
directory `dist`; install command `npm install`. `frontend/vercel.json` already
rewrites client-side routes to `/index.html`, preserving direct navigation and
refresh on paths such as `/trips` and `/offline-vault`.

Set the following for each Vercel environment that should work (Production,
Preview, Development):

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Public anon/publishable key only |
| `VITE_API_BASE_URL` | Backend origin only, e.g. `https://<render-service>.onrender.com`; no `/api/v1` suffix |

The empty `VITE_API_BASE_URL` is for local development only: Vite proxies
`/health`, `/api/v1`, and `/plan` to `http://127.0.0.1:8001` (see Local
development above). The deployed backend must be reachable over HTTPS. Vercel
variables prefixed with `VITE_` are bundled into public frontend assets; never
set server secrets there.

The production app keeps its service worker, manifest, static-asset caching,
and IndexedDB offline vault. The service worker does not cache API/auth
requests. Ensure Vercel serves `/sw.js` and `/manifest.webmanifest` as static
public files and do not add a blanket cache rule for authenticated API data.

## Deployment order and GitHub steps

1. Configure Supabase and Atlas using the steps above; verify Atlas permits the
   backend's outbound IP.
2. Push the reviewed repository changes to a GitHub branch only after approval.
   In Vercel, import the repository with root directory `frontend` and deploy
   the frontend. No deployment or Git operation is performed by this guide.
3. Copy the assigned Vercel production origin into Supabase Auth URL settings
   and Render `PACK_GO_ALLOWED_ORIGINS`.
4. Create the Render Web Service from the same GitHub repository, enter the
   commands above, and add the backend variables. Set the chosen runtime/plan
   intentionally; do not accept unexpected paid-resource defaults.
5. Copy the Render HTTPS origin into Vercel `VITE_API_BASE_URL`, redeploy the
   frontend, then check Render `/health/ready`, Vercel deep-link refreshes, and
   browser Network/Console for CORS/API errors.
6. Register a test account, confirm email if enabled, verify a protected
   profile/trip request, create/read/update/delete a test trip, then sign out.
   Delete only the test trip through the app when done; do not reset or drop
   Atlas data.

The `scripts/create_admin.py` operator script grants admin access to an
existing Supabase Auth UUID supplied as `SUPABASE_USER_ID`. Run it only against
the intended backend/database and only when you deliberately need an admin.
