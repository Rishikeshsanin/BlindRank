# BlindRank — Supabase Project Hub agent boundary

Project: Supabase **Project Hub** (`nowlwprtcnieihelqjoa`); app slug/schema `blindrank`; repo `https://github.com/Rishikeshsanin/BlindRank`.

Before EVERY Supabase write:
1. Read `SUPABASE_HUB_RULES.md` in this repo.
2. Read `select * from hub.read_me_first;` in the live Project Hub.
3. Verify BlindRank's registry row in `hub.apps` with `slug = schema_name = 'blindrank'`, repo URL, and acknowledged `AGENTS.md` / `SUPABASE_HUB_RULES.md` safety paths.
4. Run `select hub.assert_app_scope('blindrank','blindrank');`.
5. Inspect only `blindrank.*` and BlindRank-registered resources. Stop on mismatch.

Normally change ONLY `blindrank.*`, registered BlindRank-prefixed Edge Functions/resources, and app-only credentials. Narrowly scoped Hub admin onboarding may register BlindRank-owned records in `hub.apps`, `hub.app_resources` and `hub.schema_versions` only; never touch another app's records.

PROTECTED: `hub.*` except approved own onboarding rows, `public.*`, `auth.*`, `storage.*`, `realtime.*`, other app schemas, shared Auth/API/project settings, secrets, keys, billing or compute.

No public application tables, no shared key in ordinary app/backend, no unscoped SQL, no destructive operations, no cross-app dependencies, no disabling RLS. Every database operation must be fully schema-qualified. Use only an app-scoped DB role and backend-only `BLINDRANK_DATABASE_URL` secret. Never commit secrets. Verify security advisors and scope after writes. Never modify Minglecade or unrelated repos.
