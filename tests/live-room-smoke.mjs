import assert from 'node:assert/strict';
const apiUrl='https://nowlwprtcnieihelqjoa.supabase.co/functions/v1/blindrank-game-api';
const players=[];
async function call(action,fields={},token){
 const result=await fetch(apiUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...fields,...(token?{token}:{})}),signal:AbortSignal.timeout(30000)});
 const response=await result.json();
 if(!result.ok||response.error)throw new Error(action+': '+result.status+' '+String(response.error||''));
 return response;
}
const as=(p,action,fields={})=>call(action,{code:p.code,...fields},p.token);
async function room(mode){
 const r=await call('create',{name:'QAHost',avatar:'😎',category:'mixed',mode});
 const p={code:r.room.code,token:r.token,id:r.me.id};players.push(p);return p;
}
async function join(host){
 const r=await call('join',{code:host.code,name:'QAGuest',avatar:'🔥'});
 const p={code:host.code,token:r.token,id:r.me.id};players.push(p);return p;
}
try{
 const status=await fetch(apiUrl+'/health');assert.equal((await status.json()).status,'ready');
 const host=await room('classic'),guest=await join(host);
 await as(guest,'ready',{ready:true});
 let round=await as(host,'start');assert.equal(round.room.status,'playing');
 for(let i=0;i<5;i++){
  const other=await as(guest,'get');assert.equal(round.currentItem,other.currentItem);
  assert(!('items' in other));await Promise.all([as(host,'place',{slot:i}),as(guest,'place',{slot:4-i})]);
  round=await as(host,'get');assert.equal(round.room.reveal_index,i+1);
 }
 assert.equal(round.room.status,'results');assert.equal(round.rankings.length,2);
 assert.equal((await as(host,'next')).room.round_number,2);
 await as(host,'leave');
 assert.equal((await as(guest,'get')).room.host_player_id,guest.id);
 console.log('Classic multiplayer OK');
 const judge=await room('judge'),guesser=await join(judge);
 await as(guesser,'ready',{ready:true});
 assert.equal((await as(judge,'start')).judgeItems.length,5);
 assert(!('judgeItems' in await as(guesser,'get')));
 await as(judge,'judge',{ranking:[0,1,2,3,4]});
 for(let i=0;i<5;i++)await as(guesser,'place',{slot:i});
 const result=await as(guesser,'get');
 assert.equal(result.room.status,'results');
 assert.equal(result.rankings.find(p=>p.id===guesser.id).roundScore,10);
 console.log('Judge multiplayer OK');
}finally{for(const p of players.reverse()){try{await as(p,'leave')}catch{}}}
