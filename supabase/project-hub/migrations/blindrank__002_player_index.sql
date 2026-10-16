-- Hub preflight and BlindRank-only index, avoiding unrelated application changes.
select hub.assert_app_scope('blindrank','blindrank');
create index if not exists blindrank_placements_player_idx on blindrank.placements(player_id);
