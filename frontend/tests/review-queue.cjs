// BUG-024: review deck must show queue[0] after every review (no skipped cards) and Enter on a button must not confirm.
// Backend responses are mocked in the browser so no data is changed.
const { chromium } = require('/home/user/cryptiq/frontend/node_modules/playwright');
const base = process.argv[2] || 'http://127.0.0.1:3220';
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext()).newPage();
  let fail = 0; const ok = (c, m) => { console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
  const mk = (i) => ({ id: 'q'+i, user_id:'u', account_id:'ACC', date:'2026-10-0'+i, merchant:'Merchant '+i, amount:-100*i, category:'shopping', tags:[], notes:null, review_status:'pending', is_recurring:false });
  let queue = [mk(1), mk(2), mk(3)]; const posted = [];
  await p.goto(base+'/login',{waitUntil:'networkidle'}); await p.getByText('Explore Demo App').first().click(); await p.waitForTimeout(3000);
  await p.route('**/review-queue*', r => r.fulfill({ json: { items: queue, pending_count: queue.length } }));
  await p.route(/\/api\/transactions\/[^/]+\/q\d\/review/, async r => { const id = r.request().url().match(/(q\d)\/review/)[1]; posted.push(id); queue = queue.filter(t => t.id !== id); await r.fulfill({ json: mk(1) }); });
  await p.goto(base+'/transactions',{waitUntil:'networkidle'});
  const title = () => p.locator('h3').filter({ hasText: /^Merchant \d$/ }).first().innerText();
  ok(await title() === 'Merchant 1', 'first card is Merchant 1');
  // Enter while a button (Skip) is focused must NOT confirm
  await p.getByRole('button', { name: /Skip for Now/ }).focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(800);
  ok(posted.length <= 1 && (posted[0] === undefined || posted[0] === 'q1'), 'Enter on focused Skip button only triggers that button once (posted=' + JSON.stringify(posted) + ')');
  await p.waitForTimeout(800);
  const t2 = await title();
  ok(t2 === 'Merchant 2', 'after one review the next card is Merchant 2, not 3 (got ' + t2 + ')');
  await p.getByRole('button', { name: /Confirm Classification|Recategorize/ }).click(); await p.waitForTimeout(1200);
  const t3 = await title(); ok(t3 === 'Merchant 3', 'next card is Merchant 3 (got ' + t3 + ')');
  console.log('posted order', JSON.stringify(posted));
  await b.close(); process.exit(fail?1:0);
})();
