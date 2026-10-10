# Grevix AI TripWeaver â€” AI-Powered Collaborative Travel Planning

> **Plan less. Travel more.** Grevix AI TripWeaver is the hackathon submission
> built around an AI-assisted travel-planning experience: itinerary planning,
> trip organization, group collaboration, travel utilities, and retrieval-augmented
> travel knowledge. It is derived from the author's existing PACK & GO project;
> the event-period changes are documented separately and must be verified before submission.

-   **Hackathon repository:** https://github.com/patilshrutika1803/Grevix_AITripWeaver
-   **Original college-project repository:** https://github.com/patilshrutika1803/Pack-Go (preserved separately)
-   **Author:** Shrutika Patil
-   **Local frontend:** http://localhost:5173
-   **Local API docs:** http://127.0.0.1:8000/docs
-   **Previous deployment targets:** https://pack-go-cyan.vercel.app (frontend) and https://pack-go.onrender.com (backend); these are from the original PACK & GO project and are not confirmed as deployments of this hackathon repository.

> **Status disclaimer:** These are the project's documented deployment
> targets, not a guarantee that every live workflow is healthy. The
> latest recorded audit found MongoDB connectivity and backend
> test-suite blockers. See [Verification
> Status](#16-verification-status-and-known-limitations).

## Grevix AfterCode Submission

- **Event:** Grevix AfterCode
- **Submission repository:** `Grevix_AITripWeaver`
- **Participant:** Shrutika Patil
- **Assessment format:** 8-hour build window; submit the GitHub repository URL.
- **Problem selection:** The organizer's guidelines state there is no fixed problem statement or mandatory technology stack. This README describes the team's self-selected travel-planning problem; it is **not** an official organizer-issued problem statement.
- **Development policy:** AI-assisted development and existing libraries/frameworks/APIs are allowed. The guidelines also state that the project must be developed during the official event period and that participants must not claim someone else's work as their own. This repository is based on the author's existing PACK & GO college project; disclose that reuse and identify event-period changes accurately. Do not imply that the entire codebase was created from scratch during the event.
- **Challenge-card readiness:** The initial idea may need to change after an unexpected Challenge Card. Keep a dated development log of actual decisions and changes.

### Self-selected problem statement

Travel planning is fragmented across destination research, itinerary creation, budget estimation, weather checks, and group coordination. Grevix AI TripWeaver aims to bring these steps into one AI-assisted experience, with saved trips, collaborative planning, and travel knowledge retrieval. The exact event-period scope should be limited to features that are implemented and tested in this repository.

### Event-period change log

Add only real changes made during the official event. Example template:

| Time / checkpoint | Change made | Evidence |
|---|---|---|
| Initial setup | Cloned and inspected the existing project; verified frontend build and tests | Build/test output |
| Implementation | _Fill in the actual feature implemented during the event_ | _Commit / test / screenshot_ |
| Final verification | _Fill in actual checks performed_ | _Test output / demo_ |

> **Current verification snapshot (local, 11 Oct 2026):** frontend production build succeeded with a non-blocking large-chunk warning; frontend tests passed (9/9); `pip check` reported no broken requirements; importing `main` succeeded; `GET /docs` returned HTTP 200. The browser displayed a blank page during one local run, so the frontend's end-to-end rendering is **not yet verified**. MongoDB connectivity and live external-service workflows have not been confirmed in this session. Update this snapshot after fixing and retesting.

## Table of Contents

1.  [Problem Statement](#1-problem-statement)
2.  [Proposed Solution](#2-proposed-solution)
3.  [Goals and Scope](#3-goals-and-scope)
4.  [Features](#4-features)
5.  [Architecture](#5-architecture)
6.  [Technology Stack](#6-technology-stack)
7.  [Repository Structure](#7-repository-structure)
8.  [Main Workflows](#8-main-workflows)
9.  [Local Setup](#9-local-setup)
10. [Environment Variables](#10-environment-variables)
11. [Run Locally](#11-run-locally)
12. [API Overview](#12-api-overview)
13. [Deployment](#13-deployment)
14. [Testing](#14-testing)
15. [Security](#15-security)
16. [Verification Status and Known
    Limitations](#16-verification-status-and-known-limitations)
17. [Troubleshooting](#17-troubleshooting)
18. [Development Workflow](#18-development-workflow)
19. [Future Improvements](#19-future-improvements)

------------------------------------------------------------------------

## 1. Problem Statement

Planning a trip often means switching between different services to
research destinations, build an itinerary, estimate costs, check weather
and currency, coordinate with companions, and keep documents and
memories organized. Group trips make this harder: participants need to
share information, discuss alternatives, vote on proposals, manage
expenses, and keep plans aligned as details change.

Travel knowledge can also be fragmented across websites and documents.
Generic AI answers may not be grounded in a user's available reference
material, and useful information can be difficult to find again.

**PACK & GO aims to solve this fragmentation by combining AI-powered
trip planning, saved itineraries, group coordination, travel utilities,
and a retrieval-augmented knowledge experience in one platform.**

### Main problems addressed

-   Fragmented trip research and planning.
-   Time-consuming day-by-day itinerary creation.
-   Coordination between multiple travellers.
-   Shared visibility into proposals, decisions, expenses, and trip
    messages.
-   Keeping checklists, journal entries, and trip information together.
-   Accessing practical weather, currency, place, map, and route
    information.
-   Searching ingested knowledge documents and retrieving relevant
    content.

## 2. Proposed Solution

PACK & GO is a full-stack web application with a React/Vite frontend and
FastAPI backend. The backend exposes REST APIs, coordinates AI planning
workflows, persists application data in MongoDB, integrates Supabase
authentication, and provides a RAG pipeline backed by vector storage.

The intended user journey is: describe a trip, review an AI-generated
itinerary, save and organize it, collaborate with travel companions, and
use trip utilities and knowledge features as needed.

## 3. Goals and Scope

### In scope

-   Natural-language trip planning with normal and streaming endpoints.
-   Trip creation, listing, retrieval, update, deletion, and day
    regeneration.
-   User profile and preference management.
-   Group trips, invitations, membership, workspace, messages,
    proposals, votes, and decisions.
-   Expense tracking and summaries.
-   Travel journal entries and statistics.
-   Checklists and notifications.
-   Weather, currency, places, maps, packing lists, and route
    optimization.
-   Constraint-based and genetic-algorithm itinerary optimization.
-   Knowledge document ingestion, re-indexing, retrieval, and question
    answering.
-   Supabase authentication integration and role/access checks.
-   Vercel frontend and Render-compatible backend deployment.

> The API and code structure describe intended functionality. Not every
> feature has been verified against live services. Consult the
> verification section before claiming production readiness.

## 4. Features

### AI trip planning

-   Accepts a natural-language planning request.
-   Uses agent/workflow modules to build a plan.
-   `POST /plan` provides synchronous planning.
-   `POST /plan/stream` provides streaming planning.
-   Persists plans through the trip service and returns a saved trip
    identifier.
-   Includes CSP-style and genetic-algorithm itinerary optimization
    routes.

### Trip management

-   Create, list, retrieve, update, and delete trips.
-   Regenerate an itinerary day.
-   Associate trips with an authenticated user or authorized group.
-   Retrieve saved trip data, subject to working database connectivity.

### User profile and preferences

-   Retrieve the current user profile.
-   Read and update planning preferences.
-   Use Supabase identity/session integration for protected requests.

### Group travel and collaboration

-   Convert a trip into a group trip.
-   Retrieve a workspace and member list.
-   Update roles, remove members, leave a group, or transfer ownership.
-   Create, list, preview, accept, and revoke invitations.
-   Create proposals, vote, view results, finalize decisions, and
    apply/replan from decisions.
-   Send, retrieve, update, and delete messages.
-   Retrieve and manage notifications and unread counts.

Invitation and collaboration workflows require a running backend,
reachable database, valid authentication, and appropriate permissions.

### Expenses, journal, and checklists

-   Create/list/update/delete expenses and view summaries.
-   Create/list/update/delete journal entries and view journal
    statistics.
-   Add, update, complete, reopen, and delete checklist items.
-   Retrieve packing-list data for a trip.

### Travel utilities

-   Weather lookup.
-   Currency conversion.
-   Place search.
-   Trip map and route-location retrieval.
-   Route optimization.
-   Itinerary optimization using CSP and GA approaches.

Provider availability depends on environment configuration, API keys,
rate limits, and network access.

### RAG knowledge features

-   Admin document upload, listing, detail, deletion, and re-indexing.
-   User-facing knowledge source listing and question answering.
-   Document ingestion and chunking, embeddings, vector search, and
    source metadata.
-   ChromaDB-backed vector collections, depending on configured storage.

RAG results depend on actual ingested documents, embedding
configuration, collection consistency, and durable vector storage.

### Admin

-   Admin overview/analytics endpoint.
-   Administrative knowledge-document operations.
-   Administrative endpoints must remain restricted to authorized users.

## 5. Architecture

``` text
Browser
  |
  v
React + Vite frontend (Vercel)
  | HTTPS / JSON / session token
  v
FastAPI backend (Render-compatible)
  |-- API routers and Pydantic schemas
  |-- Services and business logic
  |-- AI agents / LangGraph workflows
  |-- Trip, collaboration, journal, expense, utility APIs
  |
  +--> MongoDB Atlas: trips, preferences, collaboration data,
  |                   and knowledge-source metadata
  |
  +--> Supabase: authentication and session identity
  |
  +--> External providers: LLMs, search, weather, currency, places
  |
  +--> RAG pipeline: document ingestion -> embeddings/vector store
                    -> retrieval -> answer generation
```

  -----------------------------------------------------------------------
  Component                           Responsibility
  ----------------------------------- -----------------------------------
  React frontend                      UI, routing, forms, workspace
                                      views, API calls

  Vite                                Development server and production
                                      build

  FastAPI                             HTTP routes, request validation,
                                      dependency injection, OpenAPI docs

  Pydantic models                     Request/response validation

  Services                            Business logic and persistence
                                      orchestration

  Agent workflows                     AI planning and tool coordination

  MongoDB Atlas                       Application persistence and source
                                      metadata

  Supabase                            Authentication/session identity

  ChromaDB                            Vector retrieval for RAG, subject
                                      to persistence configuration

  External APIs                       AI generation, web search, weather,
                                      currency, place data

  Vercel                              Frontend hosting

  Render                              Backend hosting
  -----------------------------------------------------------------------

## 6. Technology Stack

  -----------------------------------------------------------------------
  Area                                Technology
  ----------------------------------- -----------------------------------
  Frontend                            React, JavaScript/JSX, Vite, React
                                      Router

  Styling                             Tailwind CSS and project UI styles

  Backend                             Python, FastAPI, Uvicorn

  Schemas                             Pydantic

  Application database                MongoDB / MongoDB Atlas

  Authentication                      Supabase Auth

  AI workflow orchestration           LangGraph and project agent modules

  Vector store                        ChromaDB

  AI provider integrations            Groq and Google API integrations,
                                      depending on workflow

  Search                              Tavily

  Weather                             OpenWeatherMap

  Currency                            Exchange-rate API integration

  Tests                               pytest, frontend test scripts,
                                      lint, production build

  Frontend hosting                    Vercel

  Backend hosting                     Render
  -----------------------------------------------------------------------

Use `requirements.txt`, `pyproject.toml`, and `frontend/package.json` as
the source of truth for installed versions.

## 7. Repository Structure

This is a functional overview of the main directories observed in the
project. It is not a replacement for the exact file tree in the current
branch.

``` text
Pack-Go/
â”œâ”€â”€ agent/                        # AI agents and planning workflows
â”œâ”€â”€ api/
â”‚   â””â”€â”€ v1/
â”‚       â”œâ”€â”€ trips.py              # Trip API
â”‚       â”œâ”€â”€ users.py              # Profile and preference API
â”‚       â”œâ”€â”€ collaboration.py      # Groups, invitations, messages, proposals,
â”‚       â”‚                         # decisions, checklists, notifications
â”‚       â”œâ”€â”€ knowledge.py          # User knowledge/RAG endpoints
â”‚       â””â”€â”€ ...                   # Expenses, journal, utilities, admin, etc.
â”œâ”€â”€ config/                       # App configuration
â”œâ”€â”€ database/
â”‚   â”œâ”€â”€ mongodb.py                # MongoDB client/database access
â”‚   â””â”€â”€ ...                       # Other database helpers
â”œâ”€â”€ exception/                    # Application exceptions
â”œâ”€â”€ evaluation/                   # Evaluation utilities
â”œâ”€â”€ logger/                       # Logging setup
â”œâ”€â”€ memory/                       # Agent/session memory helpers
â”œâ”€â”€ models/                       # Domain, request, and response schemas
â”œâ”€â”€ prompt_library/               # Prompt templates/instructions
â”œâ”€â”€ rag/
â”‚   â”œâ”€â”€ ingestion.py              # Knowledge ingestion
â”‚   â”œâ”€â”€ vector_store.py           # Vector-store setup/access
â”‚   â”œâ”€â”€ retrieval.py               # Retrieval logic
â”‚   â””â”€â”€ ...                       # Additional RAG modules
â”œâ”€â”€ scripts/                      # Utility/maintenance scripts
â”œâ”€â”€ services/
â”‚   â”œâ”€â”€ trip_service.py           # Trip persistence/business logic
â”‚   â”œâ”€â”€ collaboration_service.py  # Collaboration operations
â”‚   â”œâ”€â”€ expense_service.py        # Expense logic
â”‚   â”œâ”€â”€ journal_service.py        # Journal logic
â”‚   â”œâ”€â”€ itinerary_csp.py          # Constraint-based optimization
â”‚   â”œâ”€â”€ itinerary_ga.py           # Genetic-algorithm optimization
â”‚   â”œâ”€â”€ route_optimization.py     # Route optimization
â”‚   â”œâ”€â”€ travel_utility_service.py # Travel utilities
â”‚   â””â”€â”€ ...                       # Other services
â”œâ”€â”€ tests/                        # Backend pytest suite
â”œâ”€â”€ tools/                        # Agent tools and integrations
â”œâ”€â”€ utils/                        # Shared helpers
â”œâ”€â”€ frontend/
â”‚   â”œâ”€â”€ src/
â”‚   â”‚   â”œâ”€â”€ auth/                 # Supabase/auth client and context
â”‚   â”‚   â”œâ”€â”€ api/                  # Frontend API client
â”‚   â”‚   â””â”€â”€ ...                   # Pages, components, routes
â”‚   â”œâ”€â”€ tests/                    # Frontend tests
â”‚   â”œâ”€â”€ package.json              # Frontend dependencies/scripts
â”‚   â”œâ”€â”€ vite.config.js            # Vite config and env loading
â”‚   â””â”€â”€ vercel.json               # SPA fallback for client-side routes
â”œâ”€â”€ main.py                       # FastAPI entry point
â”œâ”€â”€ streamlit_app.py              # Streamlit entry point, if used
â”œâ”€â”€ requirements.txt              # Python dependencies
â”œâ”€â”€ pyproject.toml                # Python/tool configuration
â”œâ”€â”€ alembic.ini                   # Legacy migration configuration; verify current usage
â””â”€â”€ .gitignore                    # Secret and generated-file exclusions
```

`main.py` mounts the FastAPI application and routes. `api/v1/` contains
HTTP contracts, `services/` contains business logic, `models/` contains
schemas, `rag/` contains retrieval code, and `frontend/` is the Vercel
project root. Legacy files may remain from earlier architecture
iterations; confirm their usage before removing them.

## 8. Main Workflows

### Generate and save a trip

1.  User submits a planning request.
2.  Frontend calls `POST /plan` or `POST /plan/stream`.
3.  FastAPI validates the request.
4.  Agent/workflow modules produce the plan.
5.  The result is validated and persisted by the trip service.
6.  The API returns the plan and saved trip identifier.
7.  The frontend retrieves the trip using the trip APIs.

A plan response alone is not proof of persistence; read the saved trip
back to verify.

### Authentication and protected requests

1.  User signs in through Supabase.
2.  Frontend obtains the session/access token.
3.  API client forwards the token with protected requests.
4.  Backend validates the token using its configured Supabase auth path.
5.  Services enforce ownership and group membership.

A user-supplied ID alone must never be treated as proof of
authorization.

### Invitation workflow

1.  Authorized member creates an invitation.
2.  Recipient opens the frontend invitation route.
3.  Frontend requests invitation preview from the backend.
4.  Recipient authenticates if required and accepts.
5.  Backend validates the token and updates membership.
6.  Authorized member can access the group workspace.

A page returning HTML proves only SPA route delivery, not successful
invitation acceptance.

### RAG workflow

1.  Authorized user uploads a document.
2.  Ingestion extracts and chunks content.
3.  Embeddings are generated using configured providers.
4.  Vectors are written to the configured vector collection.
5.  Source metadata is stored in the application database.
6.  A question triggers retrieval and answer generation.
7.  The UI presents source information when returned by the API.

Production reliability requires vector storage and metadata to persist
across restarts and redeployments.

## 9. Local Setup

### Prerequisites

-   Git
-   A compatible Python version
-   Node.js and npm compatible with `frontend/package.json`
-   MongoDB Atlas or an approved isolated MongoDB test instance
-   Supabase project
-   API credentials for the external features you intend to test

### Clone the repository

``` bash
git clone https://github.com/patilshrutika1803/Grevix_AITripWeaver.git
cd Grevix_AITripWeaver
```

If already cloned, open the existing project folder instead.

### Create a Python virtual environment (Windows CMD)

``` cmd
py -3.12 -m venv .venv
.venv\\Scripts\\python.exe -m pip install --upgrade pip
.venv\\Scripts\\python.exe -m pip install -r requirements.txt
```

PowerShell users can activate the environment with `..\\.venv\\Scripts\\Activate.ps1` from the repository root if desired. The commands above avoid shell activation and call the virtual-environment Python directly.

### Install frontend dependencies

``` cmd
cd frontend
npm ci
cd ..
```

Configure the ignored root `.env` file with the required local settings.
Use an example template only if one exists in the checked-out branch.
Never commit `.env` or paste secrets into issues/chat.

## 10. Environment Variables

Variable requirements depend on the actual code paths enabled. Verify
usage before renaming or deleting variables.

### Backend --- root `.env`

``` dotenv
PACK_GO_ENV=development
PACK_GO_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
# Only if required by the active backend auth/admin path; backend-only.
SUPABASE_SERVICE_ROLE_KEY=

# MongoDB
MONGODB_URI=
MONGODB_DATABASE=pack-go

# AI/search providers
GROQ_API_KEY=
GOOGLE_API_KEY=
TAVILY_API_KEY=

# Travel utilities
OPENWEATHERMAP_API_KEY=
EXCHANGE_RATE_API_KEY=
```

### Frontend public build-time configuration

The current Vite configuration loads the root environment and maps the
public Supabase URL to the name expected by the frontend client. Verify
`frontend/vite.config.js` before changing that arrangement.

Common public variables:

``` dotenv
SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_BASE_URL=
```

-   During local development, the Vite proxy may forward requests to
    `http://127.0.0.1:8000`.
-   In Vercel, set `VITE_API_BASE_URL` to the deployed backend origin if
    the production API client requires it.
-   Local ignored `.env` files are not automatically present in Vercel
    or Render.
-   `MONGODB_URI`, provider secrets, and `SUPABASE_SERVICE_ROLE_KEY`
    must never be exposed in the frontend bundle or assigned a `VITE_`
    prefix.

Checklist: - \[ \] `.env` is ignored by Git. - \[ \] MongoDB
URI/database are configured on the backend. - \[ \] Supabase public
URL/anon key are configured for frontend builds. - \[ \] Backend token
validation matches the current auth implementation. - \[ \] Provider
keys are set for features being tested. - \[ \] Allowed origins include
the actual frontend origin. - \[ \] Production secrets are configured in
the backend host. - \[ \] Vercel build variables are configured
independently from local `.env`.

## 11. Run Locally

Run backend and frontend in separate terminals.

### Terminal A --- FastAPI backend

From the repository root in Windows CMD:

``` cmd
.venv\\Scripts\\python.exe -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Local API base:

``` text
http://127.0.0.1:8000
```

### Terminal B --- frontend

``` cmd
cd frontend
npm run dev
```

Use the URL printed by Vite, commonly `http://localhost:5173`.

### Useful URLs

  Purpose               URL
  --------------------- --------------------------------------
  Frontend              `http://localhost:5173`
  FastAPI Swagger UI    `http://127.0.0.1:8000/docs`
  OpenAPI JSON          `http://127.0.0.1:8000/openapi.json`
  Graph visualization   `http://127.0.0.1:8000/graph`

The `/` or `/health` route may return 404 if it is not defined. Use
`/docs` and routes shown by the running OpenAPI schema to verify the
API.

### Read-only MongoDB ping

Run from the repository root in a separate terminal:

``` powershell
.\venv\Scripts\python.exe -c "from database.mongodb import get_database; db=get_database(); print(db.client.admin.command('ping'))"
```

Expected result:

``` text
{'ok': 1.0}
```

A timeout means a usable server could not be reached in time. Check
cluster status, DNS/network access, Atlas IP access rules, VPN/firewall
restrictions, and then credentials once network connectivity is
established. Never share the full connection string.

## 12. API Overview

Use the running API's OpenAPI schema as the source of truth:

-   Swagger UI: `/docs`
-   OpenAPI JSON: `/openapi.json`

### Main API areas

  ---------------------------------------------------------------------------------------------
  Area                    Representative endpoints                      Purpose
  ----------------------- --------------------------------------------- -----------------------
  Planning                `POST /plan`, `POST /plan/stream`             AI trip planning

  Trips                   `/api/v1/trips`                               Trip CRUD

  Users                   `/api/v1/users/me`,                           Profile/preferences
                          `/api/v1/users/me/preferences`

  Group travel            `/api/v1/trips/{trip_id}/workspace`,          Collaboration and
                          `/members`, `/invitations`                    membership

  Invitations             `/api/v1/invitations/{token}`, `/accept`      Preview and acceptance

  Proposals               `/api/v1/trips/{trip_id}/proposals`,          Proposals and voting
                          `/api/v1/proposals/{proposal_id}/vote`

  Decisions               `/api/v1/proposals/{proposal_id}/finalize`,   Finalize/apply
                          `/api/v1/decisions/{decision_id}/apply`       decisions

  Messages                `/api/v1/trips/{trip_id}/messages`            Group chat

  Expenses                `/api/v1/trips/{trip_id}/expenses`            Expenses and summaries

  Journal                 `/api/v1/trips/{trip_id}/journal`             Journal entries

  Checklists              `/api/v1/trips/{trip_id}/checklist`           Trip checklist

  Knowledge               `/api/v1/knowledge`, `/api/v1/knowledge/ask`  RAG and knowledge

  Admin knowledge         `/api/v1/admin/knowledge/documents`           Document management

  Utilities               `/api/v1/utilities/weather`, `/currency`,     Travel utilities
                          `/places`

  Routes/maps             `/api/v1/trips/{trip_id}/utilities/map`,      Maps and routing
                          `/route/optimize`

  Admin                   `/api/v1/admin/overview`                      Admin overview
  ---------------------------------------------------------------------------------------------

Protected endpoints require valid authentication and appropriate
ownership, membership, or administrator permissions. Consult `/docs` for
exact schemas and request bodies.

## 13. Deployment

The intended arrangement is a Vercel frontend and a separately deployed
FastAPI backend.

### Frontend --- Vercel

-   Original project deployment repository: `patilshrutika1803/Pack-Go`. Configure `patilshrutika1803/Grevix_AITripWeaver` separately if deploying the hackathon submission.
-   **Root directory:** `frontend`
-   **Build command:** `npm run build`
-   **Output directory:** `dist`
-   **Frontend URL:** `https://pack-go-cyan.vercel.app`

Steps: 1. Import the repository into Vercel. 2. Set root directory to
`frontend`. 3. Configure the build command/output directory. 4. Set
public frontend environment variables in Vercel. 5. Set
`VITE_API_BASE_URL` to `https://pack-go.onrender.com` if required by the
production API client. 6. Confirm `frontend/vercel.json` has the SPA
rewrite for client-side routes. 7. Redeploy after changing build-time
variables. 8. Test sign-in, protected pages, direct route navigation,
and real API calls.

Never set the deployed frontend API base URL to `localhost` or
`127.0.0.1`; those refer to the visitor's own machine.

### Backend --- Render

-   Service URL: `https://pack-go.onrender.com`
-   Repository root: directory containing `main.py`
-   **Build command:**

``` bash
pip install -r requirements.txt
```

-   **Start command:**

``` bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

Configure MongoDB, Supabase/auth, CORS/allowed origins, AI provider,
utility-provider, and vector-storage variables in Render's environment
settings. Do not depend on local `.env` being uploaded with the
application.

### MongoDB Atlas

1.  Verify the cluster is running.
2.  Create a database user with least-privilege access.
3.  Configure Network Access for the backend host and local development
    machine as needed.
4.  Configure `MONGODB_URI` and `MONGODB_DATABASE` in the backend
    environment.
5.  Run a read-only ping from an allowed environment.
6.  Test safe write/read persistence using test data or an isolated test
    database.

Avoid broad public access rules as a shortcut.

### Supabase

1.  Configure the project URL and public anon key for frontend builds.
2.  Configure backend token verification according to the active
    implementation.
3.  Set site/redirect URLs for local and deployed frontend domains.
4.  Test sign-in, token forwarding, protected API calls, and
    expired-session behavior.
5.  Keep privileged keys backend-only.

### RAG/vector persistence

Local vector files may be lost if the host uses an ephemeral filesystem.
Before production use: 1. Identify the configured ChromaDB storage
path/provider. 2. Confirm data survives restart/redeploy. 3. Confirm
source metadata and vectors remain consistent. 4. Test
ingestion/re-indexing and retrieval against known documents. 5. Document
any persistent-volume or hosted-vector-service requirement.

### Production checklist

-   [ ] Vercel build succeeds.
-   [ ] Render backend starts.
-   [ ] MongoDB is reachable from the deployed backend.
-   [ ] Supabase auth works live.
-   [ ] Frontend API base points to the deployed backend.
-   [ ] CORS allows the deployed frontend.
-   [ ] Secrets are configured only in appropriate host settings.
-   [ ] Direct route navigation and refresh work.
-   [ ] Trip create/read persistence passes.
-   [ ] Group permissions and invitation flows pass.
-   [ ] RAG source retrieval persists across restarts.
-   [ ] Logs contain no credentials.
-   [ ] Critical workflows are tested with safe accounts/data.

## 14. Testing

### Frontend

Run from `frontend/`:

``` bash
npm test
npm run lint
npm run build
```

### Backend

Run from the repository root:

``` bash
python -m pytest -q
```

Run a focused test:

``` bash
python -m pytest -q tests/test_plan_trip_persistence.py
```

Compile application/test modules:

``` bash
python -m compileall -q agent api config database exception evaluation logger memory models prompt_library rag scripts services tests tools utils main.py
```

### Integration-test checklist

  Workflow      Verify
  ------------- ----------------------------------------------------------
  Planner       Valid request, streaming, error handling
  Persistence   Create plan, save, read back, verify owner
  Preferences   Defaults, update, persistence, invalid input
  Journal       CRUD and authorization
  Invitations   Create, preview, accept, invalid/expired token
  Membership    Workspace access and unauthorized denial
  Chat          Send and retrieve messages
  Decisions     Proposal, vote, finalize, apply
  Expenses      Create, list, update, summary, participant validation
  RAG           Ingest known sample, retrieve it, verify source metadata
  Utilities     Provider response and missing-key behavior
  Deployment    Direct routes, CORS, auth, logs, persistent storage

Report unit tests, mocked integration tests, and live external-service
tests separately. A mock passing is not proof that production services
work.

## 15. Security

-   Never commit `.env`, API keys, passwords, session tokens, database
    URIs, or service-role keys.
-   Do not commit local database backups such as `pack_go.db.backup-*`; verify Git tracking and remove sensitive artifacts before pushing.
-   Rotate credentials exposed in screenshots, chat, logs, or Git
    history.
-   Keep Supabase service-role and provider keys backend-only.
-   Use public Supabase configuration only in frontend code.
-   Use least-privilege MongoDB users and suitable network restrictions.
-   Enforce ownership and membership on protected resources.
-   Avoid logging raw tokens, invitation tokens, or connection strings.
-   Use isolated test data and avoid destructive production tests.
-   Review changes before committing.

Before committing:

``` bash
git status --short
git diff --check
git diff --stat
```

Check whether `.env` is ignored:

``` bash
git check-ignore -v .env
```

Adding a secret to `.gitignore` does not remove it from existing Git
history. Rotate exposed credentials and remediate history safely if
needed.

## 16. Verification Status and Known Limitations

The following status reflects checks actually performed during the current local setup on 11 Oct 2026. Update it whenever new checks are run.

| Area | Current status | Evidence / limitation |
|---|---|---|
| Frontend production build | PASS | `npm run build` succeeded; Vite emitted a non-blocking large-chunk warning. |
| Frontend tests | PASS | `npm test`: 9 passed, 0 failed. |
| Python dependency consistency | PASS | `.venv\\Scripts\\python.exe -m pip check` reported no broken requirements. |
| Backend import | PASS | Importing `main` succeeded and initialized LangGraph MemorySaver. |
| API docs route | PASS | `curl.exe -I http://127.0.0.1:8000/docs` returned HTTP 200. |
| Frontend root HTTP response | PASS, limited | `curl.exe -I http://localhost:5173/` returned HTTP 200; this does not prove React rendered successfully. |
| Browser rendering | NOT VERIFIED | The browser showed a blank white page; inspect DevTools Console and fix before claiming end-to-end success. |
| MongoDB connectivity | NOT VERIFIED | No successful MongoDB ping was recorded in this setup session. |
| Live Supabase authentication | NOT TESTED | Real sign-in and backend token verification are not verified. |
| Full backend test suite | NOT TESTED in this setup session | Run it after environment configuration and investigate failures. |
| Production readiness | NOT CONFIRMED | Full end-to-end workflows and deployment configuration remain unverified. |

### Known follow-up work

-   Resolve MongoDB connectivity and verify a real read-only ping.
-   Verify live Supabase authentication with the active backend
    configuration.
-   Migrate remaining legacy backend tests to the current
    MongoDB/Supabase architecture where appropriate.
-   Investigate all remaining test failures instead of assuming they are
    obsolete.
-   Run real integration tests for planning/persistence and
    collaboration.
-   Verify persistent vector storage and RAG source metadata in
    deployment.
-   Verify Vercel/Render environment settings and production API calls.
-   Run the complete regression suite after the last code change.

Update this section when fresh test evidence is available. Do not carry
old test totals forward after the suite changes.

## 17. Troubleshooting

### Frontend crashes on startup

-   Check which environment file Vite loads.
-   Verify the public Supabase URL and anon key.
-   Restart Vite after changing environment variables.
-   Inspect browser console and network errors.
-   Do not expose backend secrets to fix frontend configuration.

### `/` or `/health` returns 404

Those routes may not be defined. Use `/docs` and the actual endpoints in
the current OpenAPI schema.

### Port 8000 is already in use

An earlier backend process may already be running. Reuse it if healthy,
or identify and stop the correct process before starting another server.
Avoid duplicate Uvicorn processes on the same port.

### MongoDB timeout

Check cluster status, DNS, Atlas Network Access, local firewall/VPN,
outbound TCP port `27017`, then credentials once a connection is
possible. A timeout does not by itself prove a bad password.

### Invitation page loads but says unavailable

The SPA route only proves frontend routing works. Preview/acceptance
also requires a configured API base URL, running backend, reachable
database, valid token, and authentication if required.

### API returns 401/403

Check session validity, token forwarding, backend verification, trip
ownership, membership, and role requirements. Do not disable
authorization to hide the error.

### RAG shows zero sources

Check ingestion status, document metadata, vector collection
configuration, embedding provider, persistence across restarts, and
retrieval configuration.

### Deployed frontend calls localhost

Set `VITE_API_BASE_URL` to the deployed backend origin in Vercel and
redeploy.

## 18. Development Workflow

1.  Inspect the current branch and working tree.
2.  Read the implementation and related tests.
3.  Define expected behavior and failure cases.
4.  Make a focused change and add regression tests.
5.  Run focused tests, then the relevant full suite.
6.  Run lint/build or Python compilation as appropriate.
7.  Review the diff and check for secrets.
8.  Commit a scoped change.
9.  Deploy only after review and environment checks.
10. Verify the deployed workflow rather than relying on build success
    alone.

Example:

``` bash
git status
git diff --check
git diff
git add <specific-files>
git commit -m "fix: describe the change"
git push origin main
```

Prefer staging specific files rather than blindly running `git add .`,
especially when local environment files or generated files may exist.

## 19. Future Improvements

-   Finish migrating legacy tests to the current MongoDB/Supabase
    architecture.
-   Add stable integration tests using an isolated test database.
-   Add a documented health/readiness endpoint.
-   Improve structured logging without exposing secrets.
-   Add end-to-end browser tests for authentication, planning,
    persistence, and invitations.
-   Use durable hosted vector storage or a persistent volume for
    production RAG.
-   Add observability for external provider failures and rate limits.
-   Add CI for backend tests, frontend tests, lint, and production
    build.
-   Document backups, recovery, and deployment rollback.
-   Improve frontend bundle splitting if bundle analysis shows it is
    needed.

## License

Add the license selected by the project owner before public
distribution. Until a license is included, do not assume the repository
grants permission to reuse the code.
