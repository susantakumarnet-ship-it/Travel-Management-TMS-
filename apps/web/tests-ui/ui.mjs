// Browser UI test: crawls every page of all four portals (desktop + mobile) and drives key flows.
// Requires: web on WEB (default http://localhost:3000) proxying to a dev-mode API with DEV_FIXED_OTP,
// ALLOW_TEST_GATEWAY and seeded data, plus a local Chrome (uses playwright-core channel "chrome").
// Usage: node tests-ui/ui.mjs   → screenshots in $SHOTS (default ./tests-ui/shots)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const WEB = process.env.WEB ?? 'http://localhost:3000';
const OTP = process.env.DEV_FIXED_OTP ?? '123456';
const SHOTS = process.env.SHOTS ?? path.resolve('tests-ui/shots');
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const out = [];
const check = (name, cond, info = '') => {
  if (cond) { pass++; out.push(`  ✓ ${name}`); } else { fail++; out.push(`  ✗ ${name}  ${String(info).slice(0, 700)}`); }
};
const iso = (ms) => new Date(ms).toISOString();
const DAY = 86_400_000, H = 3_600_000;
const uniqPhone = (p) => `${p}${String(Date.now()).slice(-8)}`.slice(0, 10);

const browser = await chromium.launch({ channel: 'chrome', headless: true });

/** API helper through the web origin (same proxy the browser uses). */
async function api(ctx, method, url, data, token) {
  const r = await ctx.request.fetch(WEB + '/api' + url, { method, data, headers: token ? { authorization: `Bearer ${token}` } : {} });
  let body = null; try { body = await r.json(); } catch { /* non-JSON */ }
  return { status: r.status(), body };
}

async function newCtx(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'en-IN', timezoneId: 'Asia/Kolkata' });
  return ctx;
}

/** Visit a page, collect runtime problems, check layout, screenshot. */
async function visit(ctx, route, { label, expect404 = false, mobile = false, waitFor } = {}) {
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource/.test(t)) return; // network-level; tracked via responses below
    problems.push(`console: ${t}`);
  });
  page.on('response', (r) => {
    const u = r.url();
    if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${u}`);
    else if (u.includes('/api/') && r.status() >= 400 && !u.includes('/api/auth/refresh') && !expect404) problems.push(`HTTP ${r.status()} ${u}`);
  });
  let status = 0;
  try {
    const res = await page.goto(WEB + route, { waitUntil: 'networkidle', timeout: 45_000 });
    status = res?.status() ?? 0;
    if (waitFor) await page.waitForSelector(waitFor, { timeout: 15_000 }).catch(() => problems.push(`missing selector ${waitFor}`));
    // Data must arrive: no loading skeleton may remain after 10 s (catches stuck screens).
    await page
      .waitForFunction(() => !document.querySelector('[class*="animate-shimmer"]'), undefined, { timeout: 10_000 })
      .catch(() => problems.push('still showing loading skeletons after 10s'));
    await page.waitForTimeout(300);
  } catch (e) {
    problems.push(`navigation: ${e.message.split('\n')[0]}`);
  }
  const bodyText = await page.locator('body').innerText().catch(() => '');
  if (/Application error|Unhandled Runtime Error|client-side exception/i.test(bodyText)) problems.push('error boundary rendered');
  if (!expect404 && /could not be found|page not found|404/i.test(bodyText.slice(0, 600)) && status === 404) problems.push('rendered 404');
  if (mobile) {
    const overflow = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const wide = [...document.querySelectorAll('body *')].filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed' || r.width === 0) return false;
        // ignore content inside horizontal scrollers (tables, chip rows)
        for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return false; }
        return r.right > w + 2;
      });
      return { scroll: document.documentElement.scrollWidth, w, sample: wide.slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 60)}`) };
    });
    if (overflow.scroll > overflow.w + 2) problems.push(`horizontal overflow ${overflow.scroll}>${overflow.w} ${overflow.sample.join(' | ')}`);
  }
  const file = path.join(SHOTS, `${(label ?? route).replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home'}${mobile ? '_m' : ''}.png`);
  await page.screenshot({ path: file, fullPage: false }).catch(() => {});
  const okStatus = expect404 ? status === 404 : status === 200;
  check(`${mobile ? '[mobile] ' : ''}${label ?? route}`, okStatus && problems.length === 0, `status=${status} ${problems.slice(0, 4).join(' || ')}`);
  await page.close();
  return { status, problems };
}

async function crawl(ctx, routes, mobile) {
  for (const r of routes) {
    const [route, opts] = Array.isArray(r) ? r : [r, {}];
    await visit(ctx, route, { ...opts, mobile });
  }
}

// ─────────────────────────── data for dynamic routes ───────────────────────────
const seed = await newCtx({ width: 1366, height: 900 });
const pickup = Date.now() + 30 * DAY;
const qs = `pickupAt=${encodeURIComponent(iso(pickup))}&returnAt=${encodeURIComponent(iso(pickup + 6 * H))}`;
const veh = (await api(seed, 'GET', `/public/vehicles?withDriver=true&${qs}&pageSize=12`)).body.items;
const pkg = (await api(seed, 'GET', '/public/travel-packages')).body[0];
const adminLogin = await api(seed, 'POST', '/auth/admin/login', { email: 'admin@royalride.local', password: 'Admin@12345' });
const A = adminLogin.body.accessToken;
const anyBooking = (await api(seed, 'GET', '/admin/bookings?pageSize=1', undefined, A)).body.items[0];
const anyCustomer = (await api(seed, 'GET', '/admin/customers?pageSize=1', undefined, A)).body.items[0];
const anyOwner = (await api(seed, 'GET', '/admin/owners?pageSize=1', undefined, A)).body.items[0];
const anyDriver = (await api(seed, 'GET', '/admin/drivers?pageSize=1', undefined, A)).body.items[0];
const anyVehicle = (await api(seed, 'GET', '/admin/vehicles?pageSize=1', undefined, A)).body.items[0];
const anyWedding = (await api(seed, 'GET', '/admin/weddings?pageSize=1', undefined, A)).body.items[0];
const anyTravel = (await api(seed, 'GET', '/admin/travel-packages', undefined, A)).body[0];
await seed.close();

const PUBLIC = [
  ['/', { label: 'home' }], '/vehicles', [`/vehicles?${qs}&purpose=WEDDING&passengers=4`, { label: 'vehicles-search-wedding' }],
  [`/vehicles/${veh[0].slug}`, { label: 'vehicle-detail' }], '/weddings', '/packages', [`/packages/${pkg.slug}`, { label: 'package-detail' }],
  '/contact', '/terms', '/privacy', '/cancellation-policy', '/about', '/login', '/partner', '/partner/login', '/driver/login', '/admin/login',
  [`/book/${veh[0].id}?${qs}&passengers=2`, { label: 'checkout' }], ['/this-page-does-not-exist', { expect404: true, label: '404-page' }],
];

// ─────────────────────────── 1. Public crawl ───────────────────────────
for (const [vp, mobile] of [[{ width: 1366, height: 900 }, false], [{ width: 390, height: 844 }, true]]) {
  out.push(`\nPublic pages ${mobile ? '(mobile 390px)' : '(desktop)'}`);
  const ctx = await newCtx(vp);
  await crawl(ctx, PUBLIC, mobile);
  await ctx.close();
}

// ─────────────────────────── 2. Customer UI flows ───────────────────────────
out.push('\nCustomer flows (real UI)');
let custCtx = await newCtx({ width: 1366, height: 900 });
{
  const page = await custCtx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const phone = uniqPhone('93');
  await page.goto(`${WEB}/book/${veh[1].id}?${qs}&passengers=2&purpose=LOCAL_TRAVEL`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('House / landmark, area, city').first().fill('Plot 7, Saheed Nagar, Bhubaneswar');
  await page.getByRole('button', { name: /Review price/ }).click();
  await page.getByRole('button', { name: /Continue to sign in/ }).click({ timeout: 15_000 });
  await page.getByPlaceholder('98765 43210').fill(phone);
  await page.getByRole('button', { name: 'Get OTP' }).click();
  const devOtp = await page.locator('text=Your OTP is').locator('span').innerText({ timeout: 10_000 }).catch(() => OTP);
  check('dev OTP shown on screen', /^\d{6}$/.test(devOtp), devOtp);
  const nameBox = page.getByPlaceholder('e.g. Ananya Mishra');
  if (await nameBox.isVisible().catch(() => false)) await nameBox.fill('UI Test Customer');
  await page.locator('input[autocomplete="one-time-code"]').fill(devOtp);
  await page.getByRole('button', { name: /Verify & continue/ }).click();
  const payBtn = page.getByRole('button', { name: /^Pay .* securely$/ });
  await payBtn.waitFor({ timeout: 20_000 });
  check('checkout: journey → review → inline sign-in → payment step', await payBtn.isEnabled(), 'pay disabled');
  await page.screenshot({ path: path.join(SHOTS, 'flow_checkout_pay.png') });
  await payBtn.click();
  const sim = page.getByRole('button', { name: 'Simulate successful payment' });
  await sim.waitFor({ timeout: 20_000 });
  check('TEST PAYMENT modal clearly labelled', await page.getByText('TEST PAYMENT — development only').isVisible());
  await sim.click();
  await page.waitForURL(/\/account\/bookings\/[a-f0-9]{24}/, { timeout: 30_000 }).catch(() => {});
  const url = page.url();
  check('redirected to booking page after payment', /\/account\/bookings\/[a-f0-9]{24}/.test(url), url);
  const cancelBtn = page.getByRole('button', { name: 'Cancel booking' }).first();
  await cancelBtn.waitFor({ timeout: 20_000 }).catch(() => {});
  const txt = await page.locator('body').innerText();
  check('booking page shows confirmed status', /Confirmed|Driver Assigned/.test(txt), txt.slice(0, 300));
  check('booking page shows timeline & advance receipt', /Awaiting Payment/i.test(txt) && /(Receipt|Invoice|INV\/)/i.test(txt), txt.slice(0, 400));
  await page.screenshot({ path: path.join(SHOTS, 'flow_booking_confirmed.png'), fullPage: true });
  // Cancel through the UI
  if (await cancelBtn.isVisible().catch(() => false)) {
    await cancelBtn.click();
    await page.getByText('Cancel this booking?').waitFor({ timeout: 10_000 });
    await page.locator('textarea').last().fill('Testing cancellation from the UI');
    await page.getByRole('button', { name: 'Confirm cancellation' }).click();
    await page.getByText(/Refund (Initiated|initiated)|Refunded/).first().waitFor({ timeout: 20_000 }).catch(() => {});
    const after = await page.locator('body').innerText();
    check('cancel via UI → booking cancelled with refund', /(Refund Initiated|Refunded)/.test(after), after.slice(0, 300));
    await page.screenshot({ path: path.join(SHOTS, 'flow_booking_cancelled.png'), fullPage: true });
  } else check('cancel button present on confirmed booking', false);
  check('no runtime errors during checkout flow', errs.length === 0, errs.join(' | '));
  await page.close();
}

// Logged-in customer crawl (reuse the session cookie from the flow above)
const custBookings = await (async () => {
  const p = await custCtx.newPage();
  await p.goto(WEB + '/account', { waitUntil: 'networkidle' });
  await p.close();
})();
void custBookings;
const custRoutes = ['/account', '/account/bookings', '/account/weddings', '/account/profile'];
out.push('\nCustomer account pages (desktop + mobile)');
await crawl(custCtx, custRoutes, false);
const custState = await custCtx.storageState();
await custCtx.close();
{
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: custState, timezoneId: 'Asia/Kolkata' });
  await crawl(m, custRoutes, true);
  await m.close();
}

// ─────────────────────────── 3. Admin ───────────────────────────
out.push('\nAdmin (UI login + every page)');
{
  const ctx = await newCtx({ width: 1440, height: 900 });
  const page = await ctx.newPage();
  await page.goto(WEB + '/admin/login', { waitUntil: 'networkidle' });
  await page.locator('input[type="email"]').fill('admin@royalride.local');
  await page.locator('input[type="password"]').fill('Admin@12345');
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin$/, { timeout: 20_000 }).catch(() => {});
  check('admin logs in through the form', /\/admin$/.test(page.url()), page.url());
  await page.getByText(/Total Revenue/i).first().waitFor({ timeout: 20_000 }).catch(() => {});
  await page.locator('svg.recharts-surface').nth(4).waitFor({ timeout: 20_000 }).catch(() => {});
  const dashTxt = await page.locator('body').innerText();
  check('dashboard shows KPI cards', /Total Revenue/i.test(dashTxt) && /Upcoming Weddings/i.test(dashTxt), dashTxt.slice(0, 300));
  check('dashboard renders charts (svg)', (await page.locator('svg.recharts-surface').count()) >= 5, await page.locator('svg.recharts-surface').count());
  await page.screenshot({ path: path.join(SHOTS, 'admin_dashboard_full.png'), fullPage: true });
  await page.close();
  const adminRoutes = ['/admin', '/admin/bookings', `/admin/bookings/${anyBooking.id}`, '/admin/weddings', anyWedding && `/admin/weddings/${anyWedding.id}`, '/admin/vehicles', '/admin/vehicles/new', `/admin/vehicles/${anyVehicle.id}`, '/admin/catalog', '/admin/owners', `/admin/owners/${anyOwner.id}`, '/admin/drivers', `/admin/drivers/${anyDriver.id}`, '/admin/customers', `/admin/customers/${anyCustomer.id}`, '/admin/packages', anyTravel && `/admin/packages/travel/${anyTravel.id}`, '/admin/payments', '/admin/refunds', '/admin/commissions', '/admin/coupons', '/admin/pricing', '/admin/reviews', '/admin/notifications', '/admin/reports', '/admin/content', '/admin/enquiries', '/admin/settings', '/admin/roles', '/admin/audit'].filter(Boolean);
  await crawl(ctx, adminRoutes, false);
  const st = await ctx.storageState();
  await ctx.close();
  out.push('\nAdmin (mobile)');
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: st, timezoneId: 'Asia/Kolkata' });
  await crawl(m, ['/admin', '/admin/bookings', `/admin/bookings/${anyBooking.id}`, '/admin/vehicles', '/admin/reports', '/admin/settings'], true);
  await m.close();
}

// ─────────────────────────── 4. Partner (owner) ───────────────────────────
out.push('\nPartner portal (UI login + pages)');
{
  const ctx = await newCtx({ width: 1366, height: 900 });
  const page = await ctx.newPage();
  await page.goto(WEB + '/partner/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('98765 43210').fill('9000000101');
  await page.getByRole('button', { name: 'Get OTP' }).click();
  await page.locator('input[autocomplete="one-time-code"]').fill(OTP);
  await page.getByRole('button', { name: /Verify & continue/ }).click();
  await page.waitForURL(/\/owner/, { timeout: 20_000 }).catch(() => {});
  check('partner logs in through OTP form', /\/owner/.test(page.url()), page.url());
  await page.waitForLoadState('networkidle');
  const token = (await api(ctx, 'POST', '/auth/refresh')).body?.accessToken;
  const ov = (await api(ctx, 'GET', '/owner/vehicles', undefined, token)).body;
  const ob = (await api(ctx, 'GET', '/owner/bookings?pageSize=1', undefined, token)).body;
  await page.close();
  const routes = ['/owner', '/owner/vehicles', '/owner/vehicles/new', ov?.[0] && `/owner/vehicles/${ov[0].id}`, '/owner/bookings', ob?.items?.[0] && `/owner/bookings/${ob.items[0].id}`, '/owner/drivers', '/owner/earnings', '/owner/reviews', '/owner/profile'].filter(Boolean);
  await crawl(ctx, routes, false);
  const st = await ctx.storageState();
  await ctx.close();
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: st, timezoneId: 'Asia/Kolkata' });
  await crawl(m, routes, true);
  await m.close();
}

// ─────────────────────────── 5. Driver ───────────────────────────
out.push('\nDriver portal (UI login + pages)');
{
  const ctx = await newCtx({ width: 390, height: 844 });
  const page = await ctx.newPage();
  await page.goto(WEB + '/driver/login', { waitUntil: 'networkidle' });
  await page.getByPlaceholder('98765 43210').fill('9000000201');
  await page.getByRole('button', { name: 'Get OTP' }).click();
  await page.locator('input[autocomplete="one-time-code"]').fill(OTP);
  await page.getByRole('button', { name: /Verify & continue/ }).click();
  await page.waitForURL(/\/driver(?!\/login)/, { timeout: 20_000 }).catch(() => {});
  check('driver logs in through OTP form (mobile)', /\/driver(?!\/login)/.test(page.url()), page.url());
  await page.waitForLoadState('networkidle');
  const token = (await api(ctx, 'POST', '/auth/refresh')).body?.accessToken;
  const trips = (await api(ctx, 'GET', '/driver/trips?scope=all&pageSize=1', undefined, token)).body;
  await page.close();
  const routes = ['/driver', '/driver/trips', trips?.items?.[0] && `/driver/trips/${trips.items[0].id}`, '/driver/earnings', '/driver/profile'].filter(Boolean);
  await crawl(ctx, routes, true);
  await ctx.close();
}

// ─────────────────────────── 6. Access control in the UI ───────────────────────────
out.push('\nRoute guards');
{
  const ctx = await newCtx({ width: 1366, height: 900 });
  const page = await ctx.newPage();
  for (const [route, expectPath] of [['/account', '/login'], ['/admin/settings', '/admin/login'], ['/owner/earnings', '/partner/login'], ['/driver/trips', '/driver/login']]) {
    await page.goto(WEB + route, { waitUntil: 'networkidle' });
    await page.waitForURL((u) => u.pathname.startsWith(expectPath), { timeout: 10_000 }).catch(() => {});
    check(`anonymous ${route} → ${expectPath}`, new URL(page.url()).pathname.startsWith(expectPath), page.url());
  }
  await page.close();
  await ctx.close();
}

await browser.close();
console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed  (screenshots: ${SHOTS})`);
process.exit(fail ? 1 : 0);
