# Royal Ride – Architecture

## 1. System overview
```
 Browser ──HTTPS──► nginx ──► Next.js (web, :3000)  ── SSR fetch ──┐
                       │        └─ /api/* rewrite (same origin) ───┤
                       └──────► Express API (:4000) ◄──────────────┘
                                   │   ├─ MongoDB Atlas (Prisma)
                                   │   ├─ S3 / local uploads
                                   │   ├─ Razorpay / Cashfree  (orders, refunds, webhooks)
                                   │   ├─ MSG91 (OTP + SMS), WhatsApp Cloud API, SMTP
                                   │   └─ Google Distance Matrix
                                   └─ node-cron scheduler (in-process)
```
- **Same-origin API:** the browser only talks to the web origin; Next rewrites `/api/*` and `/uploads/*` to the API. The refresh cookie is therefore first-party, `httpOnly`, scoped to `/api/auth`, and needs no CORS. Public pages (home, search, vehicle details, packages, CMS) are server-rendered for SEO, with a sitemap and robots file.
- **Stateless API:** horizontally scalable. If you run more than one API instance, run the scheduler on only one (`DISABLE_SCHEDULER=true` on the others).

## 2. Roles & access
| Role | Auth | Scope |
|---|---|---|
| CUSTOMER | OTP | own profile, addresses, bookings, payments, invoices, reviews, wedding requests |
| OWNER | OTP | own business profile, vehicles, bookings for own vehicles, own fleet drivers, earnings, settlements |
| DRIVER | OTP | own profile and docs, trips assigned to them, trip status, cash collection, earnings |
| ADMIN | email + password | per-module permissions `<module>:read|write`, or `*` (Super Admin) |

New OTP users choose their role at sign-up (customer site, partner portal or driver portal). Partners and drivers start `PENDING` until an admin approves their KYC or verification. Their vehicles stay out of search until both the vehicle and the owner are approved.

## 3. Data model (MongoDB collections)
Users, AdminRoles, OtpCodes, RefreshTokens, CustomerProfiles, Addresses, Cities, VehicleOwners, OwnerDocuments, Drivers, DriverDocuments, VehicleCategories, VehicleModels, Vehicles, VehicleImages, VehicleDocuments, **VehicleAvailability**, Bookings, BookingPassengers, BookingLocations, BookingStatusHistory, DriverAssignments, WeddingPackages, WeddingRequests (wedding booking details), WeddingPickupPoints, TravelPackages, TravelItineraries, Payments, WebhookEvents, Refunds, Invoices, Coupons, CouponRedemptions, OwnerSettlements, Reviews, Notifications, Enquiries, PricingRules, Settings, Pages, ContentBlocks, Testimonials, Destinations, AuditLogs, Counters.

All relations use ObjectId references with Prisma-managed referential actions. Indexes are declared in `schema.prisma` (`@@index`, `@@unique`). Optional-unique fields (email, gateway IDs, one active block per booking) use **partial unique indexes** from `prisma/mongo-indexes.ts`, because a plain Mongo unique index treats all missing values as duplicates. Money is stored as INR floats, rounded to 2 decimals at every calculation step, and converted to paise only at the gateway boundary.

## 4. Availability & double-booking prevention
- Each booking, maintenance window or owner block is a `VehicleAvailability` row covering `[startAt, endAt)`. `endAt` includes a configurable turnaround buffer.
- A row is *live* when `active` is true and it has no hold, or its hold hasn't expired yet. Unpaid bookings hold the slot for `booking.holdMinutes` (default 20).
- **Concurrency guarantee:** every booking or block transaction first increments `vehicles.lockVersion` (`lockVehicle`). MongoDB transactions use snapshot isolation, and writing a document that another transaction committed after this snapshot raises a write conflict. Concurrent attempts on the same vehicle are therefore serialised: one commits, and `withTx` retries the others. On retry, the overlap check sees the committed booking and returns `409 VEHICLE_UNAVAILABLE`.
- Search excludes vehicles with live overlapping rows, and also any vehicle whose insurance or fitness certificate lapses before the trip ends.
- Expired holds are released every minute by the scheduler, and inline before each new booking on that vehicle. If a payment arrives after its hold expired, the system re-reserves the slot when it's still free; otherwise it refunds automatically.

### MongoDB null semantics (important for every new query)
With Prisma on MongoDB:
- `{ field: null }` matches only explicit nulls, **not absent fields**.
- `{ field: { lte | lt: x } }` **matches null and absent fields**, because they sort below every value.

Use `nullish('field')` for "has no value" and `setAnd('field', { lte: x })` for upper-bound comparisons on optional fields (both in `src/lib/prisma.ts`), placed inside an `AND: [...]` array. `gt`/`gte` are safe as written. Getting this wrong once let the hold-release job free paid bookings; see TESTING.md.

## 5. Booking lifecycle
`AWAITING_PAYMENT → CONFIRMED → DRIVER_ASSIGNED → VEHICLE_DISPATCHED → TRIP_STARTED → TRIP_COMPLETED`, plus `CANCELLED → REFUND_INITIATED → REFUNDED`. The allowed transitions live in `bookings/stateMachine.ts`. Each transition is a conditional update on the expected current status, and every change is recorded in `BookingStatusHistory`, which drives the customer tracking timeline.

1. Customer gets a live quote (`/public/quote`) → creates a booking (slot held) → pays the advance (or full amount).
2. Capture, from the webhook or the browser callback, whichever arrives first: the amount is verified, the booking is confirmed, the coupon redeemed, an advance receipt issued, and the default driver auto-assigned if free. The customer gets SMS/WhatsApp/email; the owner gets a WhatsApp/SMS alert.
3. Owner (or admin) assigns or reassigns a driver. The system checks verification, licence validity and overlapping trips. The driver accepts or declines.
4. Driver marks *on the way*, starts with the odometer reading, and completes with odometer, tolls, parking and state tax. The final bill is computed (extra km, extra hours after a 30-minute grace, actual tolls and parking untaxed), a GST tax invoice is issued, and commission and owner payout are calculated.
5. The balance is paid online or collected as cash by the driver. The customer can then leave a review, which updates vehicle and driver ratings.
6. Cancellation: refund % comes from the admin-configured tiers. An owner rejection or admin override can refund 100%. Refunds are split across captured payments and sent to the gateway; webhooks move the booking to `REFUNDED`.

## 6. Pricing engine (`modules/pricing/engine.ts`)
Pure function with unit tests. Fare models: local hourly (minimum hours, included km per hour), airport transfer (per km with a minimum fare), outstation (minimum km per day, driver allowance, night halts), daily rental (included km per day), and self-drive (self-drive rate plus deposit). It then applies averaged per-day seasonal, weekend and peak multipliers; night charges; decoration; waiting; state entry tax; and a coupon discount on the taxable amount. GST applies only to taxable lines. Tolls, parking and state tax pass through untaxed. Advance = `max(₹500, advancePercent)` capped at the total. Admins edit every input (vehicle rates, rules, settings) without code changes.

## 7. Payments
Adapters live in `integrations/payments.ts`: Razorpay (orders, signature verification and payment fetch, HMAC webhooks, refunds) and Cashfree (PG v2023-08-01 orders, session checkout, signed webhooks, refunds). Webhooks are stored once per `(gateway, eventId)` for idempotency. A capture whose amount doesn't match the order marks the payment FAILED and alerts admins. PhonePe can be added as another adapter behind the same interface.

## 8. Notifications
`notify()` renders one template per event (registration, booking created/confirmed, payment, owner alert, driver assigned/new trip, dispatch, pickup reminder, trip started/completed, cancellation, refund, document expiry, wedding request/quote). It fans out to SMS, WhatsApp, email and in-app. Every message is logged in `Notifications` with a delivery status. Failures never block business flows.

## 9. Scheduled jobs (`jobs/scheduler.ts`)
- Every minute: release expired holds.
- Every 15 minutes: pickup reminders (and an admin alert if no driver is assigned).
- Daily at 09:00 IST: document-expiry alerts at 30/15/7/1 days for insurance, fitness, PUC, permit and driving licence. Vehicles with lapsed insurance or fitness are auto-deactivated.
- Daily: clean up expired OTPs and refresh tokens.

## 10. Reports & analytics
The dashboard and the 10 report types (bookings by day/week/month/year, vehicle, owner, driver, wedding, package, payments, refunds, commission, GST) aggregate in the API from indexed, date-bounded queries. They export to CSV, Excel and PDF. At very high volumes, move the heaviest aggregations to MongoDB aggregation pipelines (`aggregateRaw`) or a reporting replica.

## 11. Scalability
- Cities, categories, models and vehicles are all data, not code.
- The API is stateless behind nginx; static assets are CDN-able; uploads go to S3.
- Atlas scales vertically and with read replicas.
- The scheduler should run as a single instance.
