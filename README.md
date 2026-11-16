# Royal Ride – Travel & Marriage Transportation Platform

A multi-vendor car-rental marketplace for weddings, tours, airport transfers and corporate travel, with four connected portals:

| Portal | URL | Sign-in |
|---|---|---|
| Customer website | `/` | Mobile + OTP |
| Admin dashboard | `/admin` | Email + password |
| Vehicle owner (partner) | `/partner` → `/owner` | Mobile + OTP |
| Driver | `/driver` | Mobile + OTP |

**Stack:** Next.js 15 + TypeScript + Tailwind (web) · Node.js + Express 5 + TypeScript (API) · **MongoDB Atlas** via Prisma · JWT access tokens + rotating httpOnly refresh cookies · Razorpay / Cashfree · MSG91 SMS · WhatsApp Business Cloud API · SMTP email · Local disk or AWS S3 storage · Google Distance Matrix.

```
apps/
  api/                 Express API
    prisma/            schema.prisma, seed.ts, mongo-indexes.ts
    src/
      config/          env validation (zod)
      integrations/    sms, whatsapp, email, payments, storage, maps
      lib/             prisma (transactions/locking), settings, analytics, util …
      middleware/      auth/RBAC, rate limits, uploads, errors
      modules/         auth, public, customer, owner, driver, admin/*,
                       bookings, availability, pricing, payments, invoices, notifications
      jobs/            scheduler (hold expiry, reminders, document expiry, cleanup)
    tests/             vitest unit tests
  web/                 Next.js app
    src/app/(site)     customer website      src/app/admin   admin portal
    src/app/owner      partner portal        src/app/driver  driver portal
    src/components     ui/, layout/, site/, admin/, partner/
deploy/                nginx.conf, .env.production.example
docs/                  ARCHITECTURE.md, TESTING.md
docker-compose.yml
```

## 1. Prerequisites
- Node.js 20+ (tested on 24) and npm 10+
- A **MongoDB Atlas** cluster (the free M0 tier works for development). Transactions are required, and every Atlas cluster is a replica set, so they're supported.

## 2. MongoDB Atlas setup
1. Create a cluster → **Database Access**: add a database user with *readWrite* on `royal_ride`.
2. **Network Access**: add your development machine's IP (and the server's IP in production).
3. **Connect → Drivers**: copy the `mongodb+srv://…` string and add the database name `royal_ride` before the `?`.

## 3. Install & run locally
```bash
npm install
# Prisma & esbuild need their install scripts (npm 11 asks once):
npm install-scripts approve @prisma/client prisma @prisma/engines esbuild && npm rebuild

cp apps/api/.env.example apps/api/.env      # set DATABASE_URL and two JWT secrets
cp apps/web/.env.example apps/web/.env.local

npm run db:push        # creates collections + indexes (prisma db push + partial unique indexes)
npm run db:seed        # demo catalogue, partners, drivers, packages, CMS, admin
npm run dev            # API on :4000, web on :3000
```
**Ports:** the API uses `PORT` from `apps/api/.env`, and the web proxy target is `API_INTERNAL_URL` in `apps/web/.env.local`. Keep them in sync. On this machine the API runs on **4700**, because 4000 and 4100 are taken by other local apps. For `next build` / `next start`, the proxy target is fixed **at build time**, so rebuild the web app after changing `API_INTERNAL_URL`. Build while the API is reachable; otherwise the CMS pages (terms, privacy, and so on) serve a 404 until their 5-minute refresh. `next dev` reads the env on each start.

**Atlas password with special characters:** URL-encode it in `DATABASE_URL` (for example `@` → `%40`).

Generate JWT secrets with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

**Demo logins (after seeding):**
- Admin: `admin@royalride.local` / `Admin@12345` at `/admin/login`. Change these via `SEED_ADMIN_*` before seeding anything shared.
- Partners: phones `9000000101`–`9000000103` · Drivers: `9000000201`–`9000000205` · Customers: any number.
- With `SMS_DRIVER=console` the OTP is printed in the API log and shown on screen. `DEV_FIXED_OTP=123456` also works (development only).

**Development payments:** with no Razorpay/Cashfree keys and `ALLOW_TEST_GATEWAY=true`, checkout opens a clearly labelled *TEST PAYMENT* screen. It goes through the same server-side verification and capture path as a real payment. The API refuses to start in production with the test gateway or `DEV_FIXED_OTP` enabled.

## 4. Configuration (apps/api/.env)
| Area | Keys | Without keys |
|---|---|---|
| Database | `DATABASE_URL` | required |
| Auth | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS`, `OTP_*` | required |
| SMS (MSG91, DLT templates) | `SMS_DRIVER=msg91`, `MSG91_AUTH_KEY`, `MSG91_OTP_TEMPLATE_ID` (`##var1##` = OTP), `MSG91_FLOW_TEMPLATE_ID` (`##var1##` = message) | logged to console |
| WhatsApp Cloud API | `WHATSAPP_DRIVER=cloud`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PUBLIC_NUMBER` | logged to console |
| Email | `EMAIL_DRIVER=smtp`, `SMTP_*`, `EMAIL_FROM` | logged to console |
| Payments | `PAYMENT_GATEWAY=razorpay\|cashfree`, `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET`, `CASHFREE_APP_ID/SECRET_KEY/ENV` | dev test gateway |
| Storage | `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION`, keys, `S3_PUBLIC_BASE_URL` (CDN) | local `apps/api/uploads` |
| Maps | `GOOGLE_MAPS_API_KEY` (Distance Matrix) | customer-entered km |
| Invoices | `COMPANY_NAME/GSTIN/STATE/ADDRESS/PHONE/EMAIL` | defaults |

**WhatsApp templates** to create and get approved in Meta Business Manager. The body parameters must follow the same order as `apps/api/src/modules/notifications/service.ts`:
`rr_welcome, rr_booking_confirmed, rr_payment_received, rr_owner_new_booking, rr_driver_assigned, rr_driver_new_trip, rr_pickup_reminder, rr_trip_completed, rr_booking_cancelled, rr_refund_update, rr_document_expiry, rr_wedding_request, rr_wedding_quote`.

**Payment webhooks** (configure in the gateway dashboard):
- Razorpay → `https://<domain>/api/webhooks/razorpay`. Events: `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`.
- Cashfree → `https://<domain>/api/webhooks/cashfree`. Events: payment success/failed, refund status.

**Business settings** (advance %, payment hold minutes, GST %, commission, cancellation tiers, night hours, reminders, contact details) and **pricing rules** (seasonal, weekend, peak dates, night, state entry tax, waiting) are edited in **Admin → Settings** and **Admin → Pricing rules**. No code change is needed.

## 5. Scripts
| Command | What it does |
|---|---|
| `npm run dev` | API (tsx watch) + web (next dev) |
| `npm test` | API unit tests (pricing engine, booking rules, final bill) |
| `npm run typecheck` | TypeScript across both apps |
| `npm run build` | Production build of API and web |
| `npm run db:push -w apps/api` | Sync schema + indexes to Atlas (non-destructive) |
| `npm run db:seed -w apps/api` | Idempotent demo data |
| `npm run db:reset -w apps/api` | **Drops all data** and re-pushes (dev only) |

## 6. Deployment
1. Provision an Ubuntu VM (AWS Lightsail/EC2, Azure, or DigitalOcean) with Docker. Point your domain's DNS at it and allow its IP in Atlas Network Access.
2. `cp deploy/.env.production.example deploy/.env.production` and fill it in (production keys, `ALLOW_TEST_GATEWAY=false`, `STORAGE_DRIVER=s3`).
3. Replace `royalride.example` in `deploy/nginx.conf`. Obtain a certificate:
   `docker compose run --rm certbot certonly --webroot -w /var/www/certbot -d <domain>` (start nginx with the port-80 block first).
4. `docker compose --env-file deploy/.env.production up -d --build`. On start the API runs `prisma db push`, ensures the partial indexes, and launches. Certbot renews certificates every 12 hours.
5. **Backups:** enable Atlas Cloud Backup (continuous / point-in-time, available on M10+). For extra safety, schedule `mongodump --uri "$DATABASE_URL" --gzip --archive=…` to an S3 bucket. Uploaded files live in S3 in production; enable bucket versioning.

## 7. Security summary
OTP hashing with attempt limits and per-phone/IP rate limits · bcrypt (cost 12) for admin passwords · 15-minute JWTs plus rotating refresh tokens with reuse detection · RBAC with per-module admin permissions · zod validation on every input · HTML stripped from free text, and Markdown rendered without raw HTML · Prisma parameterised queries (no string-built queries) · Helmet, CORS, nginx rate limits · webhook HMAC verification and idempotent event store · server-side amount checks on capture · magic-byte upload checks; private documents are never publicly served and are viewable only by their owner or permitted admins (each view is audited) · audit log of admin actions · CSV formula-injection guard in exports.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design details and [docs/TESTING.md](docs/TESTING.md) for the test plan and verification log.
