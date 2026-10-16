import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('Hub governance documents and identity match BlindRank', () => {
 const agents = read('AGENTS.md');
 const hubRules = read('SUPABASE_HUB_RULES.md');
 assert.match(agents,/hub\.read_me_first/);
 assert.match(hubRules,/hub\.assert_app_scope\('blindrank','blindrank'\)/);
 assert.match(agents,/blindrank\.\*/);
});

test('Hub migration keeps all gameplay tables inside blindrank schema', () => {
 const migration = read('supabase/project-hub/migrations/blindrank__001_rooms.sql');
 assert.match(migration,/create schema if not exists blindrank/);
 for (const name of ['rooms','players','placements']) {
   assert.match(migration,new RegExp('create table if not exists blindrank\\.'+name));
   assert.match(migration,new RegExp('alter table blindrank\\.'+name+' enable row level security'));
 }
 assert.doesNotMatch(migration,/create\s+table\s+(?:if\s+not\s+exists\s+)?public\./i);
 assert.doesNotMatch(migration,/grant\s+all\s+on/i);
 assert.doesNotMatch(migration,/service_role/i);
});

test('Edge Function is app-only and fails closed without scoped login', () => {
 const src = read('supabase/functions/blindrank-game-api/index.ts');
 assert.match(src,/BLINDRANK_DATABASE_URL/);
 assert.match(src,/identity\?\.username\s*===\s*'blindrank_app'/);
 assert.match(src,/if\(!sql\)return error\('BlindRank room backend awaiting scoped database credential\.'/);
 assert.doesNotMatch(src,/SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|createClient\(/);
});

test('Browser config cannot expose database credentials or pre-enable rooms', () => {
 const config = read('config.js');
 assert.match(config,/window\.BLINDRANK_API_URL\s*=\s*''/);
 assert.doesNotMatch(config.replace(/^\s*\/\/.*$/gm,''),/postgres(?:ql)?:\/\/|service.role.key|password\s*[:=]/i);
});

test('Legacy standalone Supabase migration cannot run on Project Hub', () => {
 const retired = read('supabase/migrations/202610160001_blindrank.sql');
 assert.doesNotMatch(retired,/create\s+table|create\s+function|create\s+extension/i);
});
