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
- Built-in logic tests: `npm run check` (7 current Node tests).

**Party Room buttons are intentionally disabled until backend credentials and a real two-device test are completed.** Deployed code is not evidence of working multiplayer.

## Architecture: existing Supabase Project Hub

**Do not create a separate Supabase project.** The user's existing shared **Project Hub** (`nowlwprtcnieihelqjoa`) is the backend:

- Registry: `hub.apps` App **#15**, `slug=blindrank`, `schema_name=blindrank`.
- App database: `blindrank.rooms`, `blindrank.players`, `blindrank.placements` with RLS enabled.
- Transactional PostgreSQL functions: `blindrank.join_room`, `blindrank.place`, `blindrank.maybe_advance`, `blindrank.depart`.
- App-only group role `blindrank_runtime` (NOLOGIN) and app-only login `blindrank_app` (credential must be configured); ordinary browser roles have no raw-table access.
- App-only Supabase Edge Function `blindrank-game-api` deployed in Project Hub and **not yet production-connected**.
- Client connects directly to the Edge Function only after its backend passes live integration tests. Private game items and judge choices stay on the server.

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
| `config.js` | Public Edge Function URL (blank until verified) |

### Final activation: controlled manual secret setup

The Hub governance prohibits the app from using the shared `SUPABASE_SERVICE_ROLE_KEY` or the administrator DB URI. The required Edge secret could not be securely provisioned through the available integration, so **no credential was published and party rooms remain disabled**.

1. Using the Project Hub Supabase dashboard **SQL Editor**, create a strong unique password for the existing `blindrank_app` login using `ALTER ROLE blindrank_app PASSWORD '<unique-generated-secret>';`. Keep that password private; do not paste it in chat or commit it.
2. Use the project's **Connect** dialog to obtain a valid SSL/TLS PostgreSQL connection URI for this isolated login (direct if IPv6 is supported or the appropriate session pooler). Do **not** use the `postgres` administrator identity; verify the URI identifies `blindrank_app` and no other role.
3. In **Project Hub → Edge Functions → Secrets**, store that private URI in **`BLINDRANK_DATABASE_URL`**. Never place it in `config.js`, GitHub, or a public Vercel variable.
4. Verify `blindrank-game-api` creates and joins a test room using two real browsers/devices. Test five placements, reveal, judge scoring, rematch, concurrency, refresh and host transfer. Confirm it never returns private future items or judge answers early.
5. Check the security/performance advisors and add public-endpoint rate limits before large-scale promotion.
6. **Only after all tests pass:** set `window.BLINDRANK_API_URL = 'https://nowlwprtcnieihelqjoa.supabase.co/functions/v1/blindrank-game-api';` in `config.js`, redeploy Vercel, and verify again.

The Edge Function intentionally returns a safe unavailable response when its app-only DB secret is missing. Do not remove this guard.

#### Readiness and operations

The deployed Edge Function provides a secret-free readiness route:

```text
GET https://nowlwprtcnieihelqjoa.supabase.co/functions/v1/blindrank-game-api/health
```

It returns HTTP 200 with `status: "ready"` only when PostgreSQL is reachable through the exact `blindrank_app` identity. Without the credential, or with an overprivileged/admin connection, it returns HTTP 503. This is a **readiness check**, not proof that multiplayer works: complete the full live two-browser flow before exposing room buttons.

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

- **Verified:** standalone frontend release; source published; 12/12 GitHub CI tests (7 game-rule + 5 governance); Hub App #15; isolated RLS tables and restricted runtime role; Edge Function v3 deployed; BlindRank-only SQL QA passed for 12-player capacity, one-way ranking, progression, host transfer, and Judge scoring.
- **Pending:** private app-only connection secret, end-to-end Edge Function ↔ DB login verification, live two-browser multiplayer tests, durable distributed rate limiting for large public traffic, and public multiplayer activation.
- **Unchanged:** Minglecade, all other GitHub repositories, all other Project Hub application schemas, Auth, storage, shared service-role credentials and project-wide settings.

Do not claim multiplayer is complete or publicly playable until the pending items are genuinely verified.