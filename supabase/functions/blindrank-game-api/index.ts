import postgres from 'npm:postgres@3.4.5';
import { categories } from './data.js';

// Project Hub: BlindRank-only database login; no service_role/admin credentials.
const uri = Deno.env.get('BLINDRANK_DATABASE_URL');
const sql = uri ? postgres(uri, { ssl: 'require', prepare: false, max: 2, idle_timeout: 10 }) : null;
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'cache-control': 'no-store',
};
const avatars = new Set(['😎','🔥','🦊','🐼','👻','⚡','🦄','🐸']);
const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const result=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'content-type':'application/json'}});
const error=(message:string,status=400)=>result({error:message},status);
function random(n:number){const lim=Math.floor(2**32/n)*n;let v:number;do{v=crypto.getRandomValues(new Uint32Array(1))[0]}while(v>=lim);return v%n}
const code=()=>Array.from({length:6},()=>chars[random(chars.length)]).join('');
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),v=>v.toString(16).padStart(2,'0')).join('');
const name=(x:unknown)=>{if(typeof x!=='string'||x.trim().length<2||x.trim().length>24)throw Error('Nickname must be 2–24 characters.');return x.trim()};
const avatar=(x:unknown)=>avatars.has(String(x))?String(x):'😎';
const roomCode=(x:unknown)=>{const v=String(x??'').trim().toUpperCase();if(!/^[A-Z0-9]{6}$/.test(v))throw Error('Invalid room code.');return v};
const packList=categories.flatMap(c=>c.packs.map((p,i)=>({...p,id:`${c.id}-${i}`,category:c.id})));
function nextPack(category:string,previous=''){
  const list=packList.filter(p=>category==='mixed'||p.category===category);
  if(!list.length)throw Error('Unknown category.');
  const fresh=list.filter(p=>p.id!==previous),pool=fresh.length?fresh:list,p=pool[random(pool.length)];
  const items=[...p.items];
  for(let i=items.length-1;i>0;i--){const j=random(i+1);[items[i],items[j]]=[items[j],items[i]]}
  return {...p,items};
}
async function getRoom(v:string){
  const rows=await sql!`select * from blindrank.rooms where code=${v} and expires_at>now() limit 1`;
  if(!rows.length)throw Error('Room not found or expired.');
  return rows[0];
}
async function getPlayer(room:any,v:unknown){
  if(typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))throw Error('Invalid player token.');
  const secret=await hash(v);
  const rows=await sql!`select * from blindrank.players where room_id=${room.id} and token_hash=${secret} and active=true limit 1`;
  if(!rows.length)throw Error('Invalid token or player removed.');
  return rows[0];
}
async function snapshot(code:string,secret:string){
  const room=await getRoom(code),me=await getPlayer(room,secret);
  if(Date.now()-new Date(me.last_seen_at).getTime()>15000)
    await sql!`update blindrank.players set last_seen_at=now() where id=${me.id}`;
  const people=await sql!`select id,name,avatar,ready,active,total_score,round_score from blindrank.players where room_id=${room.id} and active=true order by joined_at,id`;
  const r:any={room:{code:room.code,mode:room.mode,category:room.category,status:room.status,round_number:room.round_number,host_player_id:room.host_player_id,judge_player_id:room.judge_player_id,reveal_index:room.reveal_index,prompt:room.status==='lobby'?'':room.prompt},
  players:people.map(p=>({id:p.id,name:p.name,avatar:p.avatar,ready:p.ready,active:p.active,score:p.total_score,roundScore:p.round_score})),
  me:{id:me.id,name:me.name,avatar:me.avatar,ready:me.ready}};
  const items:string[]=Array.isArray(room.items)?room.items:[];
  if(room.status==='judge_setup'&&room.judge_player_id===me.id)r.judgeItems=items;
  if(room.status==='playing'){
    if(room.mode!=='judge'||room.judge_player_id!==me.id)r.currentItem=items[room.reveal_index]||null;
    const placed=await sql!`select item_index,rank_slot from blindrank.placements where room_id=${room.id} and round_number=${room.round_number} and player_id=${me.id}`;
    r.myPlacements=Array(5).fill(null);
    for(const p of placed)r.myPlacements[p.rank_slot]=items[p.item_index]||null;
  }
  if(room.status==='results'){
    const placed=await sql!`select player_id,item_index,rank_slot from blindrank.placements where room_id=${room.id} and round_number=${room.round_number}`;
    r.rankings=people.filter(p=>room.mode!=='judge'||p.id!==room.judge_player_id).map(p=>{
      const ranking=Array(5).fill(null);
      for(const row of placed.filter(x=>x.player_id===p.id))ranking[row.rank_slot]=items[row.item_index]||null;
      return {id:p.id,name:p.name,avatar:p.avatar,roundScore:p.round_score,ranking};
    });
    if(room.mode==='judge'&&Array.isArray(room.judge_ranking))r.judgeItemsRanked=room.judge_ranking.map((i:number)=>items[i]);
  }
  return r;
}
async function create(body:any){
  const nick=name(body.name),face=avatar(body.avatar),category=String(body.category||''),mode=String(body.mode||'classic');
  if(!categories.some(c=>c.id===category))throw Error('Unknown category.');
  if(!['classic','judge'].includes(mode))throw Error('Unknown game mode.');
  const secret=token(),secretHash=await hash(secret);
  await sql!`delete from blindrank.rooms where expires_at<now()`;
  for(let i=0;i<5;i++){
    const roomCode=code();
    try{
      await sql!.begin(async tx=>{
        const [r]=await tx`insert into blindrank.rooms(code,category,mode) values(${roomCode},${category},${mode}) returning id`;
        const [p]=await tx`insert into blindrank.players(room_id,name,avatar,token_hash,ready) values(${r.id},${nick},${face},${secretHash},true) returning id`;
        await tx`update blindrank.rooms set host_player_id=${p.id} where id=${r.id}`;
      });
      return {...await snapshot(roomCode,secret),token:secret};
    }catch(e){if((e as any)?.code!=='23505'||i===4)throw e}
  }
  throw Error('Could not create room. Retry.');
}
async function join(body:any){
  const room=roomCode(body.code),nick=name(body.name),face=avatar(body.avatar),secret=token(),secretHash=await hash(secret);
  await sql!`select blindrank.join_room(${room}::text,${nick}::text,${face}::text,${secretHash}::text)`;
  return {...await snapshot(room,secret),token:secret};
}
async function act(body:any){
  const cmd=String(body.action||'');
  if(cmd==='create')return create(body);
  if(cmd==='join')return join(body);
  const roomId=roomCode(body.code),room=await getRoom(roomId),me=await getPlayer(room,body.token),secret=String(body.token),host=room.host_player_id===me.id;
  if(cmd==='get')return snapshot(roomId,secret);
  if(cmd==='ready'){
    if(room.status!=='lobby')throw Error('Cannot change ready state after starting.');
    if(host&&body.ready!==true)throw Error('Host must remain ready.');
    await sql!`update blindrank.players set ready=${body.ready===true} where id=${me.id} and room_id=${room.id} and active=true`;
  }else if(cmd==='start'){
    if(!host)throw Error('Only host can start.');
    await sql!.begin(async tx=>{
      const [locked]=await tx`select * from blindrank.rooms where id=${room.id} for update`;
      if(!locked||locked.status!=='lobby'||locked.host_player_id!==me.id)throw Error('Room already started.');
      const people=await tx`select id,ready from blindrank.players where room_id=${room.id} and active=true`;
      if(people.length<2)throw Error('Invite at least two players.');
      if(people.some(p=>!p.ready))throw Error('Everyone must be ready.');
      const pack=nextPack(locked.category,locked.last_pack_id||'');
      await tx`update blindrank.rooms set status=${locked.mode==='judge'?'judge_setup':'playing'},prompt=${pack.prompt},items=${tx.json(pack.items)},last_pack_id=${pack.id},judge_player_id=${locked.mode==='judge'?locked.host_player_id:null},judge_ranking=null,reveal_index=0,updated_at=now() where id=${room.id}`;
    });
  }else if(cmd==='judge'){
    if(room.status!=='judge_setup'||room.judge_player_id!==me.id)throw Error('Only current Judge can submit.');
    const arr=body.ranking;
    if(!Array.isArray(arr)||arr.length!==5||new Set(arr).size!==5||arr.some((x:any)=>!Number.isInteger(x)||x<0||x>4))throw Error('Ranking must contain five distinct items.');
    const rows=await sql!`update blindrank.rooms set judge_ranking=${sql!.json(arr)},status='playing',reveal_index=0,updated_at=now() where id=${room.id} and status='judge_setup' and judge_player_id=${me.id} returning id`;
    if(!rows.length)throw Error('Judge ranking already submitted.');
  }else if(cmd==='place'){
    const slot=body.slot;
    if(!Number.isInteger(slot)||slot<0||slot>4)throw Error('Invalid slot.');
    await sql!`select blindrank.place(${room.id}::uuid,${me.id}::uuid,${slot}::int)`;
  }else if(cmd==='next'){
    if(!host)throw Error('Only host can continue.');
    await sql!.begin(async tx=>{
      const [locked]=await tx`select * from blindrank.rooms where id=${room.id} for update`;
      if(!locked||locked.status!=='results')throw Error('Finish the round first.');
      if(locked.round_number>=999)throw Error('Session reached round limit.');
      const people=await tx`select id from blindrank.players where room_id=${room.id} and active=true order by joined_at,id`;
      if(people.length<2)throw Error('Not enough players left.');
      const pack=nextPack(locked.category,locked.last_pack_id||'');
      const previous=people.findIndex(p=>p.id===locked.judge_player_id);
      const judge=locked.mode==='judge'?people[previous<0?0:(previous+1)%people.length].id:null;
      await tx`update blindrank.players set round_score=0 where room_id=${room.id}`;
      await tx`update blindrank.rooms set status=${locked.mode==='judge'?'judge_setup':'playing'},round_number=${locked.round_number+1},prompt=${pack.prompt},items=${tx.json(pack.items)},last_pack_id=${pack.id},reveal_index=0,judge_player_id=${judge},judge_ranking=null,updated_at=now() where id=${room.id}`;
    });
  }else if(cmd==='kick'){
    if(!host)throw Error('Only host can remove players.');
    if(room.status==='results')throw Error('Cannot kick during results.');
    const target=String(body.player_id||'');
    if(target===me.id)throw Error('Use Leave Room for yourself.');
    const [player]=await sql!`select id from blindrank.players where id=${target}::uuid and room_id=${room.id} and active=true limit 1`;
    if(!player)throw Error('Player not in room.');
    await sql!`select blindrank.depart(${room.id}::uuid,${target}::uuid,${true}::boolean)`;
  }else if(cmd==='leave'){
    await sql!`select blindrank.depart(${room.id}::uuid,${me.id}::uuid,${false}::boolean)`;
    return {ok:true};
  }else throw Error('Unknown action.');
  return snapshot(roomId,secret);
}
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return error('POST required.',405);
  if(!sql)return error('BlindRank room backend awaiting scoped database credential.',503);
  if(Number(req.headers.get('content-length')||0)>10000)return error('Request too large.',413);
  if(!(req.headers.get('content-type')||'').includes('application/json'))return error('JSON required.',415);
  try{
    const body=await req.json();
    if(!body||typeof body!=='object'||Array.isArray(body))return error('Invalid request.');
    return result(await act(body));
  }catch(e){
    const raw=e instanceof Error?e.message:'';
    // Never disclose DB stack traces, connection details or credentials.
    const approved=/^(Nickname|Unknown category|Unknown game|Invalid room code|Room not found|Invalid player token|Invalid token|Room is full|Nickname already taken|Game already started|Could not create room|Cannot change ready|Host must remain ready|Only host|Room already started|Invite at least two|Everyone must be ready|Only current Judge|Ranking must contain|Judge ranking already|Invalid slot|You already ranked|Slot is already locked|Round is not accepting|The Judge does not|Finish the round|Session reached|Not enough players|Cannot kick|Use Leave Room|Player not in room|Unknown action)/.test(raw);
    const msg=approved&&raw.length<160?raw:'Could not complete that action. Please retry.';
    return error(msg,/token|removed/i.test(msg)?401:/not found|expired/i.test(msg)?404:400);
  }
});
