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

## Real party rooms (dedicated server required)

The repository includes a complete **separate** Supabase migration and Edge Function for:

- 2–12 player rooms with six-character codes and invitation links; no login.
- Server-selected packs with future items hidden from clients.
- Synchronization using 2-second HTTP polling (not simulated local multiplayer).
- Each player independently locks a slot; the next item appears after all active players have submitted.
- Host controls, ready states, safe host handoff, room expiry, player removal, reconnection using per-room tokens.
- **Classic Party**: compare completed rankings, no fake winner.
- **Guess My Ranking**: rotating Judge, secret true order, 0–10 score equal to the number of correctly ordered pairs.
- Raw tables are protected by RLS without client policies; server-only RPC enforces placement and room-capacity constraints in transactions.

**Important:** Until the dedicated database and Edge Function are deployed and `config.js` contains their URL, the Party Room form is **intentionally disabled**. It does not fake functioning multiplayer.

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
4. Deploy a **new dedicated** Supabase project for multiplayer (see next section) before advertising Party Room as available.

## Enable actual multiplayer (separate infrastructure)

**Never apply these migrations to another existing project**, including any Project Hub or Minglecade backend.

1. Create a fresh Supabase project named BlindRank within the organization you select. Confirm pricing/quota before creation.
2. Apply `supabase/migrations/202610160001_blindrank.sql` in that new project's SQL editor or CLI. Use a dedicated project only.
3. Deploy `supabase/functions/blindrank` as an Edge Function named `blindrank`, **with `verify_jwt=false`**. Anonymous players authenticate with server-issued random room tokens (not Supabase Auth). Example with the Supabase CLI after authenticating:

   ```bash
   supabase link --project-ref YOUR_BLINDRANK_PROJECT_REF
   supabase db push
   supabase functions deploy blindrank --no-verify-jwt
   ```

4. The function reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the server via its Supabase-provided environment. **Never copy the service-role key into frontend code, GitHub, or Vercel client variables.**
5. Edit `config.js` and set **only the public Edge Function URL**:

   ```js
   window.BLINDRANK_API_URL = 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/blindrank';
   ```

6. Redeploy and run a genuine 2-device test: create → join → ready → start → lock 5 rankings → reveal → rematch, plus Judge scoring, refresh/reconnect, host departure, and conflicting simultaneous placements.
7. Check RLS, Edge Function logs, anti-abuse limits, quotas and performance before broadly promoting the rooms.

## Folder map

| Path | Purpose |
| --- | --- |
| `index.html`, `styles.css`, `app.js` | Static frontend, layouts, state machine, room UI |
| `logic.js` | Testable pure ranking rules |
| `data.js` | Human-curated, local content library |
| `config.js` | Public endpoint configuration (empty by default) |
| `supabase/migrations/...sql` | Private room tables and atomic game rules |
| `supabase/functions/blindrank/` | Authenticated party-room Edge Function + identical content library |
| `tests/` | Node built-in game-rule tests |
| `.github/workflows/check.yml` | CI syntax and logic checks |

## Test before release

`npm run check` runs syntax checks and automated tests for unique five-item rounds, irreversible slots, custom input validation, progress invariants, permutation scoring, and shuffle integrity.

The Edge Function and migration still require a dedicated Supabase staging/production environment to run integration tests. Do not call multiplayer production-verified merely because local rule tests pass.

## Known limitations / next steps

- Party Room is not usable until its dedicated backend is provisioned and configured.
- The room transport is 2-second polling rather than WebSockets; this is deliberate for simple consistency, with server-authoritative state.
- Inactive players can block progression until the host removes them; automatic AFK timeout and graceful late reconnection are future enhancements.
- Custom Rank V1 is solo/local; editable custom party packs are not yet available.
- Room creation/joining needs explicit rate-limiting / abuse protections before high-traffic public launch.
- Result sharing uses original typographic artwork rather than copyrighted photos.
- All source files are plain browser ES modules to keep V1 instant, minimal, and independent from build services. A future Next.js refactor is optional if SSR/accounts or larger-scale features become worthwhile.

**Safety:** no paid AI APIs, no scraped content, no credential collection, no modification of unrelated repositories.
