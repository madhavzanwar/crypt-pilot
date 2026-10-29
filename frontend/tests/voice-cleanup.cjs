// BUG-067: leaving the app shell must abort the active recognizer; a second start must cancel the first.
const { chromium } = require('/home/user/cryptiq/frontend/node_modules/playwright');
const base = process.argv[2] || 'http://127.0.0.1:3220';
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ permissions: ['microphone'] })).newPage();
  let fail = 0; const ok = (c, m) => { console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
  await p.addInitScript(() => {
    window.__rec = [];
    window.SpeechRecognition = window.webkitSpeechRecognition = class { constructor(){ this.s='idle'; window.__rec.push(this);} start(){ this.s='listening'; } stop(){ this.s='stopped'; this.onend && this.onend(); } abort(){ this.s='aborted'; } };
  });
  await p.goto(base+'/login',{waitUntil:'networkidle'}); await p.getByText('Explore Demo App').first().click(); await p.waitForTimeout(3000);
  await p.goto(base+'/dashboard',{waitUntil:'networkidle'});
  await p.getByRole('button', { name: /Speak to FinPilot/ }).click(); await p.waitForTimeout(300);
  let st = await p.evaluate(() => window.__rec.map(r => r.s));
  ok(st.length === 1 && st[0] === 'listening', 'mic click starts one recognizer ' + JSON.stringify(st));
  await p.evaluate(() => window.next.router.push('/pay')); await p.waitForURL(/\/pay/); await p.waitForTimeout(800);
  st = await p.evaluate(() => window.__rec.map(r => r.s));
  ok(st[0] === 'aborted', 'recognizer aborted after leaving the app shell ' + JSON.stringify(st));
  await b.close(); process.exit(fail?1:0);
})();
