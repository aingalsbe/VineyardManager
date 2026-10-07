const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox'],
    defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
  await page.type('input[type="email"]', 'owner@vineyard.local');
  await page.type('input[type="password"]', 'VineyardDev1!');
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle2' }), page.click('button[type="submit"]')]);
  await page.waitForSelector('svg[aria-label="Vineyard health map"]', { timeout: 20000 });
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b =>
      (b.getAttribute('aria-label') || '').toLowerCase().startsWith('weather'));
    btn.click();
  });
  await new Promise(r => setTimeout(r, 400));
  const geo = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const wrap = dialog?.parentElement;
    const map = document.querySelector('svg[aria-label="Vineyard health map"]');
    const healthBar = Array.from(document.querySelectorAll('p')).find(p => p.textContent?.trim() === 'Vineyard health')?.closest('.rounded-xl, div');
    const h1 = document.querySelector('h1');
    const signOut = Array.from(document.querySelectorAll('button,a')).find(e => /sign out/i.test(e.textContent||''));
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { t:Math.round(b.top), l:Math.round(b.left), b:Math.round(b.bottom), r:Math.round(b.right), w:Math.round(b.width), h:Math.round(b.height) }; };
    const d = r(dialog), m = r(map), w = r(wrap), hb = r(healthBar), title = r(h1), so = r(signOut);
    const covers = (outer, inner) => outer && inner && outer.t <= inner.t + 8 && outer.b >= inner.b - 8 && outer.l <= inner.l + 8 && outer.r >= inner.r - 8;
    // Is sign-out / h1 outside wrap?
    const pointOutside = (rect) => {
      if (!rect || !w) return null;
      return rect.b <= w.t || rect.t >= w.b || rect.r <= w.l || rect.l >= w.r;
    };
    return { dialog:d, wrap:w, map:m, healthBar:hb, h1:title, signOut:so, wrapCoversMap: covers(w,m), wrapCoversHealthBar: covers(w, hb), h1OutsideWrap: pointOutside(title), signOutOutsideWrap: pointOutside(so), wrapVsViewport: w ? { wh: w.h, vh: window.innerHeight, pct: Math.round(100*w.h/window.innerHeight) } : null };
  });
  console.log(JSON.stringify(geo, null, 2));

  // Mark complete one pending task then leave (seed data - pick a task that might already be pending seasonal)
  // Better: don't mutate seed overdue tasks permanently - skip UI mutate
  await browser.close();
})();
