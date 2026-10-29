// BUG-066: unmounting the /pay scanner during the camera permission prompt must stop the stream that arrives later.
const { chromium } = require('/home/user/cryptiq/frontend/node_modules/playwright');
const base = process.argv[2] || 'http://127.0.0.1:3220';
(async () => {
  const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 390, height: 800 } })).newPage();
  let fail = 0; const ok = (c, m) => { console.log((c?'PASS ':'FAIL ')+m); if(!c) fail++; };
  await p.addInitScript(() => {
    window.__tracks = 0; window.__stopped = 0;
    window.BarcodeDetector = class { constructor(){} async detect(){ return []; } };
    const fakeTrack = () => { window.__tracks++; return { stop(){ window.__stopped++; } }; };
    navigator.mediaDevices.getUserMedia = () => new Promise((res) => setTimeout(() => res({ getTracks: () => [fakeTrack()] }), 1500));
  });
  await p.goto(base + '/pay', { waitUntil: 'networkidle' });
  await p.getByText('Scan any QR code').first().click(); await p.waitForTimeout(300);
  await p.getByRole('button', { name: 'Back' }).click();   // unmount while the prompt is "open"
  await p.waitForTimeout(2200);
  const r = await p.evaluate(() => ({ t: window.__tracks, s: window.__stopped }));
  ok(r.t === 1 && r.s === 1, 'stream that arrived after unmount was stopped ' + JSON.stringify(r));
  await b.close(); process.exit(fail?1:0);
})();
