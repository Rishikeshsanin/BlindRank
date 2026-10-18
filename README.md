# BlindRank 🎲

**Rank now. Regret later.** Five items, five locked slots, no take-backs.

Live frontend: https://blindrank-lemon.vercel.app  
Repository: https://github.com/Rishikeshsanin/BlindRank  
Future Minglecade listing: https://minglecade.vercel.app (independent app; Minglecade not modified).

## Gameplay currently available

- Quick Play without sign-in, five one-by-one irrevocable placements, animated reveal.
- Custom Rank with private player-entered five-item categories.
- 18 curated categories and 108 distinct five-item content packs.
- Replay, random category, category search, responsive mobile UI and result card export.
- Built-in checks: `npm run check` (12 Node tests covering core game rules and Hub governance).

**Party Room is enabled on the deployed frontend.** The restricted database connection, two-client live API integration, and production mobile-browser smoke test for both game modes have passed. Independent physical-device and load testing remain separate follow-ups.

## Architecture: existing Supabase Project Hub

**Do not create a separate Supabase project.** The user's existing shared **Project Hub** (`nowlwprtcnieihelqjoa`) is the backend:

- Registry: `hub.apps` App **#15**, `slug=blindrank`, `schema_name=blindrank`.
- App database: `blindrank.rooms`, `blindrank.players`, `blindrank.placements` with RLS enabled.
- Transactional PostgreSQL functions: `blindrank.join_room`, `blindrank.place`, `blindrank.maybe_advance`, `blindrank.depart`.
- App-only group role `blindrank_runtime` (NOLOGIN) and restricted login `blindrank_app` (credential stored privately in Project Hub Edge Function Secrets); ordinary browser roles have no raw-table access.
- App-only Supabase Edge Function `blindrank-game-api` deployed in Project Hub, publicly reachable and verified using the scoped database login.
- The browser calls only the public BlindRank Edge Function endpoint. No database URL or password is exposed in frontend code; private game items and judge choices stay on the server.

Before any Hub write, read **`AGENTS.md`** and **`SUPABASE_HUB_RULES.md`**, then read `hub.read_me_first`, check the `hub.apps` entry, and run:

```sql
select hub.assert_app_scope('blindrank','blindrank');
```

Do **not** run the retired `supabase/migrations/202610160001_blindrank.sql` or deploy the retired `supabase/functions/blindrank/` standalone server. Both were superseded because they depended on forbidden public/shared project access.

### Backend files

| Path | Purpose |
| --- | --- |
| `supabase/project-hub/migrations/blindrank__001_rooms.sql` | Isolated room tables and atomic SQL |
| `supabase/project-hub/migrations/blindrank__002_player_index.sql` | App-only player index |
| `supabase/project-hub/migrations/blindrank__003_app_login.sql` | Dedicated login role, no credentials checked in |
| `supabase/functions/blindrank-game-api/index.ts` | App-only backend |
| `supabase/functions/blindrank-game-api/data.js` | Curated backend content packs |
| `config.js` | Public Edge Function URL (no secrets) |

### Multiplayer activation and validation

The existing Project Hub's restricted `blindrank_app` credential was configured privately and the BlindRank-only Edge Function reports `{ "status": "ready", "app": "blindrank" }` from its public health route. The project-wide administrator/service-role key was not given to this app.

- **Live API smoke: passed** using two independent clients in [GitHub Actions](https://github.com/Rishikeshsanin/BlindRank/actions/workflows/live-room-smoke.yml). Validated Classic Party create, join, ready, five synchronized placements, results, rematch and host transfer; also validated hidden Judge choices, five turns and a 10-point perfect ranking.
- **Public frontend:** `config.js` contains only the nonsecret `https://nowlwprtcnieihelqjoa.supabase.co/functions/v1/blindrank-game-api` endpoint, deployed automatically to Vercel from `main`.
- **Production browser regression: passed** in [GitHub Actions run #39164127872](https://github.com/Rishikeshsanin/BlindRank/actions/runs/39164127872). Two independent mobile Chromium browser contexts completed Classic and Judge flows with no uncaught browser errors. Source: `tests/live-mobile-browser.mjs`.
- **Operational follow-up:** test on independent physical devices and varying networks, and add durable distributed rate limiting before expecting substantial public traffic. Never substitute the Hub admin key for the restricted login.

No dedicated Supabase project was created. No Minglecade repo or unrelated application schema was modified.

#### Readiness and operations

The deployed Edge Function provides a secret-free readiness route:

```text
GET https://nowlwprtcnieihelqjoa.supabase.co/functions/v1/blindrank-game-api/health
```

It returns HTTP 200 with `status: "ready"` only when PostgreSQL is reachable through the exact `blindrank_app` identity. Without the credential, or with an overprivileged/admin connection, it returns HTTP 503. This readiness check confirms the restricted database connection but does not replace the separate live multiplayer API and browser tests.

Request body sizes, repeated create/join attempts (best-effort per Edge isolate), and simultaneous active room count (up to 500) are bounded. The in-memory throttle is **not** a substitute for durable, IP-verified distributed abuse prevention at scale. Future upgrades must respect the Hub's app-specific ownership boundary.

The app-scoped database smoke test is maintained at `tests/PROJECT_HUB_QA.sql`. It creates only temporary `blindrank.*` data and removes its rows after successful execution. It should be run by an authorized Hub operator, not automatically by ordinary application code.

## Local frontend

```bash
npm run check
npm run dev
# http://localhost:3000
```

Node 20+ is required for tests. Browser gameplay itself has no paid API or login dependency.

## Status and boundaries

- **Verified:** deployed solo gameplay, 12/12 Node CI, isolated Hub App #15 (active) with RLS and restricted login, Edge Function v3, database smoke (12-player room capacity and scoring), live two-client Classic and Judge API smoke, public frontend config and production Vercel deployment.
- **Further verification:** physical-device/network checks and durable distributed anti-abuse controls before high-volume promotion.
- **Unchanged:** Minglecade, all other GitHub repositories, all other Project Hub application schemas, Auth, storage, shared service-role credentials and project-wide settings.

Do not claim physical-device coverage or production-scale load testing without evidence. Private credentials must stay in Supabase Edge Function Secrets.