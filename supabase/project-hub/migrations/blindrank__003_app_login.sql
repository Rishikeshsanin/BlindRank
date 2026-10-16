-- Applied to the shared Project Hub 2026-10-16.
-- BlindRank-scoped login role only; never add a password to migration source.
-- Verify README, AGENTS.md, SUPABASE_HUB_RULES.md and live hub.read_me_first first.
select hub.assert_app_scope('blindrank','blindrank');

do $blindrank_role$
begin
  if not exists (select 1 from pg_roles where rolname = 'blindrank_app') then
    create role blindrank_app login in role blindrank_runtime connection limit 8;
  end if;
end
$blindrank_role$;

alter role blindrank_app set search_path = pg_catalog, blindrank;

-- Password and SSL connection URI must be generated and stored using a trusted,
-- private secret provisioning workflow. Never commit them into GitHub or migrations.
-- This role must inherit no privileges except blindrank_runtime.
