// End-to-end API test against a RUNNING Royal Ride API in development mode
// (SMS_DRIVER=console so OTPs are returned, ALLOW_TEST_GATEWAY=true, seeded data).
// Usage: API=http://localhost:4700/api npm run test:e2e   — creates real test records in the database.
const BASE = process.env.API ?? 'http://localhost:4000/api';
let pass = 0, fail = 0;
const results = [];
process.on('uncaughtException', (e) => {
  console.log(results.join('\n'));
  console.log(`\nCRASH: ${e.stack?.split('\n').slice(0, 2).join(' ')}\n${pass} passed, ${fail} failed so far`);
  process.exit(1);
});
function check(name, cond, info = '') {
  if (cond) { pass++; results.push(`  ✓ ${name}`); }
  else { fail++; results.push(`  ✗ ${name} ${info}`); }
}
async function call(method, path, { token, body, raw } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return { status: res.status, headers: res.headers, buf: Buffer.from(await res.arrayBuffer()) };
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
}
async function otpLogin(phone, role, name) {
  const r1 = await call('POST', '/auth/otp/request', { body: { phone } });
  const code = r1.data?.devOtp;
  const r2 = await call('POST', '/auth/otp/verify', { body: { phone, code, role, name } });
  return { token: r2.data?.accessToken, user: r2.data?.user, status: r2.status, r1 };
}
const iso = (ms) => new Date(ms).toISOString();
const section = (t) => results.push(`\n${t}`);

// Use a unique customer number each run so the test is repeatable.
const rnd = String(Date.now()).slice(-7);
const custPhone = `98${rnd}1`.slice(0, 10);
const cust2Phone = `97${rnd}2`.slice(0, 10);

section('Public catalogue');
const cfg = await call('GET', '/public/config');
check('GET /public/config', cfg.status === 200 && cfg.data.contact?.phone);
const cats = await call('GET', '/public/categories');
check('6 categories seeded', cats.status === 200 && cats.data.length === 6, JSON.stringify(cats.data?.length));
const pkgs = await call('GET', '/public/wedding-packages');
check('4 wedding packages', pkgs.data?.length === 4);
const tp = await call('GET', '/public/travel-packages');
check('Travel packages published', tp.data?.length >= 6);
const page = await call('GET', '/public/pages/cancellation-policy');
check('CMS page', page.status === 200 && page.data.body.includes('72 hours'));

const pickup = Date.now() + 2.5 * 3600_000; // within the 3h start window, beyond 2h lead time
const ret = pickup + 8 * 3600_000;
const search = await call('GET', `/public/vehicles?city=bhubaneswar&pickupAt=${iso(pickup)}&returnAt=${iso(ret)}&purpose=LOCAL_TRAVEL&passengers=4&estimatedKm=60&withDriver=true&sort=price_asc`);
check('Search returns available vehicles with estimates', search.status === 200 && search.data.items.length > 0 && search.data.items[0].estimate?.total > 0, JSON.stringify(search.data).slice(0, 200));
const veh = search.data.items.find((v) => v.title.includes('Dzire')) ?? search.data.items[0];
const detail = await call('GET', `/public/vehicles/${veh.slug}`);
check('Vehicle details by slug', detail.status === 200 && detail.data.policies && Array.isArray(detail.data.similar));
const byId = await call('GET', `/public/vehicles/${veh.id}`);
check('Vehicle details by id', byId.status === 200);
const bad = await call('GET', `/public/vehicles/not-a-real-slug`);
check('Unknown slug → 404', bad.status === 404);

section('Customer auth');
const c = await otpLogin(custPhone, 'CUSTOMER', 'E2E Customer');
check('OTP sign-up returns token', c.status === 200 && !!c.token, JSON.stringify(c.r1.data));
const wrong = await call('POST', '/auth/otp/verify', { body: { phone: cust2Phone, code: '000000', role: 'CUSTOMER' } });
check('Wrong OTP rejected', wrong.status === 400);

section('Quote & coupon');
const q = await call('POST', '/public/quote', { token: c.token, body: { vehicleId: veh.id, purpose: 'LOCAL_TRAVEL', pickupAt: iso(pickup), returnAt: iso(ret), estimatedKm: 60, withDriver: true, couponCode: 'WELCOME10' } });
check('Quote with WELCOME10 applies discount', q.status === 200 && q.data.quote.discount > 0 && q.data.available === true, JSON.stringify(q.data).slice(0, 300));

section('Booking + payment');
const bookingBody = { vehicleId: veh.id, purpose: 'LOCAL_TRAVEL', withDriver: true, pickupAt: iso(pickup), returnAt: iso(ret), pickupAddress: 'Saheed Nagar, Bhubaneswar', dropAddress: 'Biju Patnaik Airport', estimatedKm: 60, passengers: 3, luggageBags: 2, acRequired: true, decoration: false, couponCode: 'WELCOME10' };
const b1 = await call('POST', '/customer/bookings', { token: c.token, body: bookingBody });
check('Create booking → AWAITING_PAYMENT', b1.status === 201 && b1.data.status === 'AWAITING_PAYMENT', JSON.stringify(b1.data).slice(0, 300));
const bookingId = b1.data?.id;
const pay = await call('POST', `/customer/bookings/${bookingId}/payments`, { token: c.token, body: { purpose: 'ADVANCE' } });
check('Create payment order (TEST gateway)', pay.status === 200 && pay.data.gateway === 'TEST', JSON.stringify(pay.data).slice(0, 200));
const forged = await call('POST', `/customer/payments/${pay.data.paymentId}/verify`, { token: c.token, body: { test_order_id: pay.data.checkout.orderId, test_signature: 'forged' } });
check('Forged payment signature rejected', forged.status === 400);
const ver = await call('POST', `/customer/payments/${pay.data.paymentId}/verify`, { token: c.token, body: { test_order_id: pay.data.checkout.orderId, test_signature: pay.data.checkout.signature } });
check('Verify payment', ver.status === 200 && ver.data.ok);
const ver2 = await call('POST', `/customer/payments/${pay.data.paymentId}/verify`, { token: c.token, body: { test_order_id: pay.data.checkout.orderId, test_signature: pay.data.checkout.signature } });
check('Re-verify is idempotent', ver2.status === 200);
const bd = await call('GET', `/customer/bookings/${bookingId}`, { token: c.token });
check('Booking CONFIRMED or DRIVER_ASSIGNED after payment', ['CONFIRMED', 'DRIVER_ASSIGNED'].includes(bd.data.status), bd.data.status);
check('Paid amount equals advance', Math.abs(bd.data.paidAmount - bd.data.advanceAmount) < 0.01, `${bd.data.paidAmount} vs ${bd.data.advanceAmount}`);
check('Advance receipt invoice issued', bd.data.invoices?.some((i) => i.type === 'ADVANCE_RECEIPT'));
const pdf = await call('GET', `/customer/invoices/${bd.data.invoices[0].id}/pdf`, { token: c.token, raw: true });
check('Invoice PDF downloads', pdf.status === 200 && pdf.buf.subarray(0, 5).toString() === '%PDF-');
check('Status history recorded', bd.data.statusHistory.length >= 2);

section('Double-booking protection');
const overlapBody = { ...bookingBody, couponCode: undefined, pickupAt: iso(pickup + 3600_000), returnAt: iso(ret + 3600_000) };
const dup = await call('POST', '/customer/bookings', { token: c.token, body: overlapBody });
check('Overlapping booking on a confirmed slot → 409', dup.status === 409, `${dup.status} ${JSON.stringify(dup.data)}`);
// Race: two customers book the same free vehicle at the same time.
const c2 = await otpLogin(cust2Phone, 'CUSTOMER', 'E2E Racer');
const raceVeh = search.data.items.find((v) => v.id !== veh.id);
const day = 86_400_000;
const racePickup = Date.now() + 5 * day;
const raceBody = { ...bookingBody, couponCode: undefined, vehicleId: raceVeh.id, pickupAt: iso(racePickup), returnAt: iso(racePickup + 6 * 3600_000) };
const [r1, r2] = await Promise.all([
  call('POST', '/customer/bookings', { token: c.token, body: raceBody }),
  call('POST', '/customer/bookings', { token: c2.token, body: raceBody }),
]);
const statuses = [r1.status, r2.status].sort();
check('Concurrent race: exactly one 201 and one 409', statuses[0] === 201 && statuses[1] === 409, JSON.stringify([r1.status, r1.data?.error, r2.status, r2.data?.error]));
const raceWinner = r1.status === 201 ? { b: r1.data, t: c.token } : { b: r2.data, t: c2.token };

section('Cancellation & refund');
const p2 = await call('POST', `/customer/bookings/${raceWinner.b.id}/payments`, { token: raceWinner.t, body: { purpose: 'FULL' } });
check('Full-payment order for race winner', p2.status === 200, `${p2.status} ${JSON.stringify(p2.data)}`);
await call('POST', `/customer/payments/${p2.data.paymentId}/verify`, { token: raceWinner.t, body: { test_order_id: p2.data.checkout.orderId, test_signature: p2.data.checkout.signature } });
const cancel = await call('POST', `/customer/bookings/${raceWinner.b.id}/cancel`, { token: raceWinner.t, body: { reason: 'Plans changed (E2E test)' } });
check('Cancel 5 days ahead → 100% refund', cancel.status === 200 && cancel.data.policy.refundPercent === 100 && cancel.data.refundAmount > 0, JSON.stringify(cancel.data));
const after = await call('GET', `/customer/bookings/${raceWinner.b.id}`, { token: raceWinner.t });
check('Booking REFUNDED (test gateway processes instantly)', after.data.status === 'REFUNDED', after.data.status);
const rebook = await call('POST', '/customer/bookings', { token: c.token, body: raceBody });
check('Freed slot can be booked again', rebook.status === 201, JSON.stringify(rebook.data).slice(0, 200));

section('Admin');
const adm = await call('POST', '/auth/admin/login', { body: { email: 'admin@royalride.local', password: 'Admin@12345' } });
check('Admin login', adm.status === 200 && !!adm.data.accessToken);
const A = adm.data.accessToken;
const badAdm = await call('POST', '/auth/admin/login', { body: { email: 'admin@royalride.local', password: 'nope' } });
check('Wrong admin password → 401', badAdm.status === 401);
const dash = await call('GET', '/admin/dashboard', { token: A });
check('Dashboard cards & charts', dash.status === 200 && dash.data.cards.totalBookings >= 3 && dash.data.charts.monthlyRevenue.length >= 1 && dash.data.charts.categoryPerformance.length === 6, JSON.stringify(dash.data?.cards));
for (const t of ['bookings', 'vehicle-earnings', 'owner-earnings', 'driver-trips', 'wedding-revenue', 'package-revenue', 'payments', 'refunds', 'commission', 'gst']) {
  const r = await call('GET', `/admin/reports/${t}?period=month`, { token: A });
  if (r.status !== 200) check(`Report ${t}`, false, JSON.stringify(r.data).slice(0, 200));
}
check('All 10 report types return JSON', true);
const csv = await call('GET', '/admin/reports/payments?format=csv', { token: A, raw: true });
check('CSV export', csv.status === 200 && csv.buf.toString().includes('Amount'));
const xlsx = await call('GET', '/admin/reports/bookings?format=xlsx', { token: A, raw: true });
check('Excel export', xlsx.status === 200 && xlsx.buf.subarray(0, 2).toString() === 'PK');
const rpdf = await call('GET', '/admin/reports/commission?format=pdf', { token: A, raw: true });
check('PDF export', rpdf.status === 200 && rpdf.buf.subarray(0, 5).toString() === '%PDF-');
const forbidden = await call('GET', '/admin/dashboard', { token: c.token });
check('Customer token on admin API → 403', forbidden.status === 403);
const other = await call('GET', `/customer/bookings/${bookingId}`, { token: c2.token });
check("Customer can't read another customer's booking → 403", other.status === 403, String(other.status));

section('Owner & driver trip lifecycle');
const ownerBooking = await call('GET', `/admin/bookings/${bookingId}`, { token: A });
const o = await otpLogin('9000000101', 'OWNER');
check('Owner OTP login', !!o.token && o.user.role === 'OWNER');
let driverPhone;
if (ownerBooking.data.status === 'CONFIRMED') {
  const avail = await call('GET', `/owner/bookings/${bookingId}/available-drivers`, { token: o.token });
  const asg = await call('POST', `/owner/bookings/${bookingId}/assign-driver`, { token: o.token, body: { driverId: avail.data[0].id } });
  check('Owner assigns driver', asg.status === 200, JSON.stringify(asg.data).slice(0, 200));
  driverPhone = avail.data[0].user.phone;
} else {
  check('Default driver auto-assigned on payment', ownerBooking.data.status === 'DRIVER_ASSIGNED');
  driverPhone = ownerBooking.data.driver.user.phone;
}
const d = await otpLogin(driverPhone, 'DRIVER');
check('Driver OTP login', !!d.token && d.user.role === 'DRIVER');
const dash2 = await call('GET', '/driver/dashboard', { token: d.token });
check('Trip shows as pending for driver', dash2.data.pending.some((t) => t.id === bookingId));
const startEarly = await call('POST', `/driver/trips/${bookingId}/start`, { token: d.token, body: { startOdometer: 10000 } });
check('Cannot start before accepting', startEarly.status === 409);
check('Driver accepts', (await call('POST', `/driver/trips/${bookingId}/respond`, { token: d.token, body: { accept: true } })).status === 200);
check('Driver dispatches', (await call('POST', `/driver/trips/${bookingId}/dispatch`, { token: d.token })).status === 200);
check('Driver starts trip', (await call('POST', `/driver/trips/${bookingId}/start`, { token: d.token, body: { startOdometer: 10000 } })).status === 200);
const done = await call('POST', `/driver/trips/${bookingId}/complete`, { token: d.token, body: { endOdometer: 10150, tolls: 150, parking: 50 } });
check('Driver completes trip → final bill with extra km', done.status === 200 && done.data.extraKm > 0 && done.data.total > 0, JSON.stringify(done.data));
const collect = await call('POST', `/driver/trips/${bookingId}/collect`, { token: d.token, body: { amount: done.data.balance } });
check('Driver collects balance in cash', collect.status === 200, JSON.stringify(collect.data).slice(0, 200));
const final = await call('GET', `/customer/bookings/${bookingId}`, { token: c.token });
check('Booking TRIP_COMPLETED, fully paid, tax invoice issued', final.data.status === 'TRIP_COMPLETED' && Math.abs(final.data.paidAmount - final.data.finalAmount) < 0.01 && final.data.invoices.some((i) => i.type === 'TAX_INVOICE'), `${final.data.status} ${final.data.paidAmount}/${final.data.finalAmount}`);
const rev = await call('POST', `/customer/bookings/${bookingId}/review`, { token: c.token, body: { rating: 5, vehicleRating: 5, driverRating: 5, comment: 'Excellent ride (E2E)' } });
check('Customer submits review', rev.status === 201);
const earn = await call('GET', '/owner/earnings', { token: o.token });
check('Owner earnings show commission deduction', earn.status === 200 && earn.data.summary.commission > 0, JSON.stringify(earn.data.summary));
const settle = await call('POST', '/admin/settlements', { token: A, body: { ownerId: final.data.ownerId } });
check('Admin creates owner settlement', settle.status === 201, JSON.stringify(settle.data).slice(0, 200));

section('Wedding request');
const fd = new FormData();
fd.append('data', JSON.stringify({ weddingDate: iso(Date.now() + 40 * day).slice(0, 10), venueName: 'Mayfair Lagoon', venueAddress: 'Jaydev Vihar, Bhubaneswar', totalVehicles: 5, brideCar: true, groomCar: true, guestVehicles: 3, decoratedCars: 2, pickupPoints: [{ label: 'Bride home', address: 'Cuttack Road', pickupTime: '16:00' }, { label: 'Hotel', address: 'Patia', pickupTime: '17:00' }], events: [{ name: 'Reception', date: iso(Date.now() + 41 * day).slice(0, 10), vehicles: 2 }] }));
const wr = await fetch(BASE + '/customer/weddings', { method: 'POST', headers: { authorization: `Bearer ${c.token}` }, body: fd });
const wrd = await wr.json();
check('Wedding request created', wr.status === 201 && /^WED-/.test(wrd.requestNumber), JSON.stringify(wrd).slice(0, 200));
const quote = await call('POST', `/admin/weddings/${wrd.id}/quote`, { token: A, body: { items: [{ description: 'Mercedes E-Class decorated', quantity: 1, unitPrice: 25000 }, { description: 'Innova Crysta', quantity: 4, unitPrice: 5000 }], discount: 2000 } });
check('Admin sends wedding quote', quote.status === 200 && quote.data.status === 'QUOTED');
const accept = await call('POST', `/customer/weddings/${wrd.id}/accept`, { token: c.token });
check('Customer accepts quote', accept.status === 200);

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
