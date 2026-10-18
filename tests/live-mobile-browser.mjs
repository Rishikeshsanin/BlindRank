import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const SITE = 'https://blindrank-lemon.vercel.app/';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const hostCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const guestCtx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const host = await hostCtx.newPage();
const guest = await guestCtx.newPage();
const errors = [];
for (const page of [host,guest]) {
  page.on('pageerror', e => errors.push(e.message));
  page.setDefaultTimeout(22000);
}
const click = (page,action) => page.locator('[data-action="' + action + '"]:visible').first().click();
const leave = async(page) => {
  const button=page.locator('[data-action="leave-room"]:visible').first();
  if(await button.count()) await button.click();
};
const join = async(roomCode) => {
  await guest.goto(SITE + '?room=' + encodeURIComponent(roomCode),{waitUntil:'domcontentloaded'});
  await guest.locator('#join-name').fill('Smoke Guest');
  await guest.locator('#party-join button[type="submit"]').click();
  await guest.locator('.room-code').waitFor();
  assert.equal((await guest.locator('.room-code').innerText()).trim(),roomCode);
  await click(guest,'toggle-ready');
};
const newRoom = async (mode) => {
  await host.goto(SITE,{waitUntil:'domcontentloaded'});
  await host.locator('.mode-card[data-action="party"]').click();
  await host.locator('#room-name').fill('Smoke Host');
  if(mode==='judge')await host.locator('[data-action="room-mode"][data-mode="judge"]').click();
  await host.locator('#party-create button[type="submit"]').click();
  await host.locator('.room-code').waitFor();
  return (await host.locator('.room-code').innerText()).trim();
};
try {
  await host.goto(SITE,{waitUntil:'domcontentloaded'});
  const endpoint = await host.evaluate(() => window.BLINDRANK_API_URL);
  assert.equal(endpoint,'https://nowlwprtcnieihelqjoa.supabase.co/functions/v1/blindrank-game-api');
  console.log('PASS production endpoint and mobile frontend loaded');

  let code = await newRoom('classic');
  await join(code);
  await click(host,'start-room');
  await host.locator('[data-action="room-place"][data-slot="0"]').waitFor();
  for(let i=0;i<5;i++){
    await host.locator('[data-action="room-place"][data-slot="'+i+'"]').click();
    await guest.locator('[data-action="room-place"][data-slot="'+(4-i)+'"]').click();
    await host.locator('.room-result, .result-hero, [data-action="room-place"][data-slot="'+(i+1)+'"]').first().waitFor({timeout:22000}).catch(()=>{});
  }
  await host.locator('[data-action="next-round"]').waitFor({timeout:30000});
  await guest.locator('.compare-grid').waitFor();
  await click(host,'next-round');
  await host.locator('[data-action="room-place"][data-slot="0"]').waitFor();
  await leave(host);await leave(guest);
  console.log('PASS mobile Classic: create/join/ready/5 turns/reveal/rematch');

  code=await newRoom('judge');
  await join(code);
  await click(host,'start-room');
  await host.locator('[data-action="judge-pick"][data-index="0"]').waitFor();
  for(let i=0;i<5;i++) await host.locator('[data-action="judge-pick"][data-index="'+i+'"]').click();
  await click(host,'submit-judge');
  await guest.locator('[data-action="room-place"][data-slot="0"]').waitFor();
  for(let i=0;i<5;i++){
    await guest.locator('[data-action="room-place"][data-slot="'+i+'"]').click();
    if(i<4)await guest.locator('[data-action="room-place"][data-slot="'+(i+1)+'"]').waitFor();
  }
  await guest.locator('.scoreboard').waitFor({timeout:30000});
  assert.match(await guest.locator('.scoreboard').innerText(),/10/);
  await leave(guest);await leave(host);
  console.log('PASS mobile Judge: hidden picks/5 turns/reveal/score');
  assert.deepEqual(errors,[]);
  console.log('PASS no uncaught browser errors');
} finally {
  await browser.close();
}
