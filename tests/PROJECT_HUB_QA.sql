-- Run only after reading BlindRank AGENTS.md, SUPABASE_HUB_RULES.md and hub.read_me_first.
-- BlindRank-only, self-cleaning database smoke test. A failure rolls back this DO block.
do $qa$
declare
 r uuid; jr uuid; host uuid; judge uuid; best uuid; worst uuid; p uuid;
 players uuid[]:='{}'::uuid[]; i int; k int; pts int; step int; status_name text; rejected bool;
 code1 text:='QA'||upper(substr(encode(gen_random_bytes(3),'hex'),1,4));
 code2 text:='QB'||upper(substr(encode(gen_random_bytes(3),'hex'),1,4));
begin
 perform hub.assert_app_scope('blindrank','blindrank');
 insert into blindrank.rooms(code,category,mode,status,items,prompt)
 values(code1,'mixed','classic','lobby','["A","B","C","D","E"]'::jsonb,'QA classic')
 returning id into r;
 insert into blindrank.players(room_id,name,avatar,token_hash,ready)
 values(r,'QA host','😎',encode(gen_random_bytes(32),'hex'),true) returning id into host;
 update blindrank.rooms set host_player_id=host where id=r;
 players:=array_append(players,host);
 for i in 2..12 loop
  select blindrank.join_room(code1,'QA guest '||i,'😎',encode(gen_random_bytes(32),'hex')) into p;
  players:=array_append(players,p);
 end loop;
 rejected:=false;
 begin perform blindrank.join_room(code1,'QA guest 13','😎',encode(gen_random_bytes(32),'hex'));
 exception when others then
  if position('Room is full' in sqlerrm)>0 then rejected:=true; else raise; end if;
 end;
 if not rejected then raise exception '13th player was accepted'; end if;
 update blindrank.rooms set status='playing' where id=r;
 perform blindrank.place(r,host,0);
 rejected:=false;
 begin perform blindrank.place(r,host,1);
 exception when others then
  if position('already ranked' in sqlerrm)>0 then rejected:=true; else raise; end if;
 end;
 if not rejected then raise exception 'duplicate placement was accepted'; end if;
 select reveal_index into step from blindrank.rooms where id=r;
 if step<>0 then raise exception 'next item revealed too early'; end if;
 for k in 0..4 loop
  for i in 1..12 loop
   if k=0 and i=1 then continue; end if;
   perform blindrank.place(r,players[i],k);
  end loop;
 end loop;
 select status,reveal_index into status_name,step from blindrank.rooms where id=r;
 if status_name<>'results' or step<>5 then raise exception 'Classic game did not complete'; end if;
 perform blindrank.depart(r,host,false);
 select host_player_id into p from blindrank.rooms where id=r;
 if p is null or p=host or not (p=any(players)) then raise exception 'Host transfer failed'; end if;

 insert into blindrank.rooms(code,category,mode,status,items,prompt,judge_ranking)
 values(code2,'mixed','judge','playing','["A","B","C","D","E"]'::jsonb,'QA judge','[0,1,2,3,4]'::jsonb)
 returning id into jr;
 insert into blindrank.players(room_id,name,avatar,token_hash,ready)
 values(jr,'QA judge','😎',encode(gen_random_bytes(32),'hex'),true) returning id into judge;
 update blindrank.rooms set judge_player_id=judge,host_player_id=judge where id=jr;
 insert into blindrank.players(room_id,name,avatar,token_hash,ready)
 values(jr,'QA perfect','😎',encode(gen_random_bytes(32),'hex'),true) returning id into best;
 insert into blindrank.players(room_id,name,avatar,token_hash,ready)
 values(jr,'QA reverse','😎',encode(gen_random_bytes(32),'hex'),true) returning id into worst;
 for k in 0..4 loop
  perform blindrank.place(jr,best,k);
  perform blindrank.place(jr,worst,4-k);
 end loop;
 select total_score into pts from blindrank.players where id=best;
 if pts<>10 then raise exception 'Perfect ranking should score 10: %',pts; end if;
 select total_score into pts from blindrank.players where id=worst;
 if pts<>0 then raise exception 'Reverse ranking should score 0: %',pts; end if;
 if (select status from blindrank.rooms where id=jr)<>'results' then raise exception 'Judge round did not complete'; end if;
 delete from blindrank.rooms where id in(r,jr);
end
$qa$;