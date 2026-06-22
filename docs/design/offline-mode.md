# Offline Mode (KDS + Cashier) — Design Doc (for review)

Status: **DRAFT for sign-off. No code written yet.**
Goal (from spec): *"Queue orders locally during connectivity loss, auto-sync to Supabase on
reconnect, with conflict resolution."* Plan tier: **Business**.

> This is the most architecturally involved item in the batch — hence design-first. The
> core tension: today every interaction is a **server action** (needs network). Offline
> mode requires a **client-side data layer + a sync engine**, which is a real shift. This
> doc proposes a pragmatic, staged approach rather than a full local-first rewrite.

---

## 1. Goals & non-goals

**In scope (staff devices on the restaurant's own network/tablet):**
- **KDS** keeps showing the **last-known** active orders and lets the kitchen **advance
  status** (new → preparing → done) while offline.
- **Cashier** can **take new orders** and **settle with cash** while offline.
- On reconnect, everything **auto-syncs** idempotently with deterministic conflict rules.

**Out of scope (online-only, by design):**
- **Diner QR ordering** — the diner's phone hits our server directly; if *their* link is
  down there's nothing to queue locally. (Staff can take the order on the cashier instead.)
- **Card terminal / online (GCash) payments** — these need the gateway; queued as
  "unsettled" and finished on reconnect.
- **BIR invoice serials, the non-resettable grand total, and inventory deduction** — these
  are integrity-critical and **assigned/applied server-side at sync**, never offline.

---

## 2. Why this is non-trivial here
- The app is **server-rendered + server actions**; offline means the browser can't call
  them. We need: (a) the page to **load offline** (service worker / PWA), (b) **local data**
  to render from (IndexedDB), and (c) a **write queue** that replays when back online.
- We must avoid **double-applying** replayed writes and must define what wins when the
  server state moved on while a device was offline.

---

## 3. Proposed architecture

### 3.1 App shell offline — PWA + service worker
- Add a **service worker** that pre-caches the app shell + static assets and serves the
  `/cashier` and `/kitchen` routes from cache when offline (stale-while-revalidate).
- Add a **web app manifest** so staff can "install" the cashier/KDS as a kiosk app.
- New, isolated, and behind the Business gate — does not change diner pages.

### 3.2 Local store — IndexedDB (one small wrapper, e.g. `idb`)
Object stores per restaurant:
- `menu` — snapshot of categories/items/modifiers (refreshed while online) so the cashier
  can build orders offline.
- `orders` — last-known active orders (the read cache the boards render from).
- `outbox` — the queue of **pending operations** created while offline.

### 3.3 The outbox / sync-engine pattern
Every mutating action becomes an **operation** with a **client-generated `opId` (UUID)**:
```
{ opId, type, payload, createdAt, status: "pending" | "synced" | "conflict" }
```
- **Online:** the action runs normally (server action) AND is recorded synced — no behavior
  change for connected users.
- **Offline:** the action is written to `outbox`, the **UI updates optimistically** from the
  local store, and a badge shows "Offline — N pending".
- **On reconnect** (detected via `navigator.onLine` + a heartbeat ping to `/api/health`):
  replay the outbox **in order**, oldest first, calling **idempotent** sync endpoints. Each
  op that succeeds is marked `synced` and removed; failures are retried with backoff;
  unresolvable ones are flagged `conflict` for the cashier to review.

### 3.4 Idempotency (the key to safe replay)
- **New orders:** the client supplies the **order `id` (UUID)** — our `Order.id` is already
  `@default(uuid())`, so we accept a client id and **upsert by id** → replaying a create
  twice is a no-op.
- **Payments / status / void:** keyed by `opId`. A new `synced_ops` table (or a unique
  `opId` column) records applied op ids; the sync endpoint **skips an op whose `opId` was
  already applied**.
- All sync endpoints are **server-authoritative** (recompute money, never trust client
  totals) and run inside transactions — same rules as today.

---

## 4. Conflict resolution rules (server is always authoritative)

| Scenario | Rule |
|---|---|
| Same order created twice (retry) | Upsert by client `id` → single row |
| Op already applied (replay) | `opId` dedupe → skip |
| Order **paid offline** but **voided on server** meanwhile | Void wins; the offline cash settle is rejected and surfaced to the cashier ("Order was voided — collect/return cash") |
| Status advanced on two devices | **Monotonic**: only move forward (new→preparing→done); never regress |
| Offline cash settle for an order **already settled** | Idempotent: second settle is a no-op; cashier sees "already paid" |
| Item edit/void offline vs server change | Last-write-wins on the order's items **only while unpaid**; rejected if paid |
| Menu changed server-side while offline | Order keeps its **price snapshot** (we already snapshot names+prices at order time) |

Anything the engine can't auto-resolve becomes a **"Needs attention"** list in the cashier
UI rather than silently dropping data.

### Integrity items deferred to sync (never computed offline)
- **BIR serial + grand total** → assigned when the op syncs (online), in submission order.
- **Inventory deduction** → applied on sync (best-effort, as today).
- **Loyalty points / SMS** → fire on sync.

---

## 5. UX
- A persistent **connectivity pill**: "🟢 Online" / "🟠 Offline — N pending / syncing…".
- Optimistic rows show a subtle "pending sync" marker until confirmed.
- A **"Needs attention"** drawer for conflicts (e.g., a voided order that was paid offline).
- Manual **"Sync now"** button as an escape hatch.

---

## 6. Proposed phasing

- **Phase 0 — PWA shell + read cache (low risk, high value):** service worker + manifest;
  cache menu + active orders so **KDS and cashier keep displaying** during a dropout and
  the kitchen can still **advance status** (queued). No offline order *creation* yet.
- **Phase 1 — Offline order creation + cash settle:** outbox for new orders + cash
  settlement with client `opId` idempotency and the conflict rules above.
- **Phase 2 — Hardening:** conflict "Needs attention" UI, retries/backoff, telemetry,
  and the integrity-at-sync wiring (BIR serial, inventory, loyalty).

Each phase is shippable and reviewable; Phase 0 alone already covers the most common real
case (a brief Wi-Fi blip) without the risk of offline money handling.

---

## 7. Decisions I need before building

1. **Scope of offline writes** — start with **Phase 0 (read cache + status advance)** only
   for review, or go straight to **Phase 0 + 1 (offline order creation + cash settle)**?
   *Recommend Phase 0 first — it's safe, useful, and validates the SW/IndexedDB foundation.*
2. **Cash-only offline settlement** — confirm only **cash** can be settled offline; card &
   online stay online-only. *Recommend yes.*
3. **PWA adoption** — OK to add a **service worker + manifest** (scoped to the cashier/KDS,
   not diner pages)? This is required for the page to load at all when offline.
4. **Device assumption** — is offline meant for **brief dropouts on the venue's own
   device** (minutes), or true **long-haul offline** (a whole shift)? The former lets us
   keep the cache small and the conflict surface tiny; the latter needs more (e.g., the
   cashier holding the full day's orders locally). *Recommend designing for brief dropouts.*
5. **Interaction with BIR** — confirm it's acceptable that **invoice serials are assigned at
   sync** (so an offline sale gets its official serial a moment later, in submission order).

---

## 8. Risks / notes
- This adds a **second source of truth** (the local store) for a window of time — the
  largest correctness surface in the app. Mitigations: idempotent ops, server-authoritative
  money, monotonic status, explicit conflict surfacing, and **never** computing serials /
  grand total / inventory offline.
- Testing needs offline simulations (toggling the SW, replay ordering, dup/conflict cases).
- Phase 0 carries little risk and can ship independently; Phases 1–2 are where the care goes.
- Best paired **after** BIR's issue-point is settled, since the two intersect at serial
  assignment.
