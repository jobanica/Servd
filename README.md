# Servd

Multi-tenant, QR-based restaurant ordering platform. Diners scan a table QR,
browse a white-label menu, order, pay online, and leave feedback. Restaurants
get a real-time kitchen + cashier dashboard. You (the platform super-admin) sell
it as a subscription to many restaurants.

> **Status:** Phase 0 (scaffold + Servd design system) and Phase 1 (tenancy +
> auth + branding + RLS + isolation tests) are built. See the roadmap below.

## Tech stack

| Concern | Choice |
| --- | --- |
| App framework | Next.js (App Router) + TypeScript |
| Database | PostgreSQL via **Supabase** |
| ORM / migrations | Prisma |
| Auth | Supabase Auth (staff/admin/super-admin only; diners need no login) |
| Tenant isolation | `restaurant_id` on every row + **Postgres Row-Level Security** |
| Realtime (Phase 6+) | Supabase Realtime |
| Object storage (Phase 1+) | Supabase Storage |
| Styling | Tailwind CSS driven by CSS variables (enables white-label) |
| Payments (Phase 9) | PayMongo behind a `PaymentGateway` interface |
| SMS (post-MVP) | Semaphore behind an `SmsProvider` interface |

## Multi-tenancy: two layers of isolation

1. **Application layer** — every request derives `restaurantId` from the trusted
   session (`src/server/tenancy/current-user.ts`), never from the URL/body.
2. **Database layer (the real guarantee)** — `prisma/rls.sql` defines RLS
   policies on every tenant table. Queries run through `tenantDb(restaurantId,
   …)` (`src/server/tenancy/scoped-db.ts`), which sets a Postgres session
   variable the policies filter on. We use `FORCE ROW LEVEL SECURITY` so even
   the table owner is subject to policies — without it, RLS would be silently
   bypassed. The super-admin uses `systemDb(…)` to operate across tenants.

This is verified by `tests/isolation/tenant-isolation.test.ts`.

## White-label branding

The Servd palette (`src/styles/globals.css`) is the **default**. Diner pages
(`/order/[slug]/…`) wrap content in `<BrandProvider>`, which overrides the
`--brand-*` CSS variables with the restaurant's own colors. Same components, no
conditionals — they just re-skin. Platform chrome (login/admin/super-admin) keeps
the Servd identity.

## Project layout

```
prisma/        schema.prisma · rls.sql · seed.mjs
scripts/       apply-rls.mjs
src/
  app/
    (platform)/   Servd-branded: login, signup, admin, kitchen, cashier, super-admin
    (diner)/      white-label: order/[slug]/[tableToken]
    icon.svg      app icon → favicon/PWA
  components/      Wordmark, diner/BrandProvider, …
  lib/            supabase clients, theme/brand
  server/         db, tenancy (current-user, scoped-db), restaurants
  styles/         globals.css (design tokens)
tests/           theme (unit) · isolation (RLS)
```

## Getting started

```bash
cp .env.example .env.local      # fill in Supabase + DB URLs
npm install
npx prisma db push              # create tables
npm run db:rls                  # apply Row-Level Security policies
node prisma/seed.mjs            # two demo restaurants (mango-grill, guava-cafe)
npm run dev
```

**Storage bucket (menu photos):** in Supabase → Storage, create a **public**
bucket named `menu-images`. Uploads are namespaced per restaurant
(`{restaurantId}/{uuid}.ext`) and validated server-side (JPEG/PNG/WebP, ≤ 5 MB)
in `src/server/storage/menu-images.ts`.

To run the **isolation tests** against your database:

```bash
npm run db:rls
DATABASE_URL="postgres://…" npm run test:isolation
```

### Linking a staff login (Supabase Auth)

Auth identities live in Supabase `auth.users`. To make a login work, create a
Supabase user, then insert a matching `staff_users` (or `platform_admins`) row
with that user's `authUserId`. A self-serve signup flow lands at the end of
Phase 1; until then provision via Supabase dashboard + seed.

## What's deliberately stubbed / deferred

- **Restaurant subscription billing** — `plans`/`subscriptions` are modeled and
  feature-gating can read them, but no recurring charge is taken. The super-admin
  sets status manually.
- **Payments (Phase 9)** — interface + DB fields exist; PayMongo impl not built.
  Model: **connected accounts** (each restaurant uses its own PayMongo account;
  funds go straight to them). Platform split-payments deferred to a later phase.
- **SMS (post-MVP)** — full schema (consent, double-opt-in, credit ledger) is in
  place; sending/opt-in flows not built yet.
- **Custom subdomains/domains** — `restaurants.subdomain` reserved, unused.

## Compliance guardrails (built into the design)

- **No review gating.** The Google review invite is shown to ALL diners
  regardless of rating (`feedback.google_invite_shown`). Sentiment-based routing
  is never implemented.
- **SMS consent is separate from transactional.** `customer_contacts` tracks
  `marketing_consent` (none/pending/confirmed/opted_out) with stored proof, and
  defaults to double opt-in.

## Roadmap

| Phase | What | Status |
| --- | --- | --- |
| 0 | Scaffold + Servd design system | ✅ |
| 1 | Tenancy, auth, branding, RLS + isolation tests | ✅ |
| 2 | Menu management (categories, items, modifiers) | ✅ |
| 3 | Tables + printable QR | ✅ |
| 4 | Diner menu → cart | ✅ |
| 5 | Place order (modifier pricing, snapshotting) | next |
| 6 | Real-time kitchen display | |
| 7 | Cashier dashboard + pluggable printing | |
| 8 | Request bill | |
| 9 | Online payment (PayMongo, webhooks) — **high risk** | |
| 10 | Post-payment feedback + Google review invite | |
| 11 | SMS marketing (post-MVP) — **compliance risk** | |
```
