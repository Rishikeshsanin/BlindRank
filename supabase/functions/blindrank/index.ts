// Dedicated BlindRank room server. Deploy with --no-verify-jwt:
// players authenticate using unguessable, SHA-256-hashed per-room tokens.
// SUPABASE_SERVICE_ROLE_KEY stays only in the Edge Function environment.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { categories } from './data.js';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'cache-control': 'no-store',
};
const emojis = new Set(['😎', '🔥', '🦊', '🐼', '👻', '⚡', '🦄', '🐸']);
const idChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ok = (data: unknown, status=200) => new Response(JSON.stringify(data), {status, headers:{...cors,'content-type':'application/json; charset=utf-8'}});
const fail = (message:string,status=400)=>ok({error:message},status);
const rnd = (n:number) => {const b=crypto.getRandomValues(new Uint32Array(1))[0];return b%n;};
const newCode=()=>Array.from({length:6},()=>idChars[rnd(idChars.length)]).join('');
const newToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
const hashToken=async(token:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),x=>x.toString(16).padStart(2,'0')).join('');
const checkName=(n:unknown):string=>{if(typeof n!=='string'||n.trim().length<2||n.trim().length>24)throw Error('Nickname must be 2–24 characters.');return n.trim();};
const checkAvatar=(a:unknown):string=>emojis.has(String(a))?String(a):'😎';
const checkRoomCode=(s:unknown)=>{const code=String(s||'').toUpperCase();if(!/^[A-Z0-9]{6}$/.test(code))throw Error('Invalid room code.');return code;};
const throwDb=(x:any)=>{if(x.error)throw Error(String(x.error.message||'Database action failed.').slice(0,250));return x.data;};
const shuffle=<T>(a:T[]):T[]=>{const b=[...a];for(let i=b.length-1;i>0;i--){const j=rnd(i+1);[b[i],b[j]]=[b[j],b[i]];}return b;};
const allPacks=categories.flatMap(cat=>cat.packs.map((pack,i)=>({...pack,id:`${cat.id}-${i}`,category:cat.id})));
const choosePack=(category:string,exclude:string='')=>{
  const eligible=allPacks.filter(p=>category==='mixed'||p.category===category);
  if(!eligible.length)throw Error('Invalid category.');
  const pool=eligible.filter(p=>p.id!==exclude);
  const chosen=(pool.length?pool:eligible)[rnd((pool.length?pool:eligible).length)];
  return {...chosen, items:shuffle(chosen.items)};
};
async function roomForCode(code:string){const room=throwDb(await db.from('br_rooms').select('*').eq('code',code).maybeSingle());if(!room||Date.parse(room.expires_at)<=Date.now())throw Error('Room not found or expired.');return room;}
async function actorForRoom(room:any,token:unknown){if(typeof token!=='string'||!(/^[a-f0-9]{64}$/.test(token)))throw Error('Invalid player token.');const hash=await hashToken(token);const actor=throwDb(await db.from('br_players').select('*').eq('room_id',room.id).eq('token_hash',hash).eq('active',true).maybeSingle());if(!actor)throw Error('Invalid token or player removed.');return actor;}
async function snapshot(roomCode:string,token:string){const room=await roomForCode(roomCode),me=await actorForRoom(room,token);
  if(Date.now()-Date.parse(me.last_seen_at)>15000)await db.from('br_players').update({last_seen_at:new Date().toISOString()}).eq('id',me.id);
  const players=throwDb(await db.from('br_players').select('id,name,avatar,ready,active,total_score,round_score,joined_at').eq('room_id',room.id).eq('active',true).order('joined_at'));
  const publicRoom={code:room.code,mode:room.mode,category:room.category,status:room.status,round_number:room.round_number,host_player_id:room.host_player_id,judge_player_id:room.judge_player_id,reveal_index:room.reveal_index,prompt:room.status==='lobby'?'':room.prompt};
  const answer:any={room:publicRoom,players:players.map((p:any)=>({id:p.id,name:p.name,avatar:p.avatar,ready:p.ready,active:p.active,score:p.total_score,roundScore:p.round_score})),me:{id:me.id,name:me.name,avatar:me.avatar,ready:me.ready}};
  const items:Array<string>=Array.isArray(room.items)?room.items:[];
  if(room.status==='judge_setup'&&room.judge_player_id===me.id)answer.judgeItems=items;
  if(room.status==='playing'){
    if(room.mode!=='judge'||room.judge_player_id!==me.id)answer.currentItem=items[room.reveal_index]||null;
    const placements=throwDb(await db.from('br_placements').select('item_index,rank_slot').eq('room_id',room.id).eq('round_number',room.round_number).eq('player_id',me.id));
    answer.myPlacements=Array(5).fill(null);
    for(const p of placements)answer.myPlacements[p.rank_slot]=items[p.item_index]||null;
  }
  if(room.status==='results'){
    const rows=throwDb(await db.from('br_placements').select('player_id,item_index,rank_slot').eq('room_id',room.id).eq('round_number',room.round_number));
    answer.rankings=players.filter((p:any)=>room.mode!=='judge'||p.id!==room.judge_player_id).map((p:any)=>{
      const ranking=Array(5).fill(null);
      for(const row of rows.filter((v:any)=>v.player_id===p.id))ranking[row.rank_slot]=items[row.item_index]||null;
      return {id:p.id,name:p.name,avatar:p.avatar,roundScore:p.round_score,ranking};
    });
    if(room.mode==='judge'&&Array.isArray(room.judge_ranking))answer.judgeItemsRanked=room.judge_ranking.map((idx:number)=>items[idx]);
  }
  return answer;
}
async function create(body:any){const name=checkName(body.name),avatar=checkAvatar(body.avatar),category=String(body.category||''),mode=String(body.mode||'classic');if(!categories.some(c=>c.id===category))throw Error('Unknown category.');if(!['classic','judge'].includes(mode))throw Error('Unknown game mode.');
  await db.from('br_rooms').delete().lt('expires_at',new Date().toISOString());
  let room:any=null;
  for(let i=0;i<5;i++){
    const created=await db.from('br_rooms').insert({code:newCode(),category,mode}).select('*').single();
    if(!created.error){room=created.data;break;}if(created.error.code!=='23505')throwDb(created);
  }
  if(!room)throw Error('Could not reserve a room code. Retry.');
  const token=newToken(),token_hash=await hashToken(token);
  const player=await db.from('br_players').insert({room_id:room.id,name,avatar,token_hash,ready:true}).select('id').single();
  if(player.error){await db.from('br_rooms').delete().eq('id',room.id);throwDb(player);}
  throwDb(await db.from('br_rooms').update({host_player_id:player.data.id}).eq('id',room.id));
  return {...await snapshot(room.code,token),token};
}
async function join(body:any){const code=checkRoomCode(body.code),name=checkName(body.name),avatar=checkAvatar(body.avatar),token=newToken(),hash=await hashToken(token);
  throwDb(await db.rpc('br_join',{p_code:code,p_name:name,p_avatar:avatar,p_hash:hash}));
  return {...await snapshot(code,token),token};
}
async function action(body:any){const cmd=String(body.action||'');if(cmd==='create')return create(body);if(cmd==='join')return join(body);
  const code=checkRoomCode(body.code),room=await roomForCode(code),actor=await actorForRoom(room,body.token),token=String(body.token),isHost=actor.id===room.host_player_id;
  if(cmd==='get')return snapshot(code,token);
  if(cmd==='ready'){
    if(room.status!=='lobby')throw Error('Cannot change ready state after starting.');
    if(isHost&&!body.ready)throw Error('Host must remain ready.');
    throwDb(await db.from('br_players').update({ready:body.ready===true}).eq('id',actor.id));
  }else if(cmd==='start'){
    if(!isHost)throw Error('Only the host can start.');if(room.status!=='lobby')throw Error('Not in lobby.');
    const ps=throwDb(await db.from('br_players').select('id,ready').eq('room_id',room.id).eq('active',true));
    if(ps.length<2)throw Error('Invite at least two players.');if(ps.some((p:any)=>!p.ready))throw Error('Everyone must be ready.');
    const pack=choosePack(room.category,room.last_pack_id||'');
    const next={status:room.mode==='judge'?'judge_setup':'playing',prompt:pack.prompt,items:pack.items,last_pack_id:pack.id,reveal_index:0,judge_player_id:room.mode==='judge'?room.host_player_id:null,judge_ranking:null,updated_at:new Date().toISOString()};
    throwDb(await db.from('br_rooms').update(next).eq('id',room.id).eq('status','lobby'));
  }else if(cmd==='judge'){
    if(room.status!=='judge_setup'||room.judge_player_id!==actor.id)throw Error('Only the current Judge can submit.');
    const arr=body.ranking;if(!Array.isArray(arr)||arr.length!==5||new Set(arr).size!==5||arr.some((v:any)=>!Number.isInteger(v)||v<0||v>4))throw Error('Ranking must contain all five distinct items.');
    throwDb(await db.from('br_rooms').update({judge_ranking:arr,status:'playing',reveal_index:0,updated_at:new Date().toISOString()}).eq('id',room.id).eq('status','judge_setup'));
  }else if(cmd==='place'){
    const slot=body.slot;if(!Number.isInteger(slot)||slot<0||slot>4)throw Error('Choose a valid ranking slot.');
    throwDb(await db.rpc('br_place',{p_room:room.id,p_player:actor.id,p_slot:slot}));
  }else if(cmd==='next'){
    if(!isHost)throw Error('Only the host can continue.');if(room.status!=='results')throw Error('Finish this round first.');
    if(room.round_number>=999)throw Error('Session reached its round limit. Create a new room.');
    const ps=throwDb(await db.from('br_players').select('id,joined_at').eq('room_id',room.id).eq('active',true).order('joined_at'));
    if(ps.length<2)throw Error('Not enough players left.');
    const pack=choosePack(room.category,room.last_pack_id||'');
    const lastIndex=ps.findIndex((p:any)=>p.id===room.judge_player_id);
    const nextJudge=room.mode==='judge'?ps[lastIndex<0?0:(lastIndex+1)%ps.length].id:null;
    throwDb(await db.from('br_players').update({round_score:0}).eq('room_id',room.id));
    throwDb(await db.from('br_rooms').update({status:room.mode==='judge'?'judge_setup':'playing',round_number:room.round_number+1,prompt:pack.prompt,items:pack.items,last_pack_id:pack.id,reveal_index:0,judge_player_id:nextJudge,judge_ranking:null,updated_at:new Date().toISOString()}).eq('id',room.id).eq('status','results'));
  }else if(cmd==='kick'){
    if(!isHost)throw Error('Only the host can remove players.');
    if(room.status==='results')throw Error('Cannot kick during results.');
    const target=String(body.player_id||'');if(target===actor.id)throw Error('Use Leave Room for yourself.');
    const p=throwDb(await db.from('br_players').select('id').eq('id',target).eq('room_id',room.id).eq('active',true).maybeSingle());
    if(!p)throw Error('Player no longer in this room.');
    throwDb(await db.rpc('br_depart',{p_room:room.id,p_player:target,p_kick:true}));
  }else if(cmd==='leave'){
    throwDb(await db.rpc('br_depart',{p_room:room.id,p_player:actor.id}));
    return {ok:true};
  }else throw Error('Unknown action.');
  return snapshot(code,token);
}
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  if(req.method!=='POST')return fail('POST required.',405);
  try{
    const contentType=req.headers.get('content-type')||'';if(!contentType.includes('application/json'))return fail('JSON required.',415);
    const size=Number(req.headers.get('content-length')||0);if(size>10000)return fail('Request is too large.',413);
    const body=await req.json();if(!body||typeof body!=='object'||Array.isArray(body))return fail('Invalid request.');
    const result=await action(body);return ok(result);
  }catch(e){const message=e instanceof Error?e.message:'Unexpected server error.';
    const auth=/token|removed/i.test(message);const notFound=/not found|expired/i.test(message);
    return fail(message,auth?401:notFound?404:400);
  }
});
