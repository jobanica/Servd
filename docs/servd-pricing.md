# Servd — Pricing

Every price a customer can be quoted. Written to be loaded into an AI assistant
as source knowledge for answering pricing questions.

All amounts are Philippine Pesos (₱).

**Last updated:** 7 September 2026 — every figure verified against the live
`platform_settings.featurePrices` on that date.

> **There is no monthly subscription.** Servd is a one-time-payment product.
> ₱499 activates a restaurant's online ordering, and every other paid feature is
> bought once and owned for good. Nothing in the product bills monthly today.
>
> **Note for the assistant:** these are the prices configured today. The owner
> can change any of them from the admin panel without this document being
> updated. If a customer reports a different price on their own billing screen,
> the screen is right — don't argue with it.

---

## 1. The short version

| | Price | Billing |
|---|---|---|
| **Get started** | ₱0 | Free forever |
| **Activate online ordering** | **₱499** | One time |
| **Each extra branch** | **₱499** | One time, per branch |
| **Unlimited tables & QR codes** | **₱700** | One time |
| **Any other feature** | ₱500 – ₱2,000 | One time, per feature |
| **Monthly charges** | none | Nothing in the product bills monthly |

No monthly plan. No setup fee. No contract. No commission on sales.

---

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

## 5. Content scheduler — not currently sold

Social post scheduling with the AI content engine. It was priced at ₱499/month,
but the subscription is **switched off** and no account is on it.

If a customer asks for it, the honest answer is that it isn't available to buy
right now — not that it costs ₱499/month.

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
a restaurant that a partner set up. Online ordering, the POS and the kitchen
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

**Do I pay monthly?** No — walang monthly bayad. ₱499 activates your online
ordering and it's yours for good. Other features are optional one-time unlocks.
There is no recurring charge in the product at all.

**Is there a free plan?** Yes, ₱0 forever, and it isn't a trial that expires. It
includes QR ordering, the POS, the kitchen display, your counter QR and one
table QR.

**Do you take a percentage of my sales?** No. Customers scan your own GCash,
Maya or bank QR, so the money goes straight to you.

**Do I need a credit card to try it?** No. Build your full preview and see your
ordering page working for free. The ₱499 only comes when you're ready to accept
real orders.

**If I stop paying, do I lose what I bought?** There's nothing to stop paying.
One-time unlocks are owned, not rented — they survive everything.

**I already have 20 tables — do I now have to pay ₱700?** No. Accounts that
existed before table QRs became a paid unlock are grandfathered and keep
unlimited tables at no charge.

**Is the ₱700 for tables monthly?** No, a single payment.

**Why does my ordering page say "Powered by Servd"?** Accounts opened from 21
August 2026 carry it at the foot of their ordering website and table/QR menu.
Restaurants that were already trading before that date don't have it and never
will — nothing was added to pages that were already live. The ₱800 white-label
unlock removes it everywhere for anyone, including the splash after a QR scan.

**I've been with Servd for a year — will this appear on my site now?** No. You
are grandfathered.

**Are there setup fees or contracts?** Neither. No lock-in.

**Do you still sell the ₱899 and ₱1,799 monthly plans?** No. Those were retired.
Servd is one-time payments now. Any account still on an old monthly plan keeps
what it has.
