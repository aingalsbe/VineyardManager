const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:5173';
const OUT = path.join(__dirname, 'screenshots');
const report = [];
const log = (s) => { report.push(s); console.log(s); };

async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function login(page, email, password) {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle2', timeout: 30000 });
  await page.waitForSelector('input[type="email"], input[name="email"], #email', { timeout: 10000 });
  const emailSel = await page.$('input[type="email"]') || await page.$('input[name="email"]') || await page.$('#email');
  const passSel = await page.$('input[type="password"]') || await page.$('input[name="password"]') || await page.$('#password');
  await emailSel.click({ clickCount: 3 });
  await emailSel.type(email);
  await passSel.click({ clickCount: 3 });
  await passSel.type(password);
  // submit
  const submit = await page.$('button[type="submit"]');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => null),
    submit.click(),
  ]);
  await wait(800);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    args: ['--no-sandbox', '--window-size=1400,900'],
    defaultViewport: { width: 1400, height: 900 },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);

  // Capture console errors
  const consoleErrs = [];
  page.on('pageerror', e => consoleErrs.push(String(e)));
  page.on('console', msg => { if (msg.type() === 'error') consoleErrs.push(msg.text()); });

  try {
    // --- Auth wrong password ---
    await page.goto(BASE + '/login', { waitUntil: 'networkidle2' });
    await page.waitForSelector('input[type="password"]');
    const email1 = await page.$('input[type="email"]') || await page.$('input[name="email"]');
    const pass1 = await page.$('input[type="password"]');
    await email1.type('owner@vineyard.local');
    await pass1.type('WrongPass!');
    await (await page.$('button[type="submit"]')).click();
    await wait(1200);
    const badText = await page.evaluate(() => document.body.innerText);
    const badStay = page.url().includes('login');
    log(`AUTH_WRONG: stayOnLogin=${badStay} hasErrorHint=${/invalid|incorrect|wrong|unauthorized|password/i.test(badText)}`);
    await page.screenshot({ path: path.join(OUT, '01-bad-login.png') });

    // --- Manager login ---
    await login(page, 'owner@vineyard.local', 'VineyardDev1!');
    const afterLogin = page.url();
    log(`AUTH_LOGIN: url=${afterLogin} ok=${!afterLogin.includes('login')}`);
    await page.screenshot({ path: path.join(OUT, '02-dashboard.png'), fullPage: true });

    // Wait for dashboard content
    await page.waitForFunction(() => {
      const t = document.body.innerText;
      return t.includes('Dashboard') || t.includes('Vineyard health') || t.includes('Could not load');
    }, { timeout: 20000 });
    await wait(1500); // weather load

    // === WEATHER UI 1-6 ===
    const weatherProbe = await page.evaluate(() => {
      const body = document.body.innerText;
      // Old WeatherCard markers in main scroll (title patterns that were card-level)
      const hasOldCardTitle = Array.from(document.querySelectorAll('h2,h3,.card')).some(el => {
        const t = (el.textContent || '').trim();
        return /^Weather$/i.test(t) && !el.closest('[role="dialog"]');
      });
      // CloudSun button - aria-label starts with Weather
      const btn = Array.from(document.querySelectorAll('button')).find(b =>
        (b.getAttribute('aria-label') || '').toLowerCase().startsWith('weather')
      );
      const healthChrome = Array.from(document.querySelectorAll('*')).find(el =>
        (el.textContent || '').includes('Vineyard health') && el.children.length > 0
      );
      const legend = body.includes('green') || body.includes('Health') || !!document.querySelector('[class*="legend"]');
      // rain check button?
      const rainBtn = Array.from(document.querySelectorAll('button,a')).some(el =>
        /rain\s*check|daily\s*check|run\s*rain/i.test(el.textContent || '')
      );
      // health score visible
      const healthScore = /Vineyard health/i.test(body) && /\b(green|yellow|orange|red)\b/i.test(body);
      return {
        hasOldCardTitle,
        weatherBtnLabel: btn ? btn.getAttribute('aria-label') : null,
        weatherBtnExists: !!btn,
        bodyHasWeatherWordInScroll: /Current conditions|7-day|Feels like/i.test(body) && !document.querySelector('[role="dialog"]'),
        rainBtn,
        healthScore,
        healthSnippet: body.slice(0, 400),
      };
    });
    log(`WX1_no_scroll_card: oldCard=${weatherProbe.hasOldCardTitle} readyContentInScrollWithoutDialog=${weatherProbe.bodyHasWeatherWordInScroll} evidence=${JSON.stringify(weatherProbe)}`);
    log(`WX1_icon_present: ${weatherProbe.weatherBtnExists} label=${weatherProbe.weatherBtnLabel}`);
    log(`WX6_health_no_rain: healthScore=${weatherProbe.healthScore} rainBtn=${weatherProbe.rainBtn}`);

    // Click weather icon
    const clicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b =>
        (b.getAttribute('aria-label') || '').toLowerCase().startsWith('weather')
      );
      if (!btn) return false;
      btn.click();
      return true;
    });
    await wait(600);
    await page.screenshot({ path: path.join(OUT, '03-weather-open.png') });

    const openProbe = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const dialogText = dialog ? dialog.innerText : '';
      const dialogRect = dialog ? dialog.getBoundingClientRect() : null;
      // App chrome: look for nav/sidebar
      const nav = document.querySelector('nav') || document.querySelector('[role="navigation"]') || document.querySelector('aside');
      const navRect = nav ? nav.getBoundingClientRect() : null;
      const header = Array.from(document.querySelectorAll('header, [class*="AppLayout"]')).find(Boolean);
      // Overlay container relative
      const overlay = dialog ? dialog.closest('.relative, [class*="relative"]') : null;
      const overlayRect = overlay ? overlay.getBoundingClientRect() : null;
      // Does dialog cover full viewport height or just health block?
      const coversFullViewport = dialogRect && dialogRect.height > window.innerHeight * 0.85 && dialogRect.width > window.innerWidth * 0.85;
      const hasClose = !!document.querySelector('[data-weather-close], button[aria-label="Close weather"]');
      const hasDismiss = !!document.querySelector('button[aria-label="Dismiss weather"]');
      // Alert dot on button
      const btn = Array.from(document.querySelectorAll('button')).find(b =>
        (b.getAttribute('aria-label') || '').toLowerCase().startsWith('weather')
      );
      let alertDot = null;
      if (btn) {
        const dots = btn.querySelectorAll('span');
        for (const d of dots) {
          const cls = d.className || '';
          if (/rounded-full|bg-primary/.test(cls) && /size-2|h-2|w-2/.test(cls)) {
            alertDot = { className: cls, visible: d.offsetParent !== null || d.getClientRects().length > 0 };
          }
        }
        // also check absolute top-right span
        if (!alertDot) {
          for (const d of dots) {
            if (/absolute/.test(d.className) && /bg-primary/.test(d.className)) {
              alertDot = { className: d.className, isPrimary: /bg-primary/.test(d.className), notHealth: !/health|green|yellow|orange|red/.test(d.className) };
            }
          }
        }
      }
      return {
        dialogOpen: !!dialog,
        dialogTitle: dialogText.slice(0, 200),
        hasClose,
        hasDismiss,
        coversFullViewport,
        dialogRect,
        navRect,
        overlayRect,
        alertDot,
        ariaExpanded: btn ? btn.getAttribute('aria-expanded') : null,
        hasForecast: /7-day|forecast|Clear sky|precip|humidity/i.test(dialogText),
        hasRainCheckInPanel: /rain\s*check|daily\s*check/i.test(dialogText),
      };
    });
    log(`WX2_popdown: open=${openProbe.dialogOpen} coversFullApp=${openProbe.coversFullViewport} hasForecast=${openProbe.hasForecast} rainInPanel=${openProbe.hasRainCheckInPanel} rect=${JSON.stringify(openProbe.dialogRect)}`);
    log(`WX4_alert_dot: ${JSON.stringify(openProbe.alertDot)} aria=${openProbe.ariaExpanded}`);

    // Dismiss via Escape
    await page.keyboard.press('Escape');
    await wait(400);
    const afterEsc = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
    log(`WX3_escape: dialogGone=${!afterEsc}`);

    // Reopen and dismiss via X
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b =>
        (b.getAttribute('aria-label') || '').toLowerCase().startsWith('weather')
      );
      btn && btn.click();
    });
    await wait(400);
    await page.evaluate(() => {
      const x = document.querySelector('[data-weather-close]') || document.querySelector('button[aria-label="Close weather"]');
      x && x.click();
    });
    await wait(400);
    const afterX = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
    log(`WX3_closeX: dialogGone=${!afterX}`);

    // Reopen and click dimmed backdrop
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b =>
        (b.getAttribute('aria-label') || '').toLowerCase().startsWith('weather')
      );
      btn && btn.click();
    });
    await wait(400);
    await page.evaluate(() => {
      const dim = document.querySelector('button[aria-label="Dismiss weather"]');
      dim && dim.click();
    });
    await wait(400);
    const afterDim = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
    log(`WX3_dimmed: dialogGone=${!afterDim}`);

    // Reopen and click outside health block (e.g. page title / nav)
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b =>
        (b.getAttribute('aria-label') || '').toLowerCase().startsWith('weather')
      );
      btn && btn.click();
    });
    await wait(400);
    // Click Dashboard h1 if outside overlay
    await page.evaluate(() => {
      const h1 = document.querySelector('h1');
      if (h1) {
        const r = h1.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + 10, r.top + 10);
        el && el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      }
    });
    await wait(400);
    const afterOutside = await page.evaluate(() => !!document.querySelector('[role="dialog"]'));
    log(`WX3_outside: dialogGone=${!afterOutside}`);

    // Health map colors still present
    const healthMap = await page.evaluate(() => {
      const body = document.body.innerText;
      const mapSvgOrCanvas = !!document.querySelector('svg') || !!document.querySelector('canvas') || !!document.querySelector('[class*="map"]');
      const colorDots = document.querySelectorAll('[class*="rounded-full"]').length;
      const rainAnywhere = Array.from(document.querySelectorAll('button')).some(b => /rain check/i.test(b.textContent||'') || /rain check/i.test(b.getAttribute('aria-label')||''));
      return { hasHealthText: /Vineyard health/i.test(body), mapish: mapSvgOrCanvas, colorDots, rainAnywhere, scoreMatch: body.match(/Vineyard health[\s\S]{0,80}/)?.[0] };
    });
    log(`WX6_map: ${JSON.stringify(healthMap)}`);

    // Panel states code-backed - log what we see at runtime (ready)
    log(`WX5_runtime_state: dialogReadyContent_seen_earlier=${openProbe.hasForecast} (loading/location/unavailable: code-review)`);

    // === Continue full-site pages ===
    const pages = [
      ['/', 'Dashboard'],
      ['/rows', 'Rows'],
      ['/tasks', 'Tasks'],
      ['/harvests', 'Harvests'],
      ['/activities', 'Activities'],
      ['/setup', 'Setup'],
      ['/metrics', 'Metrics'],
      ['/settings', 'Settings'],
    ];
    for (const [route, name] of pages) {
      await page.goto(BASE + route, { waitUntil: 'networkidle2', timeout: 30000 });
      await wait(1200);
      const info = await page.evaluate((expected) => {
        const t = document.body.innerText;
        const err = /Could not load|Something went wrong|Unhandled|TypeError|is not defined/i.test(t);
        const emptyBad = /No vineyard yet/i.test(t) && !/Dashboard|Rows|Tasks/.test(expected);
        return {
          title: document.title,
          h1: document.querySelector('h1')?.textContent?.trim(),
          snippet: t.replace(/\s+/g, ' ').slice(0, 350),
          err,
          url: location.href,
        };
      }, name);
      const shot = `page-${name.toLowerCase()}.png`;
      await page.screenshot({ path: path.join(OUT, shot), fullPage: false });
      log(`PAGE_${name}: h1=${info.h1} err=${info.err} url=${info.url} snip=${info.snippet}`);
    }

    // Dashboard row action panel - click a row on map if possible
    await page.goto(BASE + '/', { waitUntil: 'networkidle2' });
    await wait(1500);
    const rowClick = await page.evaluate(() => {
      // try buttons/rects with row codes
      const candidates = Array.from(document.querySelectorAll('button, [role="button"], rect, path, g'));
      for (const el of candidates) {
        const label = (el.getAttribute('aria-label') || el.textContent || '').trim();
        if (/^(NS|EW)\d/i.test(label) || /row/i.test(label)) {
          el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          return label.slice(0, 80);
        }
      }
      // click first colored swatch in map area
      const map = document.querySelector('svg');
      if (map) {
        const target = map.querySelector('[data-row-id], rect, circle, path');
        if (target) { target.dispatchEvent(new MouseEvent('click', { bubbles: true })); return 'svg-child'; }
      }
      return null;
    });
    await wait(500);
    const panel = await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        hasActionPanel: /Log work|Mark complete|Water|Scout|Health|Close|Selected/i.test(t),
        snip: t.match(/[\s\S]{0,80}(NS\d|EW\d|Log)[\s\S]{0,120}/)?.[0],
      };
    });
    log(`DASH_ROW_PANEL: clicked=${rowClick} panel=${JSON.stringify(panel)}`);
    await page.screenshot({ path: path.join(OUT, '04-row-panel.png') });

    // Settings - change password UI reachable?
    await page.goto(BASE + '/settings', { waitUntil: 'networkidle2' });
    await wait(800);
    const settings = await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        hasName: /display name|name/i.test(t),
        hasEmail: /email/i.test(t),
        hasChangePw: /change password|current password|new password/i.test(t),
        snip: t.replace(/\s+/g, ' ').slice(0, 400),
      };
    });
    log(`SETTINGS_UI: ${JSON.stringify(settings)}`);

    // Setup sections
    await page.goto(BASE + '/setup', { waitUntil: 'networkidle2' });
    await wait(1000);
    const setup = await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        vineyard: /Abide|vineyard|address/i.test(t),
        layout: /Map rows|layout|drag/i.test(t),
        varieties: /Variety|Chambourcin|Norton|catalog/i.test(t),
        calendar: /calendar|seed/i.test(t),
        health: /threshold|greenMin|health cutoff|Green/i.test(t),
        logo: /logo/i.test(t),
        people: /People|viewer@|manager@|role/i.test(t),
        snip: t.replace(/\s+/g, ' ').slice(0, 500),
      };
    });
    log(`SETUP_UI: ${JSON.stringify(setup)}`);

    // Metrics periods
    await page.goto(BASE + '/metrics', { waitUntil: 'networkidle2' });
    await wait(1200);
    const metrics = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim());
      const t = document.body.innerText;
      return { buttons: buttons.filter(b => /month|quarter|year/i.test(b)), hasChartsOrStats: /harvest|health|yield|lb/i.test(t), snip: t.replace(/\s+/g,' ').slice(0,350) };
    });
    log(`METRICS_UI: ${JSON.stringify(metrics)}`);

    // Logout
    const logoutClicked = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('button,a')).find(e => /log\s*out|sign\s*out/i.test(e.textContent||''));
      if (el) { el.click(); return el.textContent.trim(); }
      return null;
    });
    await wait(1000);
    log(`AUTH_LOGOUT: clicked=${logoutClicked} url=${page.url()} onLogin=${page.url().includes('login')}`);

    // Viewer login spot-check
    await login(page, 'viewer@vineyard.local', 'VineyardDev1!');
    await wait(1200);
    const viewer = await page.evaluate(() => {
      const t = document.body.innerText;
      const addBtns = Array.from(document.querySelectorAll('button,a')).filter(e => /add |create |new /i.test(e.textContent||''));
      return {
        url: location.href,
        onDash: /Dashboard|Vineyard health/i.test(t),
        weatherBtn: !!Array.from(document.querySelectorAll('button')).find(b => (b.getAttribute('aria-label')||'').toLowerCase().startsWith('weather')),
        setupLink: !!Array.from(document.querySelectorAll('a,button')).find(e => /setup/i.test(e.textContent||'')),
        snip: t.replace(/\s+/g,' ').slice(0,300),
      };
    });
    log(`VIEWER: ${JSON.stringify(viewer)}`);
    await page.goto(BASE + '/rows', { waitUntil: 'networkidle2' });
    await wait(800);
    const viewerRows = await page.evaluate(() => {
      const t = document.body.innerText;
      const add = Array.from(document.querySelectorAll('button')).some(b => /add row|new row/i.test(b.textContent||''));
      return { hasRows: /NS1|EW1|Norton|Vignoles/i.test(t), addVisible: add, snip: t.replace(/\s+/g,' ').slice(0,250) };
    });
    log(`VIEWER_ROWS: ${JSON.stringify(viewerRows)}`);
    await page.goto(BASE + '/setup', { waitUntil: 'networkidle2' });
    await wait(800);
    const viewerSetup = await page.evaluate(() => {
      const t = document.body.innerText;
      return { blockedOrReadonly: /only a power user|cannot|read-only|permission/i.test(t) || !/Save|Invite/i.test(t), snip: t.replace(/\s+/g,' ').slice(0,300) };
    });
    log(`VIEWER_SETUP: ${JSON.stringify(viewerSetup)}`);

    log(`CONSOLE_ERRS: ${JSON.stringify(consoleErrs.slice(0, 20))}`);
  } catch (e) {
    log(`FATAL: ${e.stack || e}`);
    try { await page.screenshot({ path: path.join(OUT, 'fatal.png'), fullPage: true }); } catch {}
  } finally {
    fs.writeFileSync(path.join(__dirname, 'ui-report.txt'), report.join('\n'));
    await browser.close();
  }
})();
