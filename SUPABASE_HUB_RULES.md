# BlindRank — Supabase Project Hub safety rules

Use EXISTING Supabase Project Hub `nowlwprtcnieihelqjoa`, not a dedicated Supabase project. App slug and schema: `blindrank`. Repo: https://github.com/Rishikeshsanin/BlindRank. Expected Edge Function: `blindrank-game-api`.

## Mandatory preflight

```sql
select * from hub.read_me_first;
select app_number,slug,display_name,schema_name,status,agent_instructions_path,hub_rules_path,safety_contract_acknowledged_at from hub.apps where slug='blindrank';
select hub.assert_app_scope('blindrank','blindrank');
```

`AGENTS.md` and this rules file must be verified in GitHub BEFORE registering the safety contract and before creating app DB objects. Hub-admin onboarding may create only BlindRank-owned registry/resource/migration records. No other Hub rows may be altered.

## Strict isolation

* Application tables, functions, RPCs and migrations belong only under `blindrank.*`, all SQL fully qualified. Never use the legacy `public.br_*` dedicated-project migration on Project Hub.
* Enable RLS on all app tables. Anonymous/authenticated browser roles must never access raw room/secret-ranking tables.
* Do not change shared exposed-schema configuration. Avoid PostgREST for private room state; an app-scoped DB login role (member of `blindrank_runtime`) can connect from `blindrank-game-api` using backend-only `BLINDRANK_DATABASE_URL`.
* The project-level Supabase `service_role` key and admin DB URL are HUB-ADMIN ONLY and must never be used by BlindRank's ordinary frontend/backend.
* No cross-app FK, shared bucket, global extension change, generic function name, key rotation, Auth user write, or shared project configuration changes.
* No credentials, DB URLs, service keys or passwords in GitHub, browser config, ordinary logs or public reports.
* Never use `DROP SCHEMA CASCADE`, blanket grants, unscoped destructive SQL, or disable RLS to fix access.
* Create resources only after verifying Hub registry contract; record verified app resource names and migration ledger; run security advisors and isolation checks.

App migrations go in `supabase/project-hub/migrations/`; server in `supabase/functions/blindrank-game-api/`. Publish only the Edge Function public URL in `config.js` after the backend is healthy. Quick Play must work without the backend.

Stop and ask if a step requires changes outside BlindRank's assigned boundary.
