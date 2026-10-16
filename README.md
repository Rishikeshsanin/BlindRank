# BlindRank 🎲

**Rank now. Regret later.** Five items. Five locked slots. No take-backs.

A mobile-first, no-login ranking party game and future independent Minglecade catalog entry. It does **not** modify the Minglecade repository.

## What works without any account or backend

- **Quick Play**: one-by-one blind ranking; locked placements never move; five reveals; final animated results.
- **18 categories / 108 human-curated packs**: Indian food, Tollywood, Bollywood, IPL, college life, memes, tech, anime, and more.
- **Custom Rank**: make a private, five-item ranking; duplicates and input lengths are checked.
- **Replay / random category / searchable categories**.
- **Share or save a result card** as PNG; copy/share via native device options.
- **Mobile-first** layout, keyboard-operable slots, focus styles, muted sound toggle, reduced-motion CSS, persistent Quick Play progress.

## Real party rooms (Project Hub integration)

The repository includes an **isolated** multiplayer schema and app-prefixed Edge Function inside the existing shared Supabase **Project Hub** for:

- 2–12 player rooms with six-character codes and invitation links; no login.
- Server-selected packs with future items hidden from clients.
- Synchronization using 2-second HTTP polling (not simulated local multiplayer).
- Each player independently locks a slot; the next item appears after all active players have submitted.
- Host controls, ready states, safe host handoff, room expiry, player removal, reconnection using per-room tokens.
- **Classic Party**: compare completed rankings, no fake winner.
- **Guess My Ranking**: rotating Judge, secret true order, 0–10 score equal to the number of correctly ordered pairs.
- Raw tables are protected by RLS without client policies; server-only RPC enforces placement and room-capacity constraints in transactions.

**Current state:** Project Hub App #15 is registered; `blindrank.rooms`, `blindrank.players`, `blindrank.placements`, app-only RLS/SQL functions, and `blindrank-game-api` are deployed. A BlindRank-scoped database login and Edge Function secret still need to be configured, followed by multiplayer E2E tests. The Party Room form remains **intentionally disabled** until verified; it never fakes working multiplayer.

## Run locally

Requires no npm dependencies (Node 20+ for tests; Python 3 to serve files):

```bash
npm run check
npm run dev
# open http://localhost:3000
```

Any HTTP static server also works. Do not open `index.html` with `file://` because browsers block ES-module imports on some systems.

## Deploy standalone on Vercel

1. Import `Rishikeshsanin/BlindRank` as a new Vercel project.
2. Framework preset: `Other` (static site); root directory: `/`; no install/build command needed.
3. Deploy. Quick Play and Custom Rank work immediately without Supabase.
4. Do **not** create a new Supabase project. Follow the existing Project Hub onboarding below before advertising multiplayer as ready.

## Shared Supabase Project Hub (read the governance notice first)

**Use the existing** Supabase Project Hub (project ref `nowlwprtcnieihelqjoa`); **never create a separate Supabase project for BlindRank**.

The canonical live governance notice is `hub.read_me_first`. See `AGENTS.md` and `SUPABASE_HUB_RULES.md` before every database change. BlindRank was added as **App #15** (`slug = schema_name = blindrank`), after the repository safety files were verified, and `hub.assert_app_scope('blindrank','blindrank')` passed.

Already completed and verified:

- `supabase/project-hub/migrations/blindrank__001_rooms.sql`: created only `blindrank.*` tables and RPCs, RLS, and `blindrank_runtime` (NOLOGIN, app-only permissions). No `public` application tables, other app changes, global extensions, or global service-role credentials.
- `blindrank__002_player_index.sql`: additional app-only player lookup index.
- Both migrations and nine database resources were registered in the Hub ledger. The app-prefixed `blindrank-game-api` Edge Function was deployed and registered separately.
- Anonymous and ordinary authenticated roles have no SELECT on the BlindRank tables; the private `blindrank_runtime` role does.

**The multiplayer server is NOT YET CONNECTED** because the Hub's project-wide service-role key and project-admin DB URL are forbidden for ordinary apps. The deployed Edge Function deliberately responds with HTTP 503 until an app-scoped connection secret is configured. Quick Play and Custom Rank are unaffected.

### Finish the secure backend connection

1. In the Project Hub SQL editor, provision a **new BlindRank-only LOGIN role**. Choose a long unique password privately, and do not put it in GitHub or chat:

   ```sql
   -- Use a unique password privately in the Supabase SQL editor.
   CREATE ROLE blindrank_worker LOGIN INHERIT PASSWORD '<UNIQUE_RANDOM_PASSWORD>';
   GRANT blindrank_runtime TO blindrank_worker;
   ```

   Do not give this role memberships, privileges, or access to any other app schema. The role inherits only what `blindrank_runtime` has been granted.

2. Obtain the **scoped worker role's** PostgreSQL connection URI from the Project Hub database connection settings (use Supavisor transaction pooler with SSL if appropriate for your environment). In Supabase **Project Hub → Edge Functions → Secrets**, add `BLINDRANK_DATABASE_URL` with that app-role URL. Do not paste credentials into the browser, `config.js`, Vercel client environment variables, or repository.
3. Redeploy `supabase/functions/blindrank-game-api/` if needed. It is deployed under `blindrank-game-api` with `verify_jwt=false`; players authenticate by high-entropy per-room tokens. Do not expose the privileged service key or project-admin connection string.
4. Run real two-device tests: create room → join → ready → start → lock each of five items → reveal → next round. Also verify judge scores, reconnect/refresh, leaving and host transfer, concurrent slot locking, expired rooms and anonymous denial. Add rate limiting and review abuse quotas before public promotion.
5. **Only after the backend passes these tests**, update public `config.js` to:

   ```js
   window.BLINDRANK_API_URL = 'https://nowlwprtcnieihelqjoa.supabase.co/functions/v1/blindrank-game-api';
   ```

   Then redeploy BlindRank on Vercel and verify the public website. The function URL is public; the database URI is private.

Run `hub.assert_app_scope('blindrank','blindrank')`, Supabase advisors and cross-app isolation checks before further database changes. Keep unrelated Hub app resources untouched.

## Folder map

| Path | Purpose |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | Static frontend, layouts, state machine, room UI |
| `logic.js` | Testable pure ranking rules |
| `data.js` | Human-curated, local content library |
| `config.js` | Public endpoint configuration (empty by default) |
| `supabase/project-hub/migrations/` | BlindRank-only Hub migrations (legacy dedicated-project SQL disabled) |
| `supabase/functions/blindrank-game-api/` | App-scoped Edge Function; requires backend-only database secret |
| `tests/` | Node built-in game-rule tests |
| `.github/workflows/check.yml` | CI syntax and logic checks |

## Test before release

`npm run check` runs syntax checks and automated tests for unique five-item rounds, irreversible slots, custom input validation, progress invariants, permutation scoring, and shuffle integrity.

Database migrations passed isolated Hub checks, but a scoped backend credential and genuine multiplayer integration tests are still required. Do not call multiplayer production-verified merely because local logic tests pass.

## Known limitations / next steps

- Party Room is disabled until the scoped worker login/Edge secret are configured and live multiplayer is verified.
- The room transport is 2-second polling rather than WebSockets; this is deliberate for simple consistency, with server-authoritative state.
- Inactive players can block progression until the host removes them; automatic AFK timeout and graceful late reconnection are future enhancements.
- Custom Rank V1 is solo/local; editable custom party packs are not yet available.
- Room creation/joining needs explicit rate-limiting / abuse protections before high-traffic public launch.
- Result sharing uses original typographic artwork rather than copyrighted photos.
- All source files are plain browser ES modules to keep V1 instant, minimal, and independent from build services. A future Next.js refactor is optional if SSR/accounts or larger-scale features become worthwhile.

**Safety:** no paid AI APIs, no scraped content, no credential collection, no modification of unrelated repositories.
