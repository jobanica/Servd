# Setting up the Supabase database

> One-time setup. Creates the hosted Postgres, applies the schema + Row-Level
> Security, and seeds demo data. Two paths — pick one.
>
> **Important:** Prisma reads `.env` (not `.env.local`). Put the DB URLs in
> **`.env`** so the `db:*` scripts work; put the public/runtime values in
> `.env.local` for the Next.js app. Both are gitignored.

## Prerequisites
- Node 22, repo cloned, `npm install` run.
- Supabase CLI: `brew install supabase/tap/supabase` (or see supabase.com/docs).
- A Supabase **personal access token**: https://supabase.com/dashboard/account/tokens

## 1. Create the project (CLI)
```bash
export SUPABASE_ACCESS_TOKEN=sbp_********        # revoke when done
supabase orgs list                                # note your <ORG_ID>

# Singapore is closest to PH. Use a strong password.
supabase projects create servd \
  --org-id <ORG_ID> --region ap-southeast-1 --db-password '<DB_PASSWORD>'
# → note the printed project ref, e.g. abcdwxyzabcdwxyz

supabase projects api-keys --project-ref <REF>   # anon + service_role keys
```

## 2. Environment files
`.env` (used by Prisma CLI):
```bash
DATABASE_URL="postgresql://postgres.<REF>:<DB_PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.<REF>:<DB_PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
```
`.env.local` (used by the Next.js app) — copy `.env.example` and fill:
```bash
NEXT_PUBLIC_SUPABASE_URL="https://<REF>.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon key>"
SUPABASE_SERVICE_ROLE_KEY="<service_role key>"
CREDENTIALS_ENCRYPTION_KEY="<run: openssl rand -hex 32>"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
# (also copy DATABASE_URL / DIRECT_URL here)
```

## 3. Schema + RLS + seed (one command)
```bash
npm run db:setup        # = prisma db push && db:rls && db:seed
```

## 4. Verify tenant isolation against live RLS
```bash
DATABASE_URL="postgresql://postgres.<REF>:<DB_PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" \
  npm run test:isolation
```

## 4b. Create login accounts
The seed makes restaurants but no logins. Create a Supabase Auth user + linked
profile (run with `--` so npm forwards the args):
```bash
# platform super-admin (you)
npm run user:create -- superadmin you@servd.app 'StrongPass123!'

# staff for a seeded restaurant (role = kitchen | cashier | admin)
npm run user:create -- staff mango-grill admin owner@mango.test 'StrongPass123!'
npm run user:create -- staff mango-grill kitchen kitchen@mango.test 'StrongPass123!'
npm run user:create -- staff mango-grill cashier cashier@mango.test 'StrongPass123!'
```
Then sign in at `/login`; the super-admin lands on `/super-admin`.

> Restaurants can now also **self-serve sign up** at `/signup` (no script). This
> requires email confirmation, so configure Supabase Auth → **Email** (the
> built-in sender is rate-limited; set real SMTP for production). After
> confirming + signing in, the owner is guided through the onboarding wizard.

## 5. Storage bucket (dashboard-only)
In Supabase → Storage, create two **public** buckets:
- **`menu-images`** — menu/branding photos (JPEG/PNG/WebP ≤ 5 MB)
- **`menu-videos`** — menu item clips (MP4/WebM ≤ 50 MB)

Both are validated server-side and namespaced per restaurant. Also create a
**private** bucket **`employee-documents`** (HRIS docs are sensitive; served via
signed URLs).

## 6. Run
```bash
npm run dev
```

---

### Letting Claude Code (web) do this for you
A web session can only reach Supabase if its **network egress policy** allowlists
`api.supabase.com`, `*.supabase.co`, and `*.pooler.supabase.com` (or uses full
network access). This is set when the environment is created and can't be changed
mid-session. With that in place, hand Claude a fresh token and it runs steps 1–5.
