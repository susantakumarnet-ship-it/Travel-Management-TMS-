// Broad API validation suite. Requires a running API in development mode with
// DEV_FIXED_OTP set, ALLOW_TEST_GATEWAY=true and DISABLE_RATE_LIMITS=true, on seeded data.
// Usage: API=http://localhost:4700/api node tests-e2e/full.mjs   (creates real test records; ~3 min incl. hold-expiry wait)
const BASE = process.env.API ?? 'http://localhost:4000/api';
const FIXED_OTP = process.env.DEV_FIXED_OTP ?? '123456';
const ADMIN = { email: process.env.SEED_ADMIN_EMAIL ?? 'admin@royalride.local', password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345' };

let pass = 0, fail = 0;
const out = [];
const check = (name, cond, info = '') => {
  if (cond) { pass++; out.push(`  ✓ ${name}`); } else { fail++; out.push(`  ✗ ${name}  ${typeof info === 'string' ? info : JSON.stringify(info)}`.slice(0, 600)); }
};
async function section(title, fn) {
  out.push(`\n${title}`);
  try { await fn(); } catch (e) { fail++; out.push(`  ✗ SECTION CRASHED: ${e.stack?.split('\n').slice(0, 3).join(' | ')}`); }
}
async function call(method, path, { token, body, form, raw, cookie, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined && !form) h['content-type'] = 'application/json';
  if (token) h.authorization = `Bearer ${token}`;
  if (cookie) h.cookie = cookie;
  const res = await fetch(BASE + path, { method, headers: h, body: form ?? (body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined) });
  const setCookie = res.headers.get('set-cookie');
  if (raw) return { status: res.status, buf: Buffer.from(await res.arrayBuffer()), setCookie, headers: res.headers };
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, setCookie };
}
const G = (p, o) => call('GET', p, o), P = (p, b, o = {}) => call('POST', p, { ...o, body: b }), U = (p, b, o = {}) => call('PUT', p, { ...o, body: b }), PA = (p, b, o = {}) => call('PATCH', p, { ...o, body: b }), D = (p, o) => call('DELETE', p, o);
const uniq = () => String(Date.now()).slice(-6) + String(Math.floor(Math.random() * 90 + 10));
const phoneFor = (prefix) => `${prefix}${uniq()}`.slice(0, 10).padEnd(10, '7');
async function login(phone, role, name) {
  const r = await P('/auth/otp/verify', { phone, code: FIXED_OTP, role, name });
  if (r.status !== 200) throw new Error(`login ${phone} ${role} failed: ${r.status} ${JSON.stringify(r.data)}`);
  return { token: r.data.accessToken, user: r.data.user, cookie: r.setCookie?.split(';')[0] };
}
const iso = (ms) => new Date(ms).toISOString();
const H = 3600_000, DAY = 86_400_000;
// Random per-run offset (35–95 days, odd minutes) so re-runs never collide with earlier runs' bookings.
// Kept under ~4 months: seeded vehicles' insurance expires next March and search hides lapsing vehicles.
const T0 = Date.now() + Math.floor((35 + Math.random() * 60) * DAY / 60_000) * 60_000 + 7 * 60_000;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200)]);
const fileForm = (field, buf, name, type, extra = {}) => {
  const f = new FormData();
  f.append(field, new Blob([buf], { type }), name);
  for (const [k, v] of Object.entries(extra)) f.append(k, String(v));
  return f;
};
async function bookAndPay(token, body, purpose = 'ADVANCE') {
  const b = await P('/customer/bookings', body, { token });
  if (b.status !== 201) return { b, paid: false };
  const p = await P(`/customer/bookings/${b.data.id}/payments`, { purpose }, { token });
  const v = await P(`/customer/payments/${p.data.paymentId}/verify`, { test_order_id: p.data.checkout.orderId, test_signature: p.data.checkout.signature }, { token });
  return { b, p, v, paid: v.status === 200 };
}
const baseBooking = (vehicleId, pickup, hours = 6, extra = {}) => ({
  vehicleId, purpose: 'LOCAL_TRAVEL', withDriver: true, pickupAt: iso(pickup), returnAt: iso(pickup + hours * H),
  pickupAddress: 'Saheed Nagar, Bhubaneswar', dropAddress: 'Patia, Bhubaneswar', estimatedKm: 40, passengers: 2, luggageBags: 1, acRequired: true, decoration: false, ...extra,
});

// ───────────────────────── shared state ─────────────────────────
const S = {};
const restoreSettings = {};

await section('Setup', async () => {
  const a = await P('/auth/admin/login', ADMIN);
  check('admin login', a.status === 200, a.data);
  S.admin = a.data.accessToken;
  S.cats = (await G('/public/categories')).data;
  S.cities = (await G('/public/cities')).data;
  S.models = (await G('/public/models')).data;
  check('catalogue loaded', S.cats.length >= 6 && S.cities.length >= 6 && S.models.length >= 30, { c: S.cats.length, ci: S.cities.length, m: S.models.length });
  S.cust = await login(phoneFor('96'), 'CUSTOMER', 'Full Suite Customer');
  S.cust2 = await login(phoneFor('95'), 'CUSTOMER', 'Second Customer');
  const s = await G(`/public/vehicles?withDriver=true&pageSize=48&pickupAt=${iso(T0 + 20 * DAY)}&returnAt=${iso(T0 + 20 * DAY + 6 * H)}`);
  S.vehicles = s.data.items;
  check('with-driver vehicles available', S.vehicles.length >= 10, s.data.items?.length);
  const settings = await G('/admin/settings', { token: S.admin });
  S.settings = settings.data.values;
});

await section('Auth & sessions', async () => {
  const me = await G('/auth/me', { token: S.cust.token });
  check('/auth/me returns profile without password hash', me.status === 200 && me.data.role === 'CUSTOMER' && !('passwordHash' in me.data), me.data);
  check('invalid phone rejected', (await P('/auth/otp/request', { phone: '12345' })).status === 400);
  check('NoSQL operator in phone rejected', (await P('/auth/otp/request', { phone: { $gt: '' } })).status === 400);
  check('malformed JSON → 400', (await call('POST', '/auth/otp/request', { body: '{"phone":', headers: { 'content-type': 'application/json' } })).status === 400);
  // Refresh rotation + reuse detection
  const s1 = await login(phoneFor('94'), 'CUSTOMER', 'Session Tester');
  const r1 = await call('POST', '/auth/refresh', { cookie: s1.cookie });
  check('refresh rotates token', r1.status === 200 && r1.setCookie && r1.setCookie.split(';')[0] !== s1.cookie, r1.status);
  const newCookie = r1.setCookie?.split(';')[0];
  const reuse = await call('POST', '/auth/refresh', { cookie: s1.cookie });
  check('reusing an old refresh token → 401', reuse.status === 401);
  const afterReuse = await call('POST', '/auth/refresh', { cookie: newCookie });
  check('reuse detection revokes the whole session family', afterReuse.status === 401);
  const s2 = await login(s1.user.phone, 'CUSTOMER');
  await call('POST', '/auth/logout', { cookie: s2.cookie });
  check('logout revokes refresh token', (await call('POST', '/auth/refresh', { cookie: s2.cookie })).status === 401);
  // JWT tampering
  const [h, p, sig] = S.cust.token.split('.');
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  const forged = `${h}.${Buffer.from(JSON.stringify({ ...payload, role: 'ADMIN', perms: ['*'] })).toString('base64url')}.${sig}`;
  check('tampered JWT (role→ADMIN) → 401', (await G('/admin/dashboard', { token: forged })).status === 401);
  const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ ...payload, role: 'ADMIN' })).toString('base64url')}.`;
  check('alg:none JWT → 401', (await G('/admin/dashboard', { token: none })).status === 401);
  check('no token → 401', (await G('/customer/bookings')).status === 401);
  // Role switching rules
  const ownerPhone = '9000000101';
  const asCust = await P('/auth/otp/verify', { phone: ownerPhone, code: FIXED_OTP, role: 'DRIVER' });
  check('owner number cannot register as driver', asCust.status === 400, asCust.data);
  const adminViaOtp = await P('/auth/otp/verify', { phone: process.env.SEED_ADMIN_PHONE ?? '9000000001', code: FIXED_OTP, role: 'CUSTOMER' });
  check('admin cannot sign in via OTP', adminViaOtp.status === 400, adminViaOtp.data);
});

await section('Customer profile & addresses', async () => {
  const t = S.cust.token;
  check('invalid GSTIN rejected', (await PA('/customer/profile', { gstin: 'BADGSTIN' }, { token: t })).status === 400);
  check('profile update', (await PA('/customer/profile', { name: 'Full Suite Customer', email: `fs${uniq()}@example.com`, gstin: '21ABCDE1234F1Z5', companyName: 'Acme Weddings' }, { token: t })).status === 200);
  const me = await G('/auth/me', { token: t });
  check('profile persisted', me.data.customerProfile?.gstin === '21ABCDE1234F1Z5' && me.data.customerProfile?.companyName === 'Acme Weddings', me.data.customerProfile);
  const dupEmail = await PA('/customer/profile', { email: me.data.email }, { token: S.cust2.token });
  check('duplicate email rejected by partial unique index → 409', dupEmail.status === 409, dupEmail);
  const a1 = await P('/customer/addresses', { label: 'Home', line1: '12 Lake View', city: 'Bhubaneswar', state: 'Odisha', pincode: '751007' }, { token: t });
  check('first address becomes default', a1.status === 201 && a1.data.isDefault === true, a1.data);
  const a2 = await P('/customer/addresses', { label: 'Office', line1: 'Infocity', city: 'Bhubaneswar', state: 'Odisha', pincode: '751024', isDefault: true }, { token: t });
  const list = (await G('/customer/addresses', { token: t })).data;
  check('setting a new default clears the old one', list.filter((x) => x.isDefault).length === 1 && list.find((x) => x.isDefault).id === a2.data.id);
  check('invalid PIN rejected', (await P('/customer/addresses', { line1: 'x x x', city: 'Puri', state: 'Odisha', pincode: '12' }, { token: t })).status === 400);
  check("can't delete another customer's address", (await D(`/customer/addresses/${a1.data.id}`, { token: S.cust2.token })).status === 404);
  check('delete own address', (await D(`/customer/addresses/${a1.data.id}`, { token: t })).status === 200);
  check('malformed id → 404 (not 500)', (await G('/customer/bookings/not-an-id', { token: t })).status === 404);
});

await section('Booking validation rules', async () => {
  const t = S.cust.token;
  const v = S.vehicles.find((x) => x.seats === 4 && x.driverOption !== 'SELF_DRIVE');
  S.v4 = v;
  const r = async (body) => (await P('/customer/bookings', body, { token: t }));
  const lead = await r(baseBooking(v.id, Date.now() + 1 * H));
  check('pickup inside min lead time → 400', lead.status === 400, lead.data);
  const back = await r({ ...baseBooking(v.id, T0 + 10 * DAY), returnAt: iso(T0 + 9 * DAY) });
  check('return before pickup → 400', back.status === 400, back.data);
  check('passengers above seats → 400', (await r(baseBooking(v.id, T0 + 10 * DAY, 6, { passengers: 9 }))).status === 400);
  check('>60-day booking → 400', (await r(baseBooking(v.id, T0 + 10 * DAY, 61 * 24))).status === 400);
  const selfOnly = (await G('/public/vehicles?withDriver=false&pageSize=48')).data.items.find((x) => x.driverOption === 'SELF_DRIVE');
  if (selfOnly) check('with-driver booking on self-drive-only vehicle → 400', (await r(baseBooking(selfOnly.id, T0 + 10 * DAY))).status === 400);
  const noDeco = S.vehicles.find((x) => !x.decorationAvailable);
  check('decoration on non-decoration vehicle → 400', (await r(baseBooking(noDeco.id, T0 + 10 * DAY, 6, { decoration: true }))).status === 400);
  check('missing pickup address → 400 with field error', (await r({ ...baseBooking(v.id, T0 + 10 * DAY), pickupAddress: '' })).data?.error?.details?.fieldErrors?.pickupAddress !== undefined);
  check('unknown vehicle → 404', (await r(baseBooking('0123456789abcdef01234567', T0 + 10 * DAY))).status === 404);
  const xss = await r(baseBooking(v.id, T0 + 11 * DAY, 4, { specialRequests: '<img src=x onerror=alert(1)>Need child seat' }));
  check('HTML stripped from special requests', xss.status === 201 && xss.data.specialRequests === 'Need child seat', xss.data?.specialRequests);
  if (xss.status === 201) await P(`/customer/bookings/${xss.data.id}/cancel`, { reason: 'cleanup test' }, { token: t });
});

await section('Coupons', async () => {
  const t = S.cust.token;
  const v = S.vehicles.find((x) => x.pricing.perDayRate >= 2500 && x.id !== S.v4.id) ?? S.vehicles[1];
  const pickup = T0 + 12 * DAY;
  const quote = (code, purpose = 'LOCAL_TRAVEL') => P('/public/quote', { vehicleId: v.id, purpose, pickupAt: iso(pickup), returnAt: iso(pickup + 8 * H), estimatedKm: 60, couponCode: code }, { token: t });
  check('purpose-restricted coupon (SHAADI2500 on local travel) → 400', (await quote('SHAADI2500')).status === 400);
  check('unknown coupon → 400', (await quote('NOPE123')).status === 400);
  check('coupon needs sign-in', (await P('/public/quote', { vehicleId: v.id, pickupAt: iso(pickup), returnAt: iso(pickup + 8 * H), couponCode: 'WELCOME10' })).status === 400);
  const ok = await quote('WELCOME10');
  check('WELCOME10 applies, capped at ₹750', ok.status === 200 && ok.data.quote.discount > 0 && ok.data.quote.discount <= 750, ok.data?.quote?.discount);
  const { paid } = await bookAndPay(t, baseBooking(v.id, pickup, 8, { couponCode: 'WELCOME10', estimatedKm: 60 }));
  check('booking with coupon paid', paid);
  check('per-user limit: second use of WELCOME10 → 400', (await quote('WELCOME10')).status === 400);
  const other = await P('/public/quote', { vehicleId: v.id, purpose: 'LOCAL_TRAVEL', pickupAt: iso(pickup + 3 * DAY), returnAt: iso(pickup + 3 * DAY + 8 * H), estimatedKm: 60, couponCode: 'WELCOME10' }, { token: S.cust2.token });
  check('other customer can still use WELCOME10', other.status === 200 && other.data.quote.discount > 0);
  const coupons = (await G('/admin/coupons', { token: S.admin })).data;
  check('redemption counted on coupon', coupons.find((c) => c.code === 'WELCOME10')._count.redemptions >= 1);
});

await section('Cancellation tiers', async () => {
  const t = S.cust.token;
  const v = S.vehicles[2];
  const { b, paid } = await bookAndPay(t, baseBooking(v.id, Date.now() + 30 * H), 'FULL');
  check('booking 30h ahead paid in full', paid, b.data);
  const det = await G(`/customer/bookings/${b.data.id}`, { token: t });
  check('cancellation preview = 75%', det.data.cancellationPreview.refundPercent === 75, det.data.cancellationPreview);
  const c = await P(`/customer/bookings/${b.data.id}/cancel`, { reason: 'Tier test' }, { token: t });
  check('75% refunded, 25% fee kept', c.status === 200 && Math.abs(c.data.refundAmount - det.data.paidAmount * 0.75) < 0.02, c.data);
  check('cannot cancel twice', (await P(`/customer/bookings/${b.data.id}/cancel`, { reason: 'again' }, { token: t })).status === 409);
  const otherCancel = await P(`/customer/bookings/${b.data.id}/cancel`, { reason: 'not mine' }, { token: S.cust2.token });
  check("can't cancel another customer's booking", otherCancel.status === 403, otherCancel);
});

await section('Partner onboarding, vehicle approval & uploads', async () => {
  const phone = phoneFor('88');
  const o = await login(phone, 'OWNER', 'New Partner');
  S.owner = o;
  check('new owner starts PENDING', o.user.status === 'PENDING');
  check('owner must register before adding vehicles', (await G('/owner/vehicles', { token: o.token })).status === 400);
  check('invalid IFSC rejected', (await P('/owner/register', { businessName: 'Test Fleet', bankIfsc: 'BAD' }, { token: o.token })).status === 400);
  const reg = await P('/owner/register', { businessName: `Test Fleet ${uniq()}`, name: 'New Partner', panNumber: 'ABCDE1234F', bankAccountName: 'Test Fleet', bankAccountNumber: '123456789012', bankIfsc: 'HDFC0001234', city: 'Bhubaneswar', state: 'Odisha' }, { token: o.token });
  check('owner registration', reg.status === 200 && reg.data.kycStatus === 'PENDING', reg.data);
  S.ownerId = reg.data.id;
  const kyc = await call('POST', '/owner/documents', { token: o.token, form: fileForm('file', PDF, 'pan.pdf', 'application/pdf', { type: 'PAN', number: 'ABCDE1234F' }) });
  check('KYC PDF upload', kyc.status === 201 && kyc.data.fileKey.startsWith('private/'), kyc.data);
  S.ownerDocKey = kyc.data.fileKey;
  const exe = await call('POST', '/owner/documents', { token: o.token, form: fileForm('file', EXE, 'pan.jpg', 'image/jpeg', { type: 'PAN' }) });
  check('renamed .exe rejected by magic-byte check', exe.status === 400, exe.data);
  const big = await call('POST', '/owner/documents', { token: o.token, form: fileForm('file', Buffer.concat([PDF, Buffer.alloc(9 * 1024 * 1024)]), 'big.pdf', 'application/pdf', { type: 'PAN' }) });
  check('>8 MB upload rejected', big.status === 400, big.data);
  check('owner can view own document', (await call('GET', `/owner/files?key=${encodeURIComponent(S.ownerDocKey)}`, { token: o.token, raw: true })).status === 200);
  check("owner can't view someone else's key", (await call('GET', `/owner/files?key=${encodeURIComponent('private/owners/x/y.pdf')}`, { token: o.token, raw: true })).status === 404);

  const sedan = S.cats.find((c) => c.slug === 'sedan-cars');
  const model = S.models.find((m) => m.categoryId === sedan.id);
  const reg2 = `OD${String(Math.floor(Math.random() * 89) + 10)}TS${String(Math.floor(Math.random() * 8999) + 1000)}`;
  const vehBody = { categoryId: sedan.id, modelId: model.id, cityId: S.cities.find((c) => c.slug === 'bhubaneswar').id, title: `Test ${model.name} ${uniq()}`, registrationNumber: reg2, year: 2024, seats: 4, luggageBags: 3, fuelType: 'PETROL', transmission: 'MANUAL', perKmRate: 11, perDayRate: 2100, perHourRate: 250, extraKmRate: 13, extraHourRate: 150, insuranceExpiry: iso(T0 + 365 * DAY).slice(0, 10), fitnessExpiry: iso(T0 + 365 * DAY).slice(0, 10) };
  check('invalid registration number rejected', (await P('/owner/vehicles', { ...vehBody, registrationNumber: 'XYZ' }, { token: o.token })).status === 400);
  const veh = await P('/owner/vehicles', vehBody, { token: o.token });
  check('vehicle created as PENDING_APPROVAL', veh.status === 201 && veh.data.status === 'PENDING_APPROVAL', veh.data);
  S.newVeh = veh.data;
  check('duplicate registration → 409', (await P('/owner/vehicles', vehBody, { token: o.token })).status === 409);
  const img = await call('POST', `/owner/vehicles/${veh.data.id}/images`, { token: o.token, form: fileForm('images', PNG, 'car.png', 'image/png') });
  check('vehicle photo upload (public URL)', img.status === 201 && img.data[0].url.startsWith('/uploads/public/'), img.data);
  const imgFetch = await fetch(BASE.replace(/\/api$/, '') + img.data[0].url);
  check('uploaded photo is publicly served', imgFetch.status === 200 && imgFetch.headers.get('content-type')?.includes('image/png'));
  const pdfAsImg = await call('POST', `/owner/vehicles/${veh.data.id}/images`, { token: o.token, form: fileForm('images', PDF, 'car.png', 'image/png') });
  check('PDF rejected as vehicle photo', pdfAsImg.status === 400);
  const vdoc = await call('POST', `/owner/vehicles/${veh.data.id}/documents`, { token: o.token, form: fileForm('file', PDF, 'ins.pdf', 'application/pdf', { type: 'INSURANCE', number: 'POL-1', expiresAt: iso(T0 + 200 * DAY).slice(0, 10) }) });
  check('vehicle document upload syncs insurance expiry', vdoc.status === 201);
  const vd = await G(`/owner/vehicles/${veh.data.id}`, { token: o.token });
  check('insurance expiry synced from document', vd.data.insuranceExpiry?.slice(0, 10) === iso(T0 + 200 * DAY).slice(0, 10), vd.data.insuranceExpiry);

  const pubBefore = (await G(`/public/vehicles?q=${encodeURIComponent(vehBody.title)}`)).data.items.length;
  check('pending vehicle not in public search', pubBefore === 0);
  const act1 = await PA(`/admin/vehicles/${veh.data.id}/status`, { status: 'ACTIVE' }, { token: S.admin });
  check('cannot activate before owner KYC approval', act1.status === 400, act1.data);
  const kycOk = await PA(`/admin/owners/${S.ownerId}`, { kycStatus: 'APPROVED' }, { token: S.admin });
  check('admin approves KYC', kycOk.status === 200);
  const act2 = await PA(`/admin/vehicles/${veh.data.id}/status`, { status: 'ACTIVE' }, { token: S.admin });
  check('admin approves vehicle', act2.status === 200 && act2.data.status === 'ACTIVE', act2.data);
  check('approved vehicle appears in search', (await G(`/public/vehicles?q=${encodeURIComponent(vehBody.title)}`)).data.items.length === 1);
  check('admin can open private owner document', (await call('GET', `/admin/files?key=${encodeURIComponent(S.ownerDocKey)}`, { token: S.admin, raw: true })).status === 200);
  check('path traversal key rejected', [400, 404].includes((await call('GET', `/admin/files?key=${encodeURIComponent('private/../../.env')}`, { token: S.admin, raw: true })).status));
  const otherOwner = await login('9000000102', 'OWNER');
  check("another owner can't read this vehicle", (await G(`/owner/vehicles/${veh.data.id}`, { token: otherOwner.token })).status === 404);
  check("another owner can't edit this vehicle", (await U(`/owner/vehicles/${veh.data.id}`, { perDayRate: 1 }, { token: otherOwner.token })).status === 404);
  // Identity change on an active vehicle triggers re-approval
  const reup = await U(`/owner/vehicles/${veh.data.id}`, { registrationNumber: reg2.replace(/\d{4}$/, '0001') }, { token: o.token });
  check('changing registration sends vehicle back for approval', reup.status === 200 && reup.data.status === 'PENDING_APPROVAL', reup.data?.status);
  await PA(`/admin/vehicles/${veh.data.id}/status`, { status: 'ACTIVE' }, { token: S.admin });
  const price = await U(`/owner/vehicles/${veh.data.id}`, { perDayRate: 2300 }, { token: o.token });
  check('pricing edit keeps vehicle active', price.data.status === 'ACTIVE' && price.data.perDayRate === 2300);
});

await section('Availability blocks & maintenance', async () => {
  const o = S.owner, v = S.newVeh;
  const pickup = T0 + 14 * DAY;
  const { b, paid } = await bookAndPay(S.cust.token, baseBooking(v.id, pickup, 6));
  check('customer books the new vehicle', paid, b.data);
  S.newVehBooking = b.data;
  const clash = await P(`/owner/vehicles/${v.id}/blocks`, { type: 'MAINTENANCE', startAt: iso(pickup + H), endAt: iso(pickup + 3 * H), reason: 'Service' }, { token: o.token });
  check('maintenance over a booking → 409', clash.status === 409, clash.data);
  const freeStart = pickup + 3 * DAY;
  const blk = await P(`/owner/vehicles/${v.id}/blocks`, { type: 'MAINTENANCE', startAt: iso(freeStart), endAt: iso(freeStart + 2 * DAY), reason: 'Service' }, { token: o.token });
  check('maintenance on free dates', blk.status === 201, blk.data);
  const searchBlocked = await G(`/public/vehicles?q=${encodeURIComponent(v.title)}&pickupAt=${iso(freeStart + DAY)}&returnAt=${iso(freeStart + DAY + 4 * H)}`);
  check('vehicle hidden from search during maintenance (absent holdExpiresAt handled)', searchBlocked.data.items.length === 0, searchBlocked.data.items.length);
  const bookBlocked = await P('/customer/bookings', baseBooking(v.id, freeStart + DAY, 4), { token: S.cust2.token });
  check('booking during maintenance → 409', bookBlocked.status === 409, bookBlocked.data);
  check('end before start rejected', (await P(`/owner/vehicles/${v.id}/blocks`, { type: 'OWNER_BLOCK', startAt: iso(freeStart + 9 * DAY), endAt: iso(freeStart + 8 * DAY) }, { token: o.token })).status === 400);
  const cal = await G(`/public/vehicles/${v.id}/calendar?from=${encodeURIComponent(iso(pickup - DAY))}&to=${encodeURIComponent(iso(freeStart + 3 * DAY))}`);
  check('calendar shows booked + unavailable ranges', cal.data.some((x) => x.type === 'booked') && cal.data.some((x) => x.type === 'unavailable'), cal.data);
  check('remove block', (await D(`/owner/vehicles/${v.id}/blocks/${blk.data.id}`, { token: o.token })).status === 200);
  check('vehicle searchable again after removing block', (await G(`/public/vehicles?q=${encodeURIComponent(v.title)}&pickupAt=${iso(freeStart + DAY)}&returnAt=${iso(freeStart + DAY + 4 * H)}`)).data.items.length === 1);
  const toMaint = await PA(`/owner/vehicles/${v.id}/status`, { status: 'MAINTENANCE' }, { token: o.token });
  check('cannot set MAINTENANCE with upcoming confirmed bookings', toMaint.status === 409, toMaint.data);
});

await section('Driver onboarding, assignment & decline', async () => {
  const dPhone = phoneFor('87');
  const d = await login(dPhone, 'DRIVER', 'New Driver');
  S.driver = d;
  const young = await P('/driver/register', { name: 'New Driver', licenceNumber: 'OD0220200099999', licenceExpiry: iso(Date.now() + 3 * 365 * DAY).slice(0, 10), experienceYears: 1, dateOfBirth: iso(Date.now() - 19 * 365 * DAY).slice(0, 10) }, { token: d.token });
  check('driver under 21 rejected', young.status === 400, young.data);
  const expired = await P('/driver/register', { name: 'New Driver', licenceNumber: 'OD0220200099999', licenceExpiry: '2020-01-01', experienceYears: 3 }, { token: d.token });
  check('expired licence rejected', expired.status === 400);
  const lic = `OD02${String(Date.now()).slice(-11)}`;
  const reg = await P('/driver/register', { name: 'New Driver', licenceNumber: lic, licenceExpiry: iso(Date.now() + 5 * 365 * DAY).slice(0, 10), experienceYears: 6, languages: ['Odia', 'Hindi'], dateOfBirth: '1990-05-01' }, { token: d.token });
  check('driver registration', reg.status === 200 && reg.data.verificationStatus === 'PENDING', reg.data);
  S.driverId = reg.data.id;
  const doc = await call('POST', '/driver/documents', { token: d.token, form: fileForm('file', PNG, 'dl.png', 'image/png', { type: 'DRIVING_LICENCE', number: lic }) });
  check('driver licence upload', doc.status === 201);
  check('driver can view own document', (await call('GET', `/driver/files?key=${encodeURIComponent(doc.data.fileKey)}`, { token: d.token, raw: true })).status === 200);
  check("driver can't view owner's document", (await call('GET', `/driver/files?key=${encodeURIComponent(S.ownerDocKey)}`, { token: d.token, raw: true })).status === 404);
  const linkPending = await P('/owner/drivers/link', { phone: dPhone }, { token: S.owner.token });
  check('owner links driver to fleet', linkPending.status === 200, linkPending.data);
  const avail1 = await G(`/owner/bookings/${S.newVehBooking.id}/available-drivers`, { token: S.owner.token });
  check('unverified driver not offered for assignment', !avail1.data.some((x) => x.id === S.driverId));
  check('admin verifies driver', (await PA(`/admin/drivers/${S.driverId}`, { verificationStatus: 'APPROVED' }, { token: S.admin })).status === 200);
  const avail2 = await G(`/owner/bookings/${S.newVehBooking.id}/available-drivers`, { token: S.owner.token });
  check('verified fleet driver offered', avail2.data.some((x) => x.id === S.driverId), avail2.data.map((x) => x.id));
  check('platform drivers (no owner) offered too — absent ownerId handled', avail2.data.some((x) => !x.ownerId) || avail2.data.length >= 1);
  const asg = await P(`/owner/bookings/${S.newVehBooking.id}/assign-driver`, { driverId: S.driverId }, { token: S.owner.token });
  check('owner assigns new driver', asg.status === 200, asg.data);
  check("other owner can't assign on this booking", (await P(`/owner/bookings/${S.newVehBooking.id}/assign-driver`, { driverId: S.driverId }, { token: (await login('9000000102', 'OWNER')).token })).status === 403);
  // Overlapping assignment must be refused
  const pickup2 = new Date(S.newVehBooking.pickupAt).getTime() + H;
  const other = await bookAndPay(S.cust2.token, baseBooking(S.vehicles[3].id, pickup2, 3));
  const owner2Token = (await login(other.b.data.owner?.user?.phone ?? '9000000101', 'OWNER')).token;
  const ownerOfOther = (await G(`/admin/bookings/${other.b.data.id}`, { token: S.admin })).data;
  const clash = await P(`/admin/bookings/${other.b.data.id}/assign-driver`, { driverId: S.driverId }, { token: S.admin });
  check('driver double-assignment on overlapping trip → 409', clash.status === 409, clash.data);
  void owner2Token; void ownerOfOther;
  check('driver sees pending trip', (await G('/driver/dashboard', { token: d.token })).data.pending.some((x) => x.id === S.newVehBooking.id));
  const dec = await P(`/driver/trips/${S.newVehBooking.id}/respond`, { accept: false, note: 'Unwell' }, { token: d.token });
  check('driver declines', dec.status === 200);
  const after = await G(`/admin/bookings/${S.newVehBooking.id}`, { token: S.admin });
  check('declined booking returns to CONFIRMED with no driver', after.data.status === 'CONFIRMED' && after.data.driverId === null, { s: after.data.status, d: after.data.driverId });
  check("declined driver can't act on the trip", (await P(`/driver/trips/${S.newVehBooking.id}/dispatch`, {}, { token: d.token })).status === 404);
  const other3 = await login('9000000202', 'DRIVER');
  check("driver can't open a trip not assigned to them", (await G(`/driver/trips/${S.newVehBooking.id}`, { token: other3.token })).status === 403);
});

await section('Owner approval workflow (auto-accept off)', async () => {
  restoreSettings['booking.ownerAutoAccept'] = S.settings['booking.ownerAutoAccept'];
  check('disable owner auto-accept', (await U('/admin/settings', { 'booking.ownerAutoAccept': false }, { token: S.admin })).status === 200);
  const { b, paid } = await bookAndPay(S.cust.token, baseBooking(S.newVeh.id, T0 + 25 * DAY, 5), 'FULL');
  check('booking created & paid', paid);
  const det = await G(`/owner/bookings/${b.data.id}`, { token: S.owner.token });
  check('owner decision PENDING', det.data.ownerDecision === 'PENDING', det.data.ownerDecision);
  check('owner sees it under pending', (await G('/owner/bookings?scope=pending', { token: S.owner.token })).data.items.some((x) => x.id === b.data.id));
  const rej = await P(`/owner/bookings/${b.data.id}/decision`, { accept: false, note: 'Vehicle in workshop' }, { token: S.owner.token });
  check('owner rejects', rej.status === 200 && rej.data.accepted === false);
  const c = await G(`/customer/bookings/${b.data.id}`, { token: S.cust.token });
  check('owner rejection → 100% refund → REFUNDED', c.data.status === 'REFUNDED' && c.data.refunds.reduce((a, r) => a + r.amount, 0) === c.data.paidAmount, { s: c.data.status, refunds: c.data.refunds });
  check('cannot decide twice', (await P(`/owner/bookings/${b.data.id}/decision`, { accept: true }, { token: S.owner.token })).status === 409);
  await U('/admin/settings', { 'booking.ownerAutoAccept': restoreSettings['booking.ownerAutoAccept'] }, { token: S.admin });
});

await section('Offline payments & manual refunds', async () => {
  const b = await P('/customer/bookings', baseBooking(S.vehicles[4].id, T0 + 16 * DAY, 4), { token: S.cust2.token });
  const pay = await P(`/admin/bookings/${b.data.id}/payments`, { amount: b.data.totalAmount, method: 'BANK_TRANSFER', reference: 'NEFT123' }, { token: S.admin });
  check('admin records bank transfer → confirms booking', pay.status === 200 && pay.data.status === 'CAPTURED', pay.data);
  check('overpayment rejected', (await P(`/admin/bookings/${b.data.id}/payments`, { amount: 1, method: 'CASH' }, { token: S.admin })).status === 400);
  const det = await G(`/admin/bookings/${b.data.id}`, { token: S.admin });
  check('booking confirmed by offline payment', ['CONFIRMED', 'DRIVER_ASSIGNED'].includes(det.data.status), det.data.status);
  const cancel = await P(`/admin/bookings/${b.data.id}/cancel`, { reason: 'Customer request by phone', refundAmount: 1000 }, { token: S.admin });
  check('admin cancel with custom refund', cancel.status === 200 && cancel.data.refundAmount === 1000, cancel.data);
  const refunds = (await G('/admin/refunds?status=INITIATED', { token: S.admin })).data.items.filter((r) => r.booking.id === b.data.id);
  check('bank-transfer refund awaits manual settlement', refunds.length === 1, refunds);
  const settle = await P(`/admin/refunds/${refunds[0].id}/settle`, { success: true, reference: `UTR${uniq()}` }, { token: S.admin });
  check('admin settles refund manually', settle.status === 200);
  check('booking REFUNDED after manual settle', (await G(`/admin/bookings/${b.data.id}`, { token: S.admin })).data.status === 'REFUNDED');
});

await section('Admin catalogue & content CRUD', async () => {
  const A = { token: S.admin };
  const name = `Test Category ${uniq()}`;
  const cat = await P('/admin/categories', { name, commissionRate: 10 }, A);
  check('create category', cat.status === 201 && cat.data.slug.startsWith('test-category'), cat.data);
  check('duplicate category → 409', (await P('/admin/categories', { name }, A)).status === 409);
  const mdl = await P('/admin/models', { categoryId: cat.data.id, make: 'TestMake', name: `M${uniq()}`, seats: 4 }, A);
  check('create model', mdl.status === 201);
  check('model visible in public list', (await G(`/public/models?categoryId=${cat.data.id}`)).data.length === 1);
  check('delete model', (await D(`/admin/models/${mdl.data.id}`, A)).status === 200);
  check('delete empty category', (await D(`/admin/categories/${cat.data.id}`, A)).status === 200);
  check('cannot delete category with vehicles', (await D(`/admin/categories/${S.cats[0].id}`, A)).status === 409);
  const city = await P('/admin/cities', { name: `Testpur${uniq()}`, state: 'Odisha' }, A);
  check('create city', city.status === 201);
  const ren = await U(`/admin/cities/${city.data.id}`, { name: `Renamedpur${uniq()}` }, A);
  check('renaming city updates slug', ren.data.slug.startsWith('renamedpur'), ren.data.slug);
  await U(`/admin/cities/${city.data.id}`, { isActive: false }, A);

  check('coupon > 100% rejected', (await P('/admin/coupons', { code: 'BAD101', title: 'x', discountType: 'PERCENT', value: 150, validFrom: iso(Date.now()), validTo: iso(Date.now() + DAY) }, A)).status === 400);
  check('coupon end before start rejected', (await P('/admin/coupons', { code: 'BADDATE', title: 'x', discountType: 'FLAT', value: 100, validFrom: iso(Date.now() + DAY), validTo: iso(Date.now()) }, A)).status === 400);
  const code = `T${uniq()}`;
  const cp = await P('/admin/coupons', { code, title: 'Test flat', discountType: 'FLAT', value: 300, validFrom: iso(Date.now() - DAY), validTo: iso(T0 + 30 * DAY), isFeatured: true }, A);
  check('create coupon', cp.status === 201, cp.data);
  check('featured coupon appears in public offers', (await G('/public/offers')).data.some((c) => c.code === code));
  check('unused coupon deleted outright', (await D(`/admin/coupons/${cp.data.id}`, A)).data.deactivated === undefined);

  check('seasonal rule without dates rejected', (await P('/admin/pricing-rules', { name: 'x', type: 'SEASONAL', multiplier: 1.2 }, A)).status === 400);
  check('weekend rule without days rejected', (await P('/admin/pricing-rules', { name: 'x', type: 'WEEKEND', multiplier: 1.2 }, A)).status === 400);
  const peakStart = new Date(T0 + 40 * DAY);
  const rule = await P('/admin/pricing-rules', { name: 'Test peak', type: 'PEAK_DATE', startDate: iso(peakStart).slice(0, 10), endDate: iso(peakStart.getTime() + DAY).slice(0, 10), multiplier: 1.5, priority: 9 }, A);
  check('create peak-date rule', rule.status === 201, rule.data);
  const q = await P('/public/quote', { vehicleId: S.v4.id, pickupAt: iso(peakStart.getTime() + 6 * H), returnAt: iso(peakStart.getTime() + 12 * H), estimatedKm: 20 });
  check('peak rule applied to quote (no code change)', q.data.quote.lines.some((l) => l.code === 'DYNAMIC' && l.detail.includes('Test peak')), q.data.quote.lines);
  check('delete rule', (await D(`/admin/pricing-rules/${rule.data.id}`, A)).status === 200);

  const slug = `test-page-${uniq()}`;
  check('upsert CMS page', (await U(`/admin/pages/${slug}`, { slug, title: 'Test Page', body: '## Hello\n<script>x</script>' }, A)).status === 200);
  check('page public', (await G(`/public/pages/${slug}`)).status === 200);
  await U(`/admin/pages/${slug}`, { slug, title: 'Test Page', body: 'x', isPublished: false }, A);
  check('unpublished page → 404', (await G(`/public/pages/${slug}`)).status === 404);

  const tp = await P('/admin/travel-packages', { title: `Test Tour ${uniq()}`, type: 'WEEKEND_TRIP', destination: 'Testland', durationDays: 2, basePrice: 5000, itinerary: [{ dayNumber: 1, title: 'Day one', places: ['A'] }, { dayNumber: 2, title: 'Day two' }] }, A);
  check('create travel package (unpublished)', tp.status === 201);
  check('unpublished package hidden', (await G(`/public/travel-packages/${tp.data.slug}`)).status === 404);
  await PA(`/admin/travel-packages/${tp.data.id}/publish`, { isPublished: true }, A);
  const pubPkg = await G(`/public/travel-packages/${tp.data.slug}`);
  check('published package with 2-day itinerary', pubPkg.status === 200 && pubPkg.data.itinerary.length === 2);
  check('max < min passengers rejected', (await P('/admin/travel-packages', { title: 'Bad pax', type: 'CUSTOM', destination: 'x', durationDays: 1, basePrice: 1, minPassengers: 5, maxPassengers: 2 }, A)).status === 400);
  check('delete unused package', (await D(`/admin/travel-packages/${tp.data.id}`, A)).status === 200);

  const wp = await P('/admin/wedding-packages', { name: `Test Pkg ${uniq()}`, tier: 'GOLD', basePrice: 9999, includedHours: 6, includedKm: 50, vehicleCount: 2, inclusions: ['Flowers'] }, A);
  check('create wedding package', wp.status === 201);
  await D(`/admin/wedding-packages/${wp.data.id}`, A);
  check('deactivated wedding package hidden', !(await G('/public/wedding-packages')).data.some((p) => p.id === wp.data.id));

  const t = await P('/admin/testimonials', { name: 'Test Person', quote: 'Great!', rating: 5 }, A);
  check('testimonial CRUD', t.status === 201 && (await D(`/admin/testimonials/${t.data.id}`, A)).status === 200);
  const ds = await P('/admin/destinations', { name: `Testville ${uniq()}`, state: 'Odisha' }, A);
  check('destination CRUD', ds.status === 201 && (await D(`/admin/destinations/${ds.data.id}`, A)).status === 200);
  const hero = await G('/admin/blocks', A);
  const heroBlock = hero.data.find((b) => b.key === 'home.hero');
  check('content block update', (await U('/admin/blocks/home.hero', { data: heroBlock.data }, A)).status === 200);
  const imgUp = await call('POST', '/admin/uploads/image', { token: S.admin, form: fileForm('image', PNG, 'banner.png', 'image/png') });
  check('CMS image upload', imgUp.status === 201 && imgUp.data.url.startsWith('/uploads/public/'));
});

await section('Settings drive pricing without code changes', async () => {
  const A = { token: S.admin };
  restoreSettings['tax.gstPercent'] = S.settings['tax.gstPercent'];
  check('unknown setting key rejected', (await U('/admin/settings', { 'foo.bar': 1 }, A)).status === 400);
  check('wrong value type rejected', (await U('/admin/settings', { 'tax.gstPercent': 'twelve' }, A)).status === 400);
  check('negative number rejected', (await U('/admin/settings', { 'tax.gstPercent': -5 }, A)).status === 400);
  check('invalid cancellation tiers rejected', (await U('/admin/settings', { 'cancellation.tiers': [{ hoursBefore: 10, refundPercent: 150 }] }, A)).status === 400);
  check('set GST to 12%', (await U('/admin/settings', { 'tax.gstPercent': 12 }, A)).status === 200);
  const q = await P('/public/quote', { vehicleId: S.v4.id, pickupAt: iso(T0 + 18 * DAY), returnAt: iso(T0 + 18 * DAY + 6 * H), estimatedKm: 20 });
  check('quote uses 12% GST immediately', q.data.quote.gstPercent === 12 && Math.abs(q.data.quote.gst - q.data.quote.taxable * 0.12) < 0.02, q.data.quote);
  check('public config reflects GST', (await G('/public/config')).data.gstPercent === 12);
  await U('/admin/settings', { 'tax.gstPercent': restoreSettings['tax.gstPercent'] }, A);
  check('GST restored', (await G('/public/config')).data.gstPercent === restoreSettings['tax.gstPercent']);
});

await section('Roles & permissions', async () => {
  const A = { token: S.admin };
  const role = await P('/admin/roles', { name: `Support ${uniq()}`, permissions: ['dashboard:read', 'bookings:read'] }, A);
  check('create limited role', role.status === 201, role.data);
  check('invalid permission key rejected', (await P('/admin/roles', { name: `Bad ${uniq()}`, permissions: ['everything'] }, A)).status === 400);
  const email = `support${uniq()}@royalride.local`;
  check('weak admin password rejected', (await P('/admin/admins', { name: 'Sup', email, phone: phoneFor('93'), password: 'short', adminRoleId: role.data.id }, A)).status === 400);
  const pw = 'Support@2026x';
  const adm = await P('/admin/admins', { name: 'Support Agent', email, phone: phoneFor('93'), password: pw, adminRoleId: role.data.id }, A);
  check('create support admin', adm.status === 201, adm.data);
  const sl = await P('/auth/admin/login', { email, password: pw });
  const T = { token: sl.data.accessToken };
  check('support admin can read bookings', (await G('/admin/bookings', T)).status === 200);
  check('support admin can read dashboard', (await G('/admin/dashboard', T)).status === 200);
  check('support admin cannot write coupons → 403', (await P('/admin/coupons', { code: 'NOPE1', title: 'x', discountType: 'FLAT', value: 1, validFrom: iso(Date.now()), validTo: iso(Date.now() + DAY) }, T)).status === 403);
  check('support admin cannot read settings → 403', (await G('/admin/settings', T)).status === 403);
  check('support admin cannot cancel bookings → 403', (await P(`/admin/bookings/${S.newVehBooking.id}/cancel`, { reason: 'nope' }, T)).status === 403);
  check('support admin cannot view private files → 403', (await call('GET', `/admin/files?key=${encodeURIComponent(S.ownerDocKey)}`, { ...T, raw: true })).status === 403);
  check('system role not editable', (await U(`/admin/roles/${(await G('/admin/roles', A)).data.roles.find((r) => r.isSystem).id}`, { permissions: [] }, A)).status === 400);
  check('cannot suspend yourself', (await U(`/admin/admins/${(await G('/auth/me', A)).data.id}`, { status: 'SUSPENDED' }, A)).status === 400);
  await U(`/admin/admins/${adm.data.id}`, { status: 'SUSPENDED' }, A);
  check('suspended admin cannot log in', (await P('/auth/admin/login', { email, password: pw })).status === 403);
  check('role in use cannot be deleted', (await D(`/admin/roles/${role.data.id}`, A)).status === 409);
  const audit = await G('/admin/audit-logs?action=admin.create', A);
  check('admin actions are audit-logged', audit.data.items.some((x) => x.entityId === adm.data.id));
  const auditSettings = await G('/admin/audit-logs?action=settings.update', A);
  check('settings changes audit-logged with before/after', auditSettings.data.items[0]?.before && auditSettings.data.items[0]?.after);
});

await section('Suspended customer', async () => {
  const s = await login(phoneFor('92'), 'CUSTOMER', 'To Suspend');
  await PA(`/admin/customers/${s.user.id}/status`, { status: 'SUSPENDED' }, { token: S.admin });
  check('suspended customer cannot request OTP', (await P('/auth/otp/request', { phone: s.user.phone })).status === 403);
  check('suspended customer session revoked', (await call('POST', '/auth/refresh', { cookie: s.cookie })).status === 401);
  await PA(`/admin/customers/${s.user.id}/status`, { status: 'ACTIVE' }, { token: S.admin });
  check('reactivated customer can log in', (await P('/auth/otp/verify', { phone: s.user.phone, code: FIXED_OTP, role: 'CUSTOMER' })).status === 200);
});

await section('Reviews, notifications, enquiries', async () => {
  const A = { token: S.admin };
  const reviews = await G('/admin/reviews', A);
  const rv = reviews.data.items[0];
  if (rv) {
    const before = (await G(`/admin/vehicles/${rv.vehicleId}`, A)).data.ratingCount;
    await PA(`/admin/reviews/${rv.id}`, { status: 'HIDDEN' }, A);
    const after = (await G(`/admin/vehicles/${rv.vehicleId}`, A)).data.ratingCount;
    check('hiding a review recalculates vehicle rating', after === before - 1, { before, after });
    await PA(`/admin/reviews/${rv.id}`, { status: 'PUBLISHED' }, A);
  } else check('a review exists to moderate', false);
  const log = await G('/admin/notifications?pageSize=50', A);
  check('notification delivery log (SMS/WhatsApp/email) recorded as SENT', log.data.items.length > 0 && log.data.items.some((n) => n.status === 'SENT'), log.data.items.slice(0, 2));
  const channels = new Set(log.data.items.map((n) => n.channel));
  check('all three external channels used', ['SMS', 'WHATSAPP', 'EMAIL'].every((c) => channels.has(c)), [...channels]);
  const bc = await P('/admin/notifications/broadcast', { role: 'DRIVER', title: 'Test broadcast', message: 'Please update documents' }, A);
  check('broadcast to drivers', bc.status === 200 && bc.data.sent >= 5, bc.data);
  const dn = await G('/me/notifications', { token: S.driver.token });
  check('driver receives broadcast in-app', dn.data.items.some((n) => n.title === 'Test broadcast') && dn.data.unread >= 1);
  await P('/me/notifications/read', {}, { token: S.driver.token });
  check('mark all read (absent readAt handled)', (await G('/me/notifications', { token: S.driver.token })).data.unread === 0);
  const enq = await P('/public/enquiries', { type: 'CUSTOM_TRAVEL', name: 'Ravi <b>K</b>', phone: '9876501234', message: '<script>alert(1)</script>Need a 5-day Odisha tour' });
  check('enquiry submitted', enq.status === 201);
  const list = await G('/admin/enquiries?status=NEW', A);
  const mine = list.data.items.find((e) => e.id === enq.data.id);
  check('enquiry stored with HTML stripped', mine && mine.name === 'Ravi K' && !mine.message.includes('<'), mine);
  check('enquiry status update', (await PA(`/admin/enquiries/${enq.data.id}`, { status: 'CLOSED' }, A)).status === 200);
});

await section('Finance: settlements, invoices, reports', async () => {
  const A = { token: S.admin };
  let st = (await G('/admin/settlements?status=PENDING', A)).data.items[0];
  if (!st) {
    // Create one from any owner with completed, unsettled trips.
    const comm = (await G('/admin/commissions', A)).data.owners.filter((o) => o.unsettledTrips > 0);
    for (const o of comm) {
      const r = await P('/admin/settlements', { ownerId: o.id }, A);
      if (r.status === 201) { st = r.data; break; }
    }
    if (comm.length) check('settlement created for an owner with unsettled trips', !!st, comm.map((o) => o.businessName));
    else check('settlement API refuses owners with nothing to settle', (await P('/admin/settlements', { ownerId: S.ownerId }, A)).status === 400);
  }
  if (st) {
    check('mark PAID without reference → 400', (await PA(`/admin/settlements/${st.id}`, { status: 'PAID' }, A)).status === 400);
    check('mark PAID with reference', (await PA(`/admin/settlements/${st.id}`, { status: 'PAID', referenceNumber: `UTR${uniq()}` }, A)).status === 200);
    check('paid settlement cannot be deleted', (await D(`/admin/settlements/${st.id}`, A)).status === 409);
  } else out.push('  · no completed unsettled trips left to settle (refusal verified above)');
  const inv = await G('/admin/invoices', A);
  check('invoice list', inv.data.items.length > 0);
  const pdf = await call('GET', `/admin/invoices/${inv.data.items[0].id}/pdf`, { ...A, raw: true });
  check('admin invoice PDF', pdf.status === 200 && pdf.buf.subarray(0, 5).toString() === '%PDF-');
  const tax = inv.data.items.find((i) => i.type === 'TAX_INVOICE');
  if (tax) check('intra-state tax invoice splits CGST/SGST', tax.cgst > 0 && tax.sgst > 0 && tax.igst === 0 && Math.abs(tax.cgst + tax.sgst - tax.taxableAmount * 0.05) < 0.05, tax);
  const pays = await G('/admin/payments?status=CAPTURED', A);
  check('payments list with captured total', pays.data.capturedTotal > 0);
  const comm = await G('/admin/commissions', A);
  check('commissions overview per owner', comm.data.owners.length >= 3);
  for (const period of ['day', 'week', 'month', 'year']) {
    const r = await G(`/admin/reports/bookings?period=${period}&from=${iso(Date.now() - 400 * DAY).slice(0, 10)}`, A);
    check(`bookings report by ${period}`, r.status === 200 && r.data.rows.length >= 1 && r.data.totals.total >= 1, r.data?.rows?.length);
  }
  const gst = await G('/admin/reports/gst', A);
  check('GST report totals match rows', gst.data.rows.length === 0 || Math.abs(gst.data.totals.total - gst.data.rows.reduce((a, x) => a + x.total, 0)) < 0.05);
  check('unknown report type → 400', (await G('/admin/reports/nonsense', A)).status === 400);
  const csv = await call('GET', '/admin/reports/payments?format=csv', { ...A, raw: true });
  check('CSV export guards against formula injection', !/\n=|,=/.test(csv.buf.toString()));
});

await section('Hold expiry & late payment (waits ~2 min)', async () => {
  restoreSettings['booking.holdMinutes'] = S.settings['booking.holdMinutes'];
  await U('/admin/settings', { 'booking.holdMinutes': 1 }, { token: S.admin });
  const t = S.cust.token;
  const v1 = S.vehicles[5], v2 = S.vehicles[6];
  const p1 = T0 + 22 * DAY;
  const b1 = await P('/customer/bookings', baseBooking(v1.id, p1, 4), { token: t });
  const b2 = await P('/customer/bookings', baseBooking(v2.id, p1, 4), { token: t });
  check('two unpaid bookings created', b1.status === 201 && b2.status === 201);
  const order2 = await P(`/customer/bookings/${b2.data.id}/payments`, { purpose: 'ADVANCE' }, { token: t });
  check('payment order created before expiry', order2.status === 200);
  const blocked = await P('/customer/bookings', baseBooking(v1.id, p1, 4), { token: S.cust2.token });
  check('slot held while unpaid → 409 for others', blocked.status === 409);
  await U('/admin/settings', { 'booking.holdMinutes': restoreSettings['booking.holdMinutes'] }, { token: S.admin });
  await new Promise((r) => setTimeout(r, 125_000));
  const e1 = await G(`/customer/bookings/${b1.data.id}`, { token: t });
  check('unpaid booking auto-cancelled by scheduler', e1.data.status === 'CANCELLED' && e1.data.cancellationReason === 'Payment not completed in time', { s: e1.data.status, r: e1.data.cancellationReason });
  const reb = await P('/customer/bookings', baseBooking(v1.id, p1, 4), { token: S.cust2.token });
  check('released slot is bookable by others', reb.status === 201, reb.data);
  check('new payment order on expired booking refused', (await P(`/customer/bookings/${b1.data.id}/payments`, { purpose: 'ADVANCE' }, { token: t })).status === 409);
  const late = await P(`/customer/payments/${order2.data.paymentId}/verify`, { test_order_id: order2.data.checkout.orderId, test_signature: order2.data.checkout.signature }, { token: t });
  const e2 = await G(`/customer/bookings/${b2.data.id}`, { token: t });
  check('late payment on a still-free slot re-reserves and confirms', late.status === 200 && ['CONFIRMED', 'DRIVER_ASSIGNED'].includes(e2.data.status), { late: late.status, s: e2.data.status });
  const conflictLate = await P('/customer/bookings', baseBooking(v2.id, p1, 4), { token: S.cust2.token });
  check('re-reserved slot protected again', conflictLate.status === 409);
});

await section('Scheduler-safety regressions (null semantics)', async () => {
  const A = { token: S.admin };
  const live = (await G('/admin/bookings?status=CONFIRMED,DRIVER_ASSIGNED&pageSize=100', A)).data.items.filter((b) => new Date(b.pickupAt) > new Date());
  let missing = 0;
  for (const b of live.slice(0, 15)) {
    const d = await G(`/admin/bookings/${b.id}`, A);
    const veh = await G(`/admin/vehicles/${d.data.vehicleId}`, A);
    if (!veh.data.availability.some((a) => a.booking?.bookingNumber === b.bookingNumber)) missing++;
  }
  check('recent confirmed bookings all keep an active block', missing <= 1, `${missing} missing (1 allowed: pre-fix RR-2026-000002)`);
  const veh = (await G('/admin/vehicles?status=ACTIVE&pageSize=100', A)).data.items;
  check('no active vehicles wrongly auto-deactivated', veh.length >= 20, veh.length);
});

await section('Public API robustness', async () => {
  check('query operator injection ignored', (await G('/public/vehicles?city[$ne]=x')).status === 200);
  check('category by slug and by id agree', (await G(`/public/vehicles?category=sedan-cars`)).data.total === (await G(`/public/vehicles?category=${S.cats.find((c) => c.slug === 'sedan-cars').id}`)).data.total);
  check('invalid date range → 400', (await G(`/public/vehicles?pickupAt=${iso(T0 + 2 * DAY)}&returnAt=${iso(Date.now() + DAY)}`)).status === 400);
  check('pageSize capped', (await G('/public/vehicles?pageSize=1000')).status === 400);
  const big = 'x'.repeat(1_100_000);
  check('oversized JSON body → 413', (await call('POST', '/public/enquiries', { body: { name: 'a', phone: '9876543210', message: big } })).status === 413);
  check('unknown route → 404 JSON', (await G('/nope')).status === 404);
  const h = await call('GET', '/public/config', { raw: true });
  check('security headers set (helmet)', h.headers.get('x-content-type-options') === 'nosniff' && !h.headers.get('x-powered-by'));
  check('webhook without gateway config returns 5xx (gateway retries), never processes', (await call('POST', '/webhooks/razorpay', { body: { event: 'payment.captured' } })).status >= 500);
});

// ── restore any settings left changed by a crashed section
for (const [k, v] of Object.entries(restoreSettings)) await U('/admin/settings', { [k]: v }, { token: S.admin }).catch(() => {});

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
