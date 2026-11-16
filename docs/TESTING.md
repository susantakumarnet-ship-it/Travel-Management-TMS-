# Testing & Verification

## 1. Automated tests (`npm test`)
`apps/api/tests` (Vitest), **29 tests passing**:

| Suite | Covers |
|---|---|
| `pricing.test.ts` | Trip-day and night-halt counting in IST; local-hourly minimum hours and included km; extra km; outstation minimum km/day + driver allowance + night halts; airport minimum fare; night-driving surcharge; self-drive rate and deposit; weekend multiplier averaging; category-scoped seasonal rules; decoration + state tax + tolls + coupon + GST combination; discount capped at subtotal; invalid date range; cancellation refund tiers (7 boundary cases) |
| `booking.test.ts` | Booking state machine: happy path, illegal jumps, refund path; cancellation refund calculation; final bill (grace period, extra km/hours, untaxed tolls and parking) |

## 2. Static verification log
| Check | Result |
|---|---|
| `tsc --noEmit` API (strict) | ✅ 0 errors |
| `tsc --noEmit` web (strict) | ✅ 0 errors |
| `prisma validate` (MongoDB) | ✅ valid |
| `next build` (production) | ✅ 60 routes compiled and prerendered |
| Unit tests | ✅ 29/29 |

**Bugs found and fixed during verification:**
- A payment amount mismatch was marked FAILED inside a transaction that then threw, so the update rolled back. The function now returns a flag and throws after commit.
- The admin weddings "upcoming" filter treated the string `"false"` as true.
- The night-charge rule took the first match instead of the highest-priority one.
- Owner and driver "this month" stats used the server's timezone instead of IST.
- Renaming a city kept its old slug.
- Private-file viewing needed `vehicles:read` even for owner and driver KYC documents.
- The error handler returned 500 for bare zod errors and malformed ObjectIds.
- The web build failed when the API was unreachable: the fallback site config was exported from a client module and imported by server components.
- `StatCard` links caused full page reloads.

## 3. End-to-end tests against MongoDB Atlas
**Automated suite:** `apps/api/tests-e2e/e2e.mjs`, run with `API=http://localhost:<port>/api npm run test:e2e -w apps/api`. It needs a running API in development mode and creates real test records.

**Result on 2026-11-13 against the `TMS` database on Atlas: 54 / 54 passed.** It covers:
- catalogue, search with estimates, slug and id lookups
- OTP sign-up, wrong OTP
- quote with coupon
- booking → test payment (forged signature rejected, re-verify idempotent) → confirmed, advance receipt PDF
- overlapping booking on a paid slot → 409, and a **concurrent race → exactly one 201 + one 409**
- cancellation → 100% refund → `REFUNDED`, freed slot rebookable
- admin login (bad password → 401), dashboard, all 10 reports, CSV/XLSX/PDF exports
- customer on admin API → 403, cross-customer booking read → 403
- owner assigns driver → driver accept / dispatch / start / complete (final bill with extra km) / cash collection → `TRIP_COMPLETED` with tax invoice → review → owner earnings with commission → admin settlement
- wedding request (multipart, 2 pickup points, event) → admin quote → customer accepts

**Also verified live:**
- Through the web origin: production `next build` (60 routes), all public pages return 200, legal pages render CMS content, unknown page → 404, the `/api` proxy works, and OTP login sets the httpOnly refresh cookie, which refreshes successfully.
- A paid booking keeps its availability block across two hold-release scheduler ticks.

**Bugs found by these live runs, all fixed:**
1. `transition()` updated through `updateMany`, which can't take a relation `connect`, so driver assignment threw. Auto-assignment runs inside payment capture, so the whole capture rolled back. It now uses the scalar `driverId`, and the parameter type rejects relation writes.
2. **MongoDB null semantics** (verified with raw-query comparisons):
   - Prisma range filters (`lte`/`lt`) match null and absent fields. The every-minute hold-release job therefore deactivated every *paid* booking's block, allowing double booking.
   - `field: null` doesn't match absent fields. That broke OTP verification (`consumedAt`), unsettled-trip queries, platform drivers (`ownerId`), unread notifications, token revocation, and maintenance blocks in the availability check.
   - Fixed with the `nullish()` / `setAnd()` helpers in `src/lib/prisma.ts` at every affected site.
3. Refund settlement looked a gateway refund ID up as an ObjectId, which threw, so refunds stayed `REFUND_INITIATED`.
4. The web proxy target and the prerendered CMS pages are fixed at build time; see the README note on building the web app.

## 4. Manual browser test plan (UI)

### Customer
1. Sign up with a new mobile number → OTP (console/on-screen in dev) → welcome notification logged.
2. Home search: Bhubaneswar, tomorrow 10:00 → tomorrow 18:00, purpose Wedding → results show estimates; filters and sort update the URL.
3. Vehicle details → price calculator with `WELCOME10` → breakdown shows discount + GST.
4. Book → booking `AWAITING_PAYMENT` with hold timer → test payment → `CONFIRMED`; advance receipt invoice downloadable; owner notified; default driver auto-assigned.
5. **Double booking:** in two browsers, book the same vehicle for overlapping times at once → exactly one succeeds; the other gets "not available".
6. Hold expiry: create a booking, don't pay; after 20 minutes (or with `booking.holdMinutes` set to 1) it becomes `CANCELLED` and the slot is free again.
7. Cancel a confirmed booking → refund % matches the tiers → `REFUND_INITIATED` → (test gateway) `REFUNDED`.
8. Wedding request with 2 pickup points, 1 event and an itinerary PDF → request number shown; admin alerted.

### Owner
9. Register as partner → onboarding → upload PAN → admin approves KYC.
10. Add a vehicle → `PENDING_APPROVAL` → admin approves → appears in search.
11. Add a maintenance block over an existing booking → rejected with 409. On a free range → the vehicle disappears from search for those dates.
12. Bookings → assign a driver (an overlapping driver isn't offered) → dispatch.

### Driver
13. Register → upload licence → admin verifies.
14. Accept trip → On the way → Start (odometer 10000) → Complete (10110, tolls 150) → final bill with extra km → collect cash for the balance → customer can review.

### Admin
15. Dashboard cards and charts populate. Reports: each type exports CSV, XLSX and PDF.
16. Settings: change GST to 12% → a new quote reflects it within 30 s (settings cache).
17. Pricing rule: weekend ×1.2 → a weekend quote shows the surcharge line.
18. Roles: create "Support" with `bookings:read` only → that admin can't see write actions, and the API returns 403.
19. Settlement for an owner → mark paid with reference → owner notified; earnings page shows it settled.
20. Audit log shows every admin write action above.

### Security spot checks
- Six wrong OTPs → locked; more than five OTP requests in 15 minutes → 429.
- A customer token on `/api/admin/*` → 403. Customer A requesting customer B's booking ID → 403.
- Uploading a `.exe` renamed to `.jpg` → 400 (magic-byte check).
- A Razorpay webhook with a bad signature → 400, not processed. Replaying a valid webhook → `{duplicate: true}`.
- Starting the API with `NODE_ENV=production` and `ALLOW_TEST_GATEWAY=true` → refuses to start.

## 5. Known limitations
- Dashboard and report aggregation runs in the API process. That's fine for regional volumes; move to `aggregateRaw` pipelines at large scale.
- Without `GOOGLE_MAPS_API_KEY`, distance comes from the customer's km estimate.
- Coupon errors fail the whole quote request; the frontend validates coupons separately.
- Admin CMS image previews assume local storage paths; check them after switching to S3.
- The PhonePe gateway is not implemented. The adapter interface is ready.
