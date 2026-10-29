// BUG-068: a slow report for the previous persona must not overwrite the new persona's view.
const { chromium } = require('/home/user/cryptiq/frontend/node_modules/playwright');
const base = process.argv[2] || 'http://127.0.0.1:3220';
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
  let fail = 0; const ok = (c, m) => { console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
  const report = { created_at: '2026-10-29T00:00:00Z', risk_score: 40, risk_level: 'medium', transactions_checked: 5, agents: [], findings: [], verdict: { headline: 'PRIYA-STALE-REPORT', what_is_wrong: 'x', what_to_do: [] }, verdict_source: 'rules', verdict_error: null, demo_threats_present: false };
  await p.goto(base+'/login',{waitUntil:'networkidle'}); await p.getByText('Explore Demo App').first().click(); await p.waitForTimeout(3000);
  await p.route('**/api/security/demo-priya/report', async r => { await new Promise(res => setTimeout(res, 3000)); await r.fulfill({ json: report }); });
  await p.route('**/api/security/demo-arjun/report', r => r.fulfill({ json: null }));
  await p.goto(base+'/evidence-room',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(500);
  await p.getByRole('radio', { name: /Arjun/ }).first().click(); await p.waitForTimeout(4500);
  ok(await p.getByText('PRIYA-STALE-REPORT').count() === 0, 'stale Priya report is not shown for Arjun');
  await b.close(); process.exit(fail?1:0);
})();
