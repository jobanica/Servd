# BIR Compliance — Design Doc (for review)

Status: **DRAFT for sign-off. No code written yet.**
Scope decision (confirmed): **Full accreditation artifacts**, **Sales Invoice** as the
principal document (EOPT-aligned), with a **per-tenant VAT / non-VAT** toggle.
Plan tier: **Business**.

> ⚠️ Disclaimer: This is a software design, not tax/legal advice. BIR accreditation is a
> per-business filing with the taxpayer's own RDO, and exact form/layout/permit details
> should be confirmed with a Philippine-licensed tax professional and the restaurant's RDO
> before go-live. Servd's job is to make the software **capable of producing the required
> documents and reports**; the restaurant files the Permit-to-Use (PTU) / accreditation.

---

## 1. Regulatory summary (what the software must do)

**EOPT Act (RA 11976) + RR 7-2024 (eff. 27 Apr 2024), amended by RR 11-2024**
- The **principal document is now the "Invoice"** (the term "Official Receipt" as the
  primary document is retired). For a restaurant, each sale is evidenced by a **Sales
  Invoice** that serves as proof of **both the sale and the payment**.
- Required invoice content (RR 7-2024 §6B): registered name, **TIN + branch code**,
  business address, date, the buyer's details for B2B (optional for B2C walk-ins),
  itemized sale, and the **VAT breakdown** (VATable / VAT-exempt / zero-rated / **12% VAT
  amount**), SC/PWD discount lines where applicable, and a clear **document title**
  ("Invoice" / "Sales Invoice").

**CRM/POS & CAS accreditation (RR 11-2004, RMC 69-2020, RMO 24-2023)** — for a computerized
/ web-based POS the system must be able to produce:
- **Gapless sequential serial numbers** per registered machine/system (never reused).
- A **non-resettable accumulated grand total** (≥ 10 digits incl. decimals).
- **X-reading** (interim, any time) and **Z-reading** (end-of-day; increments a Z-counter,
  snapshots beginning/ending grand total, resets the day's running totals).
- An **Electronic Journal (EJ) / audit journal** — an immutable record of every issued
  invoice, voids included.
- A **reset counter**, **void counter**, and machine identifiers: **MIN** (Machine
  Identification Number), **PTU number**, serial prefix, and the **"Acknowledgement
  Certificate"** details printed on the invoice footer.

---

## 2. What we already have vs. gaps

| Capability | Today | Gap |
|---|---|---|
| Itemized totals, discounts | ✅ orders + discountAmount/label | VAT breakdown, exemptions |
| Payments record | ✅ Payment rows | tie an immutable invoice to settlement |
| Receipt printing | ✅ bill/receipt templates | BIR invoice layout + required fields |
| Audit trail | ✅ audit_logs | dedicated immutable **invoice EJ** |
| Senior/PWD discount | ✅ discountLabel "Senior…" | VAT-exempt treatment of those sales |
| Tax identity | ❌ | per-tenant **TaxProfile** (TIN, MIN, PTU, VAT flag…) |
| Serial numbering | ❌ | gapless per-restaurant counter |
| Grand total / X/Z reading | ❌ | accumulators + daily Z records + reports |

---

## 3. Proposed data model (new tables, all Business-gated, RLS + app_user grants)

### `TaxProfile` (one per restaurant)
```
registeredName     String      // BIR-registered taxpayer name
tin                String      // 000-000-000
branchCode         String      // e.g. 00000
businessAddress    String
rdoCode            String?
vatRegistered      Boolean     // true => 12% VAT; false => non-VAT (percentage tax)
vatRate            Int         // basis points, default 1200 (12.00%)
minNumber          String?     // Machine Identification Number
ptuNumber          String?     // Permit to Use
serialPrefix       String      // e.g. "SI-" for the invoice serial
accreditationNo    String?     // Acknowledgement Certificate / accreditation
invoiceFooterNote  String?     // any RDO-mandated footer text
```

### `InvoiceCounter` (one row per restaurant — the registered "machine")
```
nextSerial         BigInt      // next sequential number (gapless)
grandTotal         BigInt      // non-resettable accumulated gross (centavos)
zCounter           Int         // number of Z-readings done
resetCounter       Int
voidCounter        Int
```
All mutations happen inside a transaction with `SELECT … FOR UPDATE` semantics so two
concurrent settlements can't take the same serial.

### `Invoice` (immutable Electronic Journal — never updated except status=voided)
```
serialNo           String      // serialPrefix + zero-padded number (the gapless id)
orderId            String?     // link to the settled order(s)
issuedAt           DateTime
status             String      // "issued" | "voided"
// money snapshot (centavos), computed server-side at issue time:
grossAmount        Int         // total billed
vatableSales       Int
vatExemptSales     Int
zeroRatedSales     Int
vatAmount          Int         // 12% of vatableSales (0 for non-VAT)
discountAmount     Int
discountLabel      String?     // "Senior Citizen (20%)" etc.
scPwdExempt        Boolean     // this sale used SC/PWD VAT exemption
netAmount          Int         // amount due / paid
paymentMethod      String
grandTotalAfter    BigInt      // accumulator snapshot (audit)
customerName       String?     // for B2B; optional for walk-ins
customerTin        String?
voidedAt           DateTime?
voidReason         String?
```

### `ZReading` (one row per daily close)
```
zNumber            Int
businessDate       Date
openedAt / closedAt
beginningGrandTotal BigInt
endingGrandTotal    BigInt
grossSales / vatableSales / vatExempt / zeroRated / vatAmount / discounts  Int
invoiceFrom / invoiceTo  String   // serial range covered
invoiceCount / voidCount Int
```
X-reading reuses the same computation but is **not** persisted and does not advance the
Z-counter.

---

## 4. Where an invoice is issued

Under EOPT the invoice is proof of sale **and** payment, so the natural hook is **payment
settlement** — every place an order becomes `paid`:
- Cashier cash/card (`pay`), split/partial final settlement (`recordPartialPayment`),
  and the online-payment **webhook** (`activateByProviderRef`-style chokepoint).

At settlement, in the same transaction:
1. Take the next serial (`InvoiceCounter.nextSerial++`).
2. Compute the **VAT breakdown** server-side from the order's net:
   - **VAT-registered:** `vatableSales = net / 1.12`, `vatAmount = net − vatableSales`.
     SC/PWD sales are **VAT-exempt** (move to `vatExemptSales`, no 12%) and get the 20%
     discount — driven by the existing `discountLabel` ("Senior Citizen" / "PWD").
   - **Non-VAT:** everything is `vatExemptSales`, `vatAmount = 0`, footer notes
     percentage-tax registration.
3. Add `net` to the **non-resettable grand total**.
4. Write the immutable `Invoice` (EJ) row.
5. Print the **BIR Sales Invoice** layout (new print template) with all required fields +
   serial + MIN/PTU footer.

**Voids after issuance:** the `Invoice` is **not deleted** — it's marked `status=voided`
(reason kept), excluded from sales totals, and counted in the Z-reading's void counter.
(Refunds post-payment would be a credit-note flow — proposed for a later phase.)

---

## 5. Reports & exports
- **X-reading** page/button (cashier) — interim running totals, no persistence.
- **Z-reading** (end-of-day close) — generates + stores a `ZReading`, advances the
  Z-counter, printable, and listed in an admin "BIR reports" page.
- **Electronic Journal export** — CSV/JSON of the `Invoice` ledger for a date range
  (reuses the data-export pattern).
- **Sales summary** aligned to VAT return fields (VATable / exempt / zero-rated / output
  VAT) for the period.

---

## 6. Proposed phasing (each phase shippable + reviewable)

- **Phase 1 — Compliant invoice + numbering + EJ + grand total**
  `TaxProfile` + `InvoiceCounter` + `Invoice`; admin Tax-profile settings; issue an
  invoice at settlement with gapless serial, VAT breakdown, accumulated grand total; new
  BIR Sales-Invoice print template.
- **Phase 2 — X/Z reading + reports**
  X-reading, end-of-day Z close (`ZReading`), BIR reports page, EJ export.
- **Phase 3 — Accreditation artifacts**
  PTU/MIN/accreditation footer fields, the data pack a restaurant submits with its CAS/POS
  PTU application, void/credit-note handling, and any RDO-specific layout tweaks.

---

## 7. Decisions I need from you before building

1. **Serial scope** — one gapless sequence **per restaurant** (single registered system),
   or per **branch/terminal**? *Recommend per-restaurant for v1 (one MIN), prefix-based.*
2. **Issue point** — issue the invoice at **payment settlement** (recommended) vs. at
   order placement. (EOPT says invoice = proof of sale+payment, so settlement fits.)
3. **Counter / takeout & online orders** — issue invoices for those too at settlement?
   *Recommend yes — every paid sale gets an invoice.*
4. **SC/PWD VAT exemption** — confirm we should auto-treat orders whose discount is
   "Senior Citizen"/"PWD" as **VAT-exempt + 20%** for VAT-registered tenants.
5. **Build scope now** — Phase 1 only (for review), or Phases 1–2 together?
6. **Validation** — do you have a PH tax professional / sample BIR-accredited invoice we
   should match the layout to? That de-risks the print template a lot.

---

## 8. Risks / notes
- BIR accreditation is the **taxpayer's filing**; we provide a compliant-capable system,
  not the permit itself. Final layout/fields should be confirmed with the RDO.
- The **non-resettable grand total** and **gapless serial** are integrity-critical — they
  live behind server-only, transaction-guarded code; no client input; never editable in
  the UI.
- This is large; that's why it's phased and design-first.
