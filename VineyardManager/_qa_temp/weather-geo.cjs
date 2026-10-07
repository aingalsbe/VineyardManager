const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  const reqFails = [];
  page.on('response', async (res) => {
    if (res.status() >= 400) reqFails.push({ url: res.url(), status: res.status() });
  });
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
  await page.type('input[type="email"]', 'owner@vineyard.local');
  await page.type('input[type="password"]', 'VineyardDev1!');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2' }),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForFunction(() => document.body.innerText.includes('Vineyard health'), { timeout: 20000 });
  await new Promise(r => setTimeout(r, 1500));

  // Open weather and measure geometry
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b =>
      (b.getAttribute('aria-label') || '').toLowerCase().startsWith('weather'));
    btn.click();
  });
  await new Promise(r => setTimeout(r, 500));

  const geo = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const overlayRoot = dialog?.parentElement; // absolute inset-0 wrapper
    const healthLabel = Array.from(document.querySelectorAll('p,div')).find(el => el.textContent?.trim() === 'Vineyard health');
    const mapArea = document.querySelector('svg') || document.querySelector('[aria-label*="map" i]');
    const nav = document.querySelector('nav') || document.querySelector('aside') || document.querySelector('[class*="sidebar"]');
    const h1 = document.querySelector('h1');
    const r = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { top: Math.round(b.top), left: Math.round(b.left), bottom: Math.round(b.bottom), right: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) };
    };
    // Check if nav/h1 still visible (not covered)
    const navCenter = nav ? (() => { const b = nav.getBoundingClientRect(); return document.elementFromPoint(b.left+10, b.top+10); })() : null;
    const dialogCoversHealth = (() => {
      if (!dialog || !healthLabel) return null;
      const d = dialog.getBoundingClientRect();
      const h = healthLabel.getBoundingClientRect();
      return d.top <= h.top + 5 && d.bottom >= h.bottom - 5;
    })();
    const dialogCoversMap = (() => {
      if (!dialog || !mapArea) return null;
      const d = dialog.getBoundingClientRect();
      const m = mapArea.getBoundingClientRect();
      return d.top <= m.top + 20 && d.bottom >= m.bottom - 20 && d.left <= m.left + 20;
    })();
    // Alert indicator classes in source when alerts.length>0 — inspect button children always
    const btn = Array.from(document.querySelectorAll('button')).find(b =>
      (b.getAttribute('aria-label') || '').toLowerCase().startsWith('weather'));
    return {
      dialog: r(dialog),
      overlayRoot: r(overlayRoot),
      healthLabel: r(healthLabel),
      mapArea: r(mapArea),
      nav: r(nav),
      h1: r(h1),
      dialogCoversHealth,
      dialogCoversMap,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      btnHTML: btn ? btn.innerHTML.slice(0, 300) : null,
      ariaLabel: btn?.getAttribute('aria-label'),
      alertsInPanel: /No alerts|alert/i.test(dialog?.innerText || ''),
      panelSnippet: (dialog?.innerText || '').replace(/\s+/g,' ').slice(0, 250),
    };
  });
  console.log('GEO', JSON.stringify(geo, null, 2));
  await page.screenshot({ path: path.join(__dirname, 'screenshots', '05-weather-geo.png') });

  // Forgot password page
  await page.goto('http://localhost:5173/forgot-password', { waitUntil: 'networkidle2' });
  const fp = await page.evaluate(() => ({ h1: document.querySelector('h1')?.textContent, snip: document.body.innerText.replace(/\s+/g,' ').slice(0,250) }));
  console.log('FORGOT', JSON.stringify(fp));

  // Rows: edit dialog opens?
  await page.goto('http://localhost:5173/rows', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 800));
  const editBtn = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button')).find(el => /^Edit$/i.test(el.textContent.trim()));
    if (b) { b.click(); return true; }
    return false;
  });
  await new Promise(r => setTimeout(r, 500));
  const editDlg = await page.evaluate(() => {
    const t = document.body.innerText;
    return { opened: /Save|Cancel|Variety|Length|Planted/i.test(t) && /Edit row|Row code|code/i.test(t), hasDelete: /Delete row|Remove row/i.test(t), snip: t.replace(/\s+/g,' ').slice(0,300) };
  });
  console.log('ROW_EDIT', JSON.stringify({ editBtn, editDlg }));

  // Tasks complete button
  await page.goto('http://localhost:5173/tasks', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 800));
  const taskUI = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(Boolean);
    const statusy = labels.filter(l => /start|complete|dismiss|progress|not started|acknowledged/i.test(l));
    return { statusy: statusy.slice(0, 20), hasNew: labels.some(l => /new task/i.test(l)), snip: document.body.innerText.replace(/\s+/g,' ').slice(0,300) };
  });
  console.log('TASK_UI', JSON.stringify(taskUI));

  console.log('FAILS', JSON.stringify(reqFails.filter(f => !f.url.includes('favicon')).slice(0, 30)));
  await browser.close();
})();
