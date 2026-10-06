# Servd — Pricing

Every price a customer can be quoted. Written to be loaded into an AI assistant
as source knowledge for answering pricing questions.

All amounts are Philippine Pesos (₱).

**Last updated:** 6 October 2026 — the ₱800/month All Access plan for new
accounts. One-time unlock figures last verified against the live
`platform_settings.featurePrices` on 7 September 2026.

> **Two sets of pricing, depending on when the account went live.**
>
> - **Went live from 6 October 2026 → All Access, ₱800 a month.** A 30-day
>   free trial, then ₱800 a month for every feature except the Content
>   Calendar. This is what every NEW customer gets. (§1)
> - **Went live before 6 October 2026 → grandfathered.** They keep exactly
>   what they joined on: ₱499 once to activate, no monthly fee, and features
>   bought as one-time unlocks they own for good. (§2 onward)
>
> If you don't know which a customer is, ask when they started. A prospect who
> hasn't signed up yet is always on All Access.
>
> **Partner-set-up restaurants are the exception** — see §8. Servd does not
> bill those.
>
> **Note for the assistant:** these are the prices configured today. The owner
> can change any of them from the admin panel without this document being
> updated. If a customer reports a different price on their own billing screen,
> the screen is right — don't argue with it.

---

## 1. All Access — ₱800 a month (every new account)

| | Price | Billing |
|---|---|---|
| **Free trial** | ₱0 | 30 days, every feature, no card |
| **All Access** | **₱800** | Monthly |
| **Content Calendar** | **₱499** | Monthly, sold separately |
| **SMS** | credits | Pay as you go |

No setup fee. No contract. No commission on sales.

**What's included** — everything in the product except the Content Calendar:
online ordering (pickup and delivery), cashier POS, kitchen display, unlimited
tables and QR codes, visual floor plan, reservations, loyalty, promotions and
happy hours, gift cards, customer book, SMS campaigns (sending uses credits),
AI menu import, data export, audit log, offline mode, accounting, inventory,
HR and payroll, a custom domain and full white-label.

**The trial.** 30 days with every feature on, no card. Custom domain is the one
thing that waits until the first payment, because it sets up real
infrastructure. A restaurant can pay during the trial and lose no free days —
the first paid month starts when the trial ends.

**How paying works.** There is **no automatic charge** — no card is stored.
Each month a bill for ₱800 appears in **Admin → Billing**, and the owner pays it
by GCash or card through a secure checkout. Paying restores everything at once.

**If a month isn't paid.** There are **7 days** from the due date. After that
the whole account is **paused**: the cashier, kitchen display, ordering page
and QR ordering all stop until it's paid. **Nothing is deleted** — menu, orders
and settings are all still there, and paying switches it straight back on.

**Cancelling.** The account runs to the end of the month already paid for, then
pauses.

**Extra branches.** Currently **₱499 once per branch** for every account,
All Access included (§4b) — a branch is its own account and is not put on the
monthly plan.

---

# Grandfathered pricing — accounts live before 6 October 2026

Everything from here to §7 applies to restaurants that went live before the
All Access plan. They are never moved onto it.

## 2. Free — ₱0, forever

Not a trial. Every account keeps this at no cost, with nothing to cancel:

- QR dine-in ordering
- Counter / takeout QR and order numbers
- Cashier POS
- Kitchen display
- 1 table QR code
- Split payments, split bills and tips
- Void / edit with manager approval
- Dietary tags, customer feedback and Google review prompts
- 3 staff accounts

---

## 3. ₱499 — activate online ordering (one time)

The main paid step. A restaurant builds its preview free, sees its own ordering
page working, and pays ₱499 only when it's ready to take real orders.

- **One payment. No monthly fee. Walang monthly bayad.**
- Buys the online ordering website outright — pickup and delivery
- The page is theirs for good; it survives any later change to what the free
  tier includes, because the purchase is recorded against the account
- No credit card needed to build the preview first

---

## 4. One-time feature unlocks

Bought once, owned for good. An unlock survives everything — it can't lapse,
expire or be cancelled, because it was bought rather than rented.

| Feature | Price |
|---|---|
| Visual floor plan & live table status | **₱500** |
| Reservations & waitlist | **₱500** |
| Gift cards & store credit | **₱500** |
| Promotions, promo codes & happy hours | **₱500** |
| Customer book + CSV export | **₱500** |
| Data export (sales, orders, menu) | **₱500** |
| Audit log | **₱500** |
| Offline mode | **₱500** |
| Custom domain | **₱500** |
| Unlimited tables & QR codes | **₱700** |
| Loyalty & rewards | **₱700** |
| Full white-label (removes "Powered by Servd" everywhere) | **₱800** |
| Accounting (sales, VAT, P&L) | **₱1,500** |
| Inventory, COGS & auto-reorder | **₱1,500** |
| HR, attendance & payroll | **₱2,000** |

All fifteen together come to **₱11,700**. The online ordering website and
delivery are not on this list: they are what the ₱499 activation turns on.

Bought from **Admin → Billing & features**.

**Not sold as one-time unlocks:**

- **Online payments** — retired. It was a card gateway the diner was redirected
  to; customers pay by scanning the shop's own GCash / Maya / bank QR now, and
  that comes with online ordering. Restaurants that already bought it keep it,
  and it is never sold again.
- **SMS marketing** — every text costs real money, so it runs on credits.
- **AI menu import** — burns API credits per import.
- **Content scheduler** — switched off entirely (§5).

---

## 4b. Extra branches — ₱499 each, one time

A restaurant with more than one location runs them all from **one login**. The
owner adds a branch at **Admin → Branches**, pays ₱499 to activate it, and then
switches between branches inside the admin dashboard without logging out.

- One payment per branch. No monthly fee for a branch.
- A branch that hasn't been paid for can be created but **can't be entered** —
  it stays greyed out in the switcher until activation clears.
- Feature unlocks are **per branch**: each branch is its own account for
  entitlement purposes, so unlocking inventory in two branches is two purchases.

---

## 5. Content Calendar — ₱499 a month, every account

Social post scheduling with the AI content engine. Sold on its own as a monthly
subscription — to new and grandfathered accounts alike — and **never included
in any plan**, All Access included. Subscribed from the Content Calendar page in
the dashboard.

---

## 6. Tables and QR codes

Every account, free, on any plan:

- **1 counter / takeout QR** — the single code a stall or takeout counter puts
  on the wall
- **1 table QR**

**Unlimited tables and QR codes: ₱700, one time.** Paid once, kept for good.

**Grandfathering:** accounts that existed before this became a paid unlock keep
unlimited tables and QR codes at no charge, however many they have. They are
never asked to pay for it.

Nothing already created is ever removed. An account at its limit keeps every QR
code it printed; it simply can't add more until it unlocks.

---

## 7. Payment processing

**Servd takes no cut of a restaurant's sales.**

Customers pay by scanning the restaurant's own **GCash**, **Maya** or **bank
(InstaPay / QRPH)** QR code and attaching the reference number; staff confirm it
before settling. The money lands directly in the restaurant's own account —
Servd never holds it and adds nothing on top, and there is no gateway fee
because there is no gateway.

Setting those QRs up is part of online ordering; it is not a separate purchase.

---

## 8. Partner programme (for resellers and agencies)

For people who set restaurants up on Servd. Apply at `/partner/apply`.

- **Unlimited accounts.** No cap on how many restaurants a partner sets up, and
  no per-account charge to the partner.
- **The partner sets the price.** Whatever they bill a restaurant — setup,
  monthly, a package — is agreed directly between them and that restaurant.
- **No revenue share in either direction.** Servd pays the partner no
  commission and takes no share of what the partner charges. Servd never sees
  the price and never invoices the partner's client on their behalf.
- **Free to join**, subject to approval.

**How an account gets created.** A partner builds a demo storefront from their
dashboard — a live `/r/{slug}` ordering page with a real menu but no login — and
shows it to the prospect. When the prospect says yes, the partner converts it in
one click: the same storefront gets a login (username + a one-time password to
hand the owner), and the menu, link and QR codes all carry over. No approval step
and no cap on how many they convert.

**What plan those accounts land on.** The ₱0 **Free** plan — Servd does not bill
a restaurant that a partner set up. **This is unchanged by All Access:** a
partner-converted restaurant is not put on the ₱800 plan. Online ordering, the POS and the kitchen
display work; other paid features stay locked until somebody buys them. The
restaurant can still purchase unlocks from Servd directly at the usual prices
(§3, §4), and that is separate from whatever the partner charges.

Collecting what a restaurant owes a partner is the partner's own business.

There is no referral or affiliate scheme, for restaurants or for partners. The
old programme — 30% year-one commission, 10% ongoing, milestone bonuses,
clawbacks and payout batches, plus account credit for a restaurant that referred
another — was withdrawn in favour of the arrangement above, and nothing accrues
under it any more.

---

## 9. Common pricing questions

**How much is Servd?** For a new restaurant: ₱800 a month for every feature,
after a 30-day free trial. The Content Calendar (₱499/month) and SMS credits are
the only extras.

**Do I pay monthly?** New accounts, yes — ₱800 a month. Restaurants that went
live before 6 October 2026 don't: they're grandfathered on the old one-time
pricing and nothing changes for them.

**Is there a free trial?** Yes — 30 days, every feature, no card needed.

**Is there a free plan?** Not for new accounts. Restaurants that went live
before 6 October 2026 keep the free plan they had.

**Does it charge my card automatically?** No. A bill appears in your dashboard
each month and you pay it by GCash or card.

**What if I miss a payment?** You have 7 days. After that the account is paused
until it's paid — nothing is deleted, and paying switches it back on.

**Do you take a percentage of my sales?** No. Customers scan your own GCash,
Maya or bank QR, so the money goes straight to you.

**Do I need a credit card to try it?** No. Build your preview, then go live on
the 30-day free trial — no card at any point until the first bill.

**I joined before October — will I be moved to ₱800?** No. You're grandfathered
on what you joined on, and you won't be moved.

**I already have 20 tables — do I now have to pay ₱700?** No. Accounts that
existed before table QRs became a paid unlock are grandfathered and keep
unlimited tables at no charge. On All Access, unlimited tables are included.

**Why does my ordering page say "Powered by Servd"?** Accounts opened from 21
August 2026 carry it at the foot of their ordering website and table/QR menu.
Restaurants that were already trading before that date don't have it and never
will. On All Access, white-label is included and removes it. On the
grandfathered pricing it's an ₱800 one-time unlock.

**Are there setup fees or contracts?** Neither. No lock-in — cancel and the
account simply pauses at the end of the paid month.

**Do you still sell the ₱899 and ₱1,799 monthly plans?** No — those were retired
before All Access. Any account still on one keeps what it has.
