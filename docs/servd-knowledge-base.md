# Servd — Product Knowledge Base

A reference describing everything Servd does. Written to be loaded into an AI
assistant as source knowledge for answering customer and staff questions.

**Last updated:** 18 August 2026

---

## 1. What Servd is

Servd is an all-in-one restaurant and food-business operating system built for
the Philippines. One account covers the whole business: QR menus at the table,
a cashier POS, a kitchen display, an online ordering website, delivery,
payments, inventory, accounting, HR and marketing.

- **Who it's for:** any food business in the Philippines — restaurants, cafés,
  carinderias, food parks, milk tea shops, bakeries, catering, cloud kitchens,
  and retail/ecommerce sellers of packaged goods.
- **Where it runs:** in a web browser. No app to install. Works on Android
  tablets, iPads, phones, laptops and desktops.
- **Currency:** Philippine Peso (₱). All money is stored in centavos.
- **Timezone:** Asia/Manila (UTC+8). Every "today", day boundary and printed
  time is Manila wall-clock, regardless of where the server runs.
- **Languages:** English interface, with per-item menu translations for diners.

### Core concepts

| Term | Meaning |
|---|---|
| **Restaurant** | One business account. All data is isolated per restaurant. |
| **Order** | One ticket. Has a type, items, a status and a payment status. |
| **Order type** | Dine-in, Takeout, Pickup, Delivery, or Third-party. |
| **Payment** | Money received against an order. An order can have several (split payments). |
| **Shift** | One cashier's turn at the till. Owns their drawer figures. |
| **Staff user** | A login with a role. |
| **Table** | A physical table with its own permanent QR code. |

### Order types — the exact distinctions

- 🍽️ **Dine-in** — eating in, at a table.
- 🥡 **Takeout** — ordered *at the counter*, waiting for it, takes it away.
- 🛍️ **Pickup** — ordered *ahead* (online or by phone), coming to collect.
- 🛵 **Delivery** — the restaurant delivers it.
- 🏍️ **Third-party** — GrabFood, Foodpanda and similar.

Takeout and pickup are deliberately separate: the kitchen assembles them
differently. Every screen (cashier, kitchen, receipts, reports) uses these same
five names.

### Order lifecycle

`pending` → `new` → `preparing` → `done` → `closed`, plus `cancelled`.

- **pending** — a diner placed it via QR; awaiting cashier acceptance.
- **new** — accepted, in the kitchen queue.
- **preparing** — kitchen is cooking it.
- **done** — food is ready.
- **closed** — settled and off the active boards.
- **cancelled** — voided.

An order leaves the boards only when it is **both paid and cooked**. A takeout
order paid up front stays on the kitchen display until the food is made.

---

## 2. Staff roles and access

| Role | What they can open |
|---|---|
| **admin** (owner) | Everything — all admin screens, cashier, kitchen. |
| **manager** | HR and scheduling. |
| **cashier** | Cashier POS, shift summary, closed orders. |
| **kitchen** | Kitchen display only. |
| **merchant** | The "Incoming Orders" screen only — for online-order handling without full POS access. |

Staff are managed under **Admin → Staff & access**. Staff limits vary by plan
(3 on a free account).

There is also an **employee portal** (separate from staff logins) for HR:
employees can view their own payslips, schedule, attendance and leave.

---

## 3. Ordering channels

### 3.1 QR dine-in
Each table has a permanent QR code. A diner scans it, browses the menu on their
phone, and orders without installing anything or creating an account.

- Photos, descriptions, dietary tags and per-item videos
- Modifier groups (add-ons, sizes, options) with required/optional rules
- Item variants (sizes) with their own prices and stock
- Live order tracking after ordering
- **Call waiter** and **Request bill** buttons
- Promo code entry
- Tips (percentage chips or a custom amount)
- Feedback and Google review prompt after the meal
- Multi-language menu via per-item translations

**Paying at the table:** the diner can ask for the bill by cash, by online
payment, or by GCash QR. On the GCash QR screen they can attach their payment
screenshot and reference number and send it to the cashier — the proof appears
on the cashier's order card. Sending proof never marks anything paid; a cashier
still confirms it.

### 3.2 Online ordering website
Every restaurant gets a public ordering site for **pickup and delivery**,
reachable at a Servd URL or the restaurant's own custom domain.

- Full menu with photos, search and categories
- Cart with item photos
- Pickup or delivery, with a map location picker for the delivery address
- Scheduled / advance orders for a later time
- Payment choice: cash on delivery, GCash, Maya, or bank transfer
- Customers can upload a payment screenshot as proof (optionally required)
- Promo codes and gift cards
- Live order tracking page after checkout
- Cart recovery: an abandoned cart can trigger a follow-up message

### 3.3 Counter / POS ordering
The cashier can create an order directly at the till with full menu, modifiers,
variants, discounts, and any order type.

### 3.4 Third-party
Orders from GrabFood, Foodpanda and similar can be recorded as third-party so
they appear in sales figures and reports alongside everything else.

---

## 4. Cashier POS

The cashier screen (`/cashier`) is the main service screen. It updates live —
new orders and changes appear without refreshing.

**Order management**
- Tables and open orders grouped on one board
- Accept or decline incoming QR orders
- Create a new order at the counter
- Add items to an existing order
- Edit an order (with manager approval)
- Void an order or a single line, with a **required reason** and a **void PIN**
- Void an already-closed order (reverses the money, stays in the audit log)
- Re-open a closed order
- Mark food as served
- Closed & voided list for the current shift

**Payments**
- Methods: **Cash, Card terminal, GCash, Maya, Bank transfer**, plus online
  GCash/card via the gateway
- **Cash tendered → change due** calculation with suggested note amounts
- **Split payments** — several tenders against one order until it's covered
- **Split bills** across a table
- Tips
- Discounts, including **Senior Citizen and PWD**
- Gift cards / store credit
- Loyalty point redemption
- The customer's payment screenshot, viewable in place from the order card
- When there's no screenshot, the card says so explicitly

**Cash handling**
- **Cash-out** — record money taken out of the drawer, with a note
- **Open drawer** ("no sale") button
- Shift notes

**Printing**
- Print bill (what the customer owes)
- Print receipt (after payment)
- Print kitchen ticket
- Print end-of-shift summary

---

## 5. Kitchen display

The kitchen screen (`/kitchen`) shows live tickets with a sound alert on every
new order. Staff tap to advance a ticket through preparing → ready.

- Live updates plus a polling fallback, so it keeps working on flaky Wi-Fi
- Audible new-order chime, with a prompt if the browser is blocking sound
  (browsers require one tap on the screen before they will play audio)
- Sound can be muted
- **History** — tickets finished today, with the ability to bring one back if it
  was tapped by mistake
- Order type and customer name on each ticket
- Item notes and modifiers
- Optional **kitchen ticket printing** instead of a screen, for kitchens
  without a tablet
- Offline mode (a one-time unlock): keeps accepting taps with no connection and
  syncs when it returns

---

## 6. Shifts and end-of-shift reporting

A shift is one cashier's turn at the till. It opens by itself the first time
they settle an order — nobody has to press "start".

**Per-cashier, not per-day.** Each cashier's summary counts only their own
takings. A second cashier does not inherit the first one's sales.

**Shifts survive midnight.** A shift is bounded by how long it has run (up to 16
hours), not by the calendar date, so a 6 PM–2 AM shift stays intact. A shift
nobody signs out of is closed automatically after that window and flagged as
"not signed out".

**End-of-shift summary (Z-report)** shows:
- Cashier name and shift start time
- Orders paid, sales by payment method, discounts given
- Expenses recorded today
- Cash collected, cash taken out, **expected in drawer**
- Net
- **Today, all shifts** — the day's counter trade for context, clearly marked
  as *not* part of this cashier's drawer
- Space to write the counted cash and sign off

It prints on the receipt printer as a real ESC/POS document (not a browser print
dialog), then **End shift & sign out** closes the shift and logs them out.

**Shift history** (`/admin/shifts`) records every shift with:
- Total for the shift and transaction count, split **counter vs online**
- Every transaction: ticket, time, order type, payment method, amount
- Totals by payment method and by order type
- Cash drawer figures
- **Kept for 48 hours, then cleared.** Only the shift log is deleted — orders,
  payments and accounting records are never touched.

Online payments are counted in the shift's totals but deliberately excluded from
the cash drawer figure, because nobody put that money in a till.

---

## 7. Menu management

- Categories and items with photos, descriptions and prices
- Item **videos** (uploaded or YouTube/Vimeo link)
- **Modifier groups** — add-ons and options, shared across items, with
  required/optional and min/max selection rules
- Individual modifier options can be marked out of stock ("86 the add-on")
- **Variants / sizes** with their own prices and per-size stock
- **Dietary tags** (allergens and diets)
- **Daily servings limit** — cap how many of an item can be sold per day
- **Food cost per item**, feeding COGS and profit reporting
- Mark items available / out of stock
- **Counter-only items** — an item can be marked "Counter only". The cashier can
  punch it at the POS; it never appears on the online menu or the QR dine-in
  menu, and a web order that names one is refused. Built for the things a menu
  shouldn't advertise but a till still has to ring up: takeaway boxes charged by
  size, an add-on a customer wants three of (punch the item 3x rather than
  fighting a modifier that has no quantity), staff meals, and dishes that don't
  survive a delivery ride. A category whose items are all counter-only
  disappears from the storefront entirely.
- Sort order for both categories and items
- Per-item **translations** for multi-language menus
- **AI menu import** — upload a photo or PDF of a printed menu and it is read
  into an editable draft you correct before saving
- Photos are compressed in the browser before upload

---

## 8. Payments

**At the counter:** Cash, Card terminal, GCash, Maya, Bank transfer.

**Online:** the customer scans the restaurant's own **GCash**, **Maya** or
**bank (InstaPay / QRPH)** QR, sends the payment, and attaches the reference
number and a screenshot. Staff confirm it against the account before the order
is settled — a screenshot alone never closes a bill.

Money goes straight to the restaurant's own e-wallet or bank account. Servd
never touches it and adds nothing on top.

The card-gateway option (a connected PayMongo or Xendit account, redirecting
the diner off-site to pay) was withdrawn: almost nobody used it, and the extra
hop confused customers who already know how to scan a QR.

**Third-party orders (Grab, Foodpanda).** Nothing is tendered at the counter —
the rider collects the food and the platform remits later — so a third-party
ticket shows one button, **"Picked up — settled by <platform>"**, instead of
Cash / GCash / Card. It closes the ticket as its own payment method, which gives
it its own line in the shift breakdown, the Z-report and accounting. The cash
drawer never opens on one, whatever the drawer policy says, and no
cash-received line prints. Discounts, points, gift cards and split payment are
hidden on these tickets (the app charged the customer and ran its own promo);
serving, editing items and voiding still work. Recorded at the ticket's full
value, not net of the platform's commission — the commission is a cost settled
against the remittance, not a discount the restaurant gave.

**Pay before the food is made.** A setting (Printer settings) for counters
where the customer orders, pays, and only then sits down. The till leads with
**Take payment** instead of Send to kitchen, and nothing reaches the kitchen
until the money is in — a failed payment means no kitchen ticket, and the order
sits on the board waiting to be settled. Applies to dine-in and takeout, the two
where the customer is standing at the counter; pickup and delivery are ordered
ahead or paid to the rider. It only decides which button is the big one: the
cashier can always send an order unpaid, or take payment on one that wasn't
going to be. The order stays on the kitchen board after paying and closes when
the kitchen marks it done, the same "paid AND cooked" rule as everything else.

**Card surcharge.** A restaurant can set a card fee (e.g. 3.5%) in Printer
settings. It is added on top when a customer pays by card at the counter, worked
out on the server from the saved rate, shown in the pay screen before the
customer taps, and printed as its own line on the receipt with the rate on it.
On a split bill it applies only to the portion that goes on the card. Loyalty
points are not earned on the fee.

**Other payment capability**
- Split payments and partial tenders
- Gift cards and store credit
- Loyalty point redemption
- Senior Citizen / PWD discounts
- Promo codes
- Customer-uploaded payment proof
- Dine-in GCash QR: the restaurant's saved GCash QR is shown to the diner

---

## 9. Printing and hardware

Servd supports four printing transports, set per restaurant:

| Method | How it works |
|---|---|
| **Network / USB** | ESC/POS printer at a fixed station, via a small local print-bridge agent. Most reliable. |
| **Cloud** | The printer polls Servd for jobs (Star CloudPRNT, Epson Server Direct Print). Works from any device including iPad/iPhone. |
| **Bluetooth** | Web Bluetooth to a BLE ESC/POS printer. Chromium on desktop/Android only — not Safari/iOS. |
| **OS dialog** | Prints the HTML ticket through the system print dialog / AirPrint. Device-agnostic fallback. |

**Documents:** bill, paid receipt, kitchen ticket, end-of-shift summary.
Receipts are 32-column thermal, with restaurant name, address, phone, website,
custom footer, optional VAT breakdown, and a QR code to order online.

**Optional receipt lines** (Printer settings → Receipt design)
- **Who the order is for** — customer name, contact number, and the delivery
  address on delivery orders, wrapped to fit the paper. This is what a rider
  reads: without it they go back to the app or Facebook to find where they're
  going and a number to ring on arrival. Dine-in receipts are unaffected — the
  table number already says who it's for. On by default.
- **Cash received and change** — on cash sales only. Settles the "I gave you a
  thousand" conversation and lets the customer check their change on the way
  out. On by default.
- **VAT breakdown** — off for non-VAT-registered sellers.

**Cash drawer.** The drawer plugs into the receipt printer and opens when the
printer is sent a pulse. Configurable: never, on cash payments only (default),
or on every payment. Not available through the OS print dialog, which cannot
send printer control codes.

**Auto-print settings**
- Print a kitchen ticket automatically for every new order (for kitchens with no
  display)
- Print a receipt automatically when a payment settles — can be turned off
- Show delivery addresses on the kitchen display and kitchen tickets — off by
  default. On, a kitchen that works by zone sees everything heading the same way
  together and can cook and bag it in one run instead of one ticket at a time.

---

## 10. Inventory

Two ways of keeping stock, usable together:

**Per product** — for shops and ecommerce selling finished goods. One unit off
the shelf per unit sold. Start counting any product, set an opening figure and a
low-stock level.

**Per ingredient** — for kitchens. Recipes define how much of each ingredient a
dish consumes, and stock is deducted when the order is fulfilled.

**Both share:**
- Stock movements (sale, waste, adjustment, count, received, usage)
- Weighted-average cost per unit
- Suppliers
- Purchase orders, with receiving that updates stock and re-averages cost
- **Auto-reorder suggestions** from 30-day usage velocity, and one-tap draft POs
- Low-stock flags and an optional **low-stock SMS alert**
- **Auto out-of-stock** — items come off sale automatically when stock hits zero
- Stock counts, waste write-offs and restocking
- COGS reporting

**Overselling protection:** sellable stock is what's on hand minus what's already
promised to orders taken but not yet fulfilled, so the last unit can't be sold
twice.

---

## 11. Accounting

- **Gross sales / sales collected**, order count, discounts, expenses, net profit
- **Sales by payment method**
- **VAT (12%)** breakdown with Senior/PWD exemption, net of VAT and VAT amount
- **Profit & Loss** — revenue, COGS from inventory, operating expenses, net
- **Daily sales (Z-report)** table
- **Every ticket in the period** — time paid, ticket total, discount, collected,
  method, with a total that reconciles exactly to the headline figure
- **Voided tickets** listed separately with what was reversed
- **Expenses** — record and categorise business expenses
- Periods: Today, This month, Last month

All revenue figures across the app mean the same thing: **money actually
collected**, timestamped when the payment happened, bucketed in Manila time.
The dashboard, accounting and the Z-report use one definition.

---

## 12. Analytics and dashboard

**Dashboard:** pending acceptance, revenue today, orders today, open orders,
average rating today, recent orders, low-stock warnings and smart insights.

**Analytics:** revenue, order count, average order value, revenue by day,
best- and worst-selling items, payment mix, peak hours, and rating trends.

AI-generated insights are available on paid plans; rule-based insights on all.

---

## 13. HR, attendance and payroll

*(a one-time unlock)*

- **Employee records** with documents
- **Time clock** — staff clock in and out; there is a shared clock screen, a
  personal clock page, and QR/token-based clock-in
- **Attendance** tracking and a **late report**
- **Timesheets**
- **Shift scheduling** with availability and **shift swap requests**
- **Leave** — leave types, requests and balances
- **Payroll** — per-employee payroll with configurable settings and deductions
- **Performance** notes
- **Employee portal** — staff view their own payslips, schedule and leave

---

## 14. Marketing and growth

**Loyalty & rewards** — points on spend, redeemable at the till; customers
enrol by phone number.

**Promotions** — promo codes with rules, applied by the diner or the cashier.

**Happy hours** — time-windowed automatic pricing on items or categories, with
the original price struck through for diners.

**Gift cards** — sell and redeem gift cards and store credit.

**Customer book** — collected customer contacts with CSV export.

**SMS marketing** — campaigns to opted-in customers, with double opt-in,
credit metering and unsubscribe handling. Also used for order notifications and
low-stock alerts.

**Cart recovery** — follow up on abandoned online carts.

**Social content scheduler** — plan and schedule social posts, with an AI
content engine for generating and batching posts.

**Feedback & reputation** — post-meal feedback collection, ratings over time,
and Google review prompting.

---

## 15. Reservations, floor plan and delivery

**Reservations & waitlist** — public booking page, table assignment, and
reservation management.

**Visual floor plan** — lay out the room, see table status live, and open a
table's orders from the map.

**Delivery** — delivery settings, delivery zones and fees, a delivery board for
dispatch, and third-party courier booking through a provider adapter (Lalamove
and similar).

**Advance orders** — orders scheduled for a later time, with their own screen.

---

## 16. Branding and the online presence

- Restaurant name, display name, logo and colours
- Receipt branding (address, phone, website, footer)
- Online ordering website settings
- **Custom domain** — connect your own domain (a ₱500 one-time unlock)
- **White-label** — remove "Powered by Servd" (Business)
- Table QR codes, printable as a sheet (one free; unlimited is a ₱500 unlock)
- A public restaurant page at a Servd URL

---

## 17. Operations and data

- **Audit log** — every sensitive change (voids, item edits, table status, gift
  card redemptions) with who, when, and the before/after
- **Data export** — sales, orders and menu as CSV
- **Offline mode** — the kitchen and cashier keep working without a connection
  and sync when it returns (one-time unlock)
- **Tutorials** — an in-app video hub, reachable from every dashboard
- **Onboarding** — a guided setup checklist for new accounts

---

## 18. Pricing

**There is no monthly subscription.** Servd is a one-time-payment product. Full
detail is in the separate pricing document; the short version:

| | Price | Billing |
|---|---|---|
| Get started | ₱0 | Free forever |
| Activate online ordering | **₱499** | One time |
| Unlimited tables & QR codes | **₱500** | One time |
| Any other feature | ₱500 – ₱3,000 | One time, per feature |
| Content scheduler | ₱499 / month | The only recurring charge |

**Free forever, on every account:** QR dine-in, counter/takeout QR and order
numbers, cashier POS, kitchen display, 1 table QR, split payments, split bills,
tips, void/edit with manager approval, dietary tags, feedback and Google
reviews, 3 staff accounts.

**₱499 activates online ordering** — pickup and delivery, bought outright. A
restaurant builds its preview free and pays only when ready to take real orders.

**Everything else is a one-time unlock** bought from Admin → Billing & features:
accounting, inventory, HR, loyalty, promotions, reservations, floor plan, gift
cards, online payments, offline mode, custom domain, white-label, audit log,
data export, customer book. Bought once, owned for good — an unlock can't lapse
or be cancelled.

**No commission.** Servd takes no cut of sales; customers pay straight into the
restaurant's own GCash, Maya or bank account.

The ₱899 Growth and ₱1,799 Business monthly plans were retired. Any account
still on one keeps what it has.

## 19. Getting started

There are two ways in:

1. **Sign up** at the website and set the restaurant up from the dashboard.
2. **Build a preview first** — a self-serve builder where a business enters its
   name, adds a few dishes and instantly sees its own working page before
   deciding. Menu items are typed in by hand. When they're ready, they request
   activation and claim their account through a one-time secure link.

Servd never emails passwords. Activation creates the login with a secret nobody
sees, and the owner sets their own password through a one-time claim link.

---

## 20. Common questions

**Do customers need to install an app?** No. Diners scan a QR code or open the
website in any browser.

**Do I need special hardware?** No — Servd runs on any tablet, phone or laptop.
A thermal receipt printer and cash drawer are optional but supported.

**Can two cashiers work at once?** Yes. Each has their own login and their own
shift, so their takings are counted separately. Any cashier can still settle any
order — shifts decide whose money it is, never who may serve a table.

**Where does online payment money go?** Straight into the restaurant's own
GCash, Maya or bank account — the customer scans the shop's QR. Servd never
holds it.

**Does it work if the internet drops?** The kitchen and cashier screens keep
working offline once that unlock is bought, and sync when the connection returns.

**Is my data separate from other restaurants?** Yes — enforced at the database
level, not just in the application.

**Why doesn't the shift summary show the whole day?** Because it's that
cashier's drawer, not the restaurant's day. The day's total is shown underneath
for reference, clearly marked as not part of the drawer.

**Why is my dashboard revenue different from what I wrote down?** Every figure
in Servd means money actually collected. A hand-written tally usually also
includes voided tickets and unsettled orders. Accounting lists every ticket in
the period, with voided ones separately, so the difference can be found
line by line.
