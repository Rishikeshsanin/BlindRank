-- BlindRank isolated schema. Apply ONLY to a dedicated BlindRank Supabase project.
-- Clients must NOT have direct table or RPC access; the Edge Function owns state.
create extension if not exists pgcrypto;

create table if not exists public.br_rooms (
 id uuid primary key default gen_random_uuid(),
 code char(6) not null unique,
 host_player_id uuid,
 mode text not null check(mode in ('classic','judge')),
 category text not null,
 status text not null default 'lobby' check(status in ('lobby','judge_setup','playing','results')),
 round_number int not null default 1 check(round_number between 1 and 999),
 prompt text,
 items jsonb,
 last_pack_id text,
 reveal_index int not null default 0 check(reveal_index between 0 and 5),
 judge_player_id uuid,
 judge_ranking jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 expires_at timestamptz not null default(now()+interval '6 hours'),
 constraint valid_items check (items is null or (jsonb_typeof(items)='array' and jsonb_array_length(items)=5))
);
create table if not exists public.br_players (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.br_rooms(id) on delete cascade,
 name varchar(24) not null,
 avatar varchar(8) not null,
 token_hash char(64) not null unique,
 ready boolean not null default false,
 active boolean not null default true,
 total_score integer not null default 0,
 round_score integer not null default 0,
 joined_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 unique(room_id,name)
);
create table if not exists public.br_placements (
 room_id uuid not null references public.br_rooms(id) on delete cascade,
 round_number int not null,
 player_id uuid not null references public.br_players(id) on delete cascade,
 item_index int not null check(item_index between 0 and 4),
 rank_slot int not null check(rank_slot between 0 and 4),
 placed_at timestamptz not null default now(),
 primary key (room_id,round_number,player_id,item_index),
 unique (room_id,round_number,player_id,rank_slot)
);
create index if not exists br_players_room_active_idx on public.br_players(room_id,active);
create index if not exists br_placements_room_round_idx on public.br_placements(room_id,round_number);
create index if not exists br_rooms_expiry_idx on public.br_rooms(expires_at);

alter table public.br_rooms enable row level security;
alter table public.br_players enable row level security;
alter table public.br_placements enable row level security;
-- No policies: anon/authenticated cannot read, write, or subscribe to raw tables.
revoke all on public.br_rooms, public.br_players, public.br_placements from public, anon, authenticated;
grant all on public.br_rooms, public.br_players, public.br_placements to service_role;

-- Called only by service role: atomically enforce max room size against concurrent joins.
create or replace function public.br_join(p_code text, p_name text, p_avatar text, p_hash text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.br_rooms%rowtype; pid uuid;
begin
 select * into r from br_rooms where code=p_code for update;
 if not found or r.expires_at<=now() then raise exception 'Room not found or expired'; end if;
 if r.status <> 'lobby' then raise exception 'Game already started'; end if;
 if (select count(*) from br_players where room_id=r.id and active)>=12 then raise exception 'Room is full (12 players)'; end if;
 if exists(select 1 from br_players where room_id=r.id and lower(name)=lower(p_name) and active) then raise exception 'Nickname already taken in this room'; end if;
 insert into br_players(room_id,name,avatar,token_hash) values(r.id,p_name,p_avatar,p_hash) returning id into pid;
 return pid;
end; $$;

create or replace function public.br_maybe_advance(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.br_rooms%rowtype; needed int; placed int; player record; i int; j int; a int; b int; ja int; jb int; points int; judge_order int[];
begin
 select * into r from br_rooms where id=p_room for update;
 if not found or r.status<>'playing' or r.reveal_index>=5 then return; end if;
 select count(*) into needed from br_players where room_id=r.id and active and (r.mode<>'judge' or id<>r.judge_player_id);
 if needed=0 then return; end if;
 select count(*) into placed from br_placements p join br_players pl on pl.id=p.player_id
 where p.room_id=r.id and p.round_number=r.round_number and p.item_index=r.reveal_index and pl.active and (r.mode<>'judge' or pl.id<>r.judge_player_id);
 if placed < needed then return; end if;
 if r.reveal_index<4 then
   update br_rooms set reveal_index=reveal_index+1,updated_at=now() where id=r.id;
   return;
 end if;
 if r.mode='judge' then
   select array_agg(value::int order by ordinality) into judge_order
     from jsonb_array_elements_text(r.judge_ranking) with ordinality as t(value,ordinality);
   for player in select id from br_players where room_id=r.id and active and id<>r.judge_player_id loop
     points:=0;
     for i in 0..3 loop
       for j in (i+1)..4 loop
         select rank_slot into a from br_placements where room_id=r.id and round_number=r.round_number and player_id=player.id and item_index=i;
         select rank_slot into b from br_placements where room_id=r.id and round_number=r.round_number and player_id=player.id and item_index=j;
         ja:=array_position(judge_order,i);
         jb:=array_position(judge_order,j);
         if a is not null and b is not null and ja is not null and jb is not null and (a<b)=(ja<jb) then points:=points+1; end if;
       end loop;
     end loop;
     update br_players set round_score=points,total_score=total_score+points where id=player.id;
   end loop;
 end if;
 update br_rooms set reveal_index=5,status='results',updated_at=now() where id=r.id;
end; $$;

-- Server-authoritative placement; room row lock serializes simultaneous players.
create or replace function public.br_place(p_room uuid,p_player uuid,p_slot int)
returns void language plpgsql security definer set search_path = public as $$
declare r public.br_rooms%rowtype; pl public.br_players%rowtype;
begin
 select * into r from br_rooms where id=p_room for update;
 if not found or r.status<>'playing' then raise exception 'Round is not accepting rankings'; end if;
 select * into pl from br_players where id=p_player and room_id=r.id and active;
 if not found then raise exception 'Player not in room'; end if;
 if r.mode='judge' and r.judge_player_id=p_player then raise exception 'The Judge does not rank blindly'; end if;
 if p_slot<0 or p_slot>4 then raise exception 'Invalid slot'; end if;
 if exists(select 1 from br_placements where room_id=r.id and round_number=r.round_number and player_id=p_player and item_index=r.reveal_index) then raise exception 'You already ranked this item'; end if;
 if exists(select 1 from br_placements where room_id=r.id and round_number=r.round_number and player_id=p_player and rank_slot=p_slot) then raise exception 'Slot is already locked'; end if;
 insert into br_placements(room_id,round_number,player_id,item_index,rank_slot)
 values(r.id,r.round_number,p_player,r.reveal_index,p_slot);
 perform br_maybe_advance(r.id);
end; $$;

create or replace function public.br_depart(p_room uuid,p_player uuid,p_kick boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare r public.br_rooms%rowtype; next_host uuid;
begin
 select * into r from br_rooms where id=p_room for update;
 if not found then return; end if;
 update br_players set active=false,ready=false where id=p_player and room_id=r.id;
 if not exists(select 1 from br_players where room_id=r.id and active) then delete from br_rooms where id=r.id; return; end if;
 if r.host_player_id=p_player then
   select id into next_host from br_players where room_id=r.id and active order by joined_at,id limit 1;
   update br_rooms set host_player_id=next_host,updated_at=now() where id=r.id;
 end if;
 if r.mode='judge' and r.judge_player_id=p_player and r.status in ('judge_setup','playing') then
   delete from br_placements where room_id=r.id and round_number=r.round_number;
   update br_rooms set status='lobby',reveal_index=0,judge_ranking=null,judge_player_id=null,updated_at=now() where id=r.id;
   update br_players set ready=false,round_score=0 where room_id=r.id and active;
 elsif r.status='playing' then
   perform br_maybe_advance(r.id);
 end if;
end; $$;

revoke all on function public.br_join(text,text,text,text), public.br_place(uuid,uuid,int), public.br_maybe_advance(uuid), public.br_depart(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.br_join(text,text,text,text), public.br_place(uuid,uuid,int), public.br_maybe_advance(uuid), public.br_depart(uuid,uuid,boolean) to service_role;
