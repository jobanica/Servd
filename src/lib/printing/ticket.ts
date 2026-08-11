/**
 * The order ticket / receipt — built ONCE as structured data, then rendered to
 * either ESC/POS bytes (thermal printers) or printable HTML (OS dialog). Header
 * (name + contact) and footer are customizable in Printer settings; the body is
 * an itemized, VAT-inclusive receipt and the QR points to the restaurant's site.
 */

const VAT_RATE = 0.12;
const WIDTH = 32; // characters per line (58mm thermal; 80mm just has slack)

/** Right-align `right` against `left` within WIDTH characters. */
function pad(left: string, right: string, width = WIDTH): string {
  const space = width - left.length - right.length;
  return space >= 1 ? left + " ".repeat(space) + right : `${left} ${right}`;
}
/** Plain decimal (no currency glyph — thermal printers can't render ₱). */
function amt(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

export interface TicketLine {
  quantity: number;
  name: string;
  modifiers: string[];
  note?: string | null;
  lineTotal: number; // centavos
}

export interface ReceiptBranding {
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  footer?: string | null;
  showVat?: boolean; // print the "VAT (12% incl.)" line (default true)
}

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  card_terminal: "Card",
  gcash: "GCash",
  maya: "Maya",
  online_gcash: "GCash",
  online_card: "Card (online)",
};

/**
 * "bill" = pre-payment (amount due); "receipt" = post-payment (paid);
 * "kitchen" = prep ticket for the kitchen (items only, no prices).
 */
export type TicketKind = "bill" | "receipt" | "kitchen";

export interface Ticket {
  kind: TicketKind;
  restaurantName: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  footer: string | null;
  showVat: boolean;
  tableNumber: string;
  orderType: "dine_in" | "takeout" | "delivery";
  customerName: string | null;
  customerAddress: string | null;
  orderRef: string;
  placedAt: string;
  items: TicketLine[];
  total: number; // gross items (centavos)
  discountAmount: number;
  discountLabel: string | null;
  paymentMethod: string | null;
  paymentAmount: number | null;
  qrUrl: string | null; // website link encoded as a QR
}

export interface TicketSource extends ReceiptBranding {
  kind?: TicketKind;
  restaurantName: string;
  tableNumber: string;
  orderType?: "dine_in" | "takeout" | "delivery";
  customerName?: string | null;
  customerAddress?: string | null;
  orderId: string;
  createdAt: string;
  total: number;
  discountAmount?: number;
  discountLabel?: string | null;
  paymentMethod?: string | null;
  paymentAmount?: number | null;
  qrUrl?: string | null;
  items: { quantity: number; name: string; modifiers: string[]; note?: string | null; lineTotal: number }[];
}

export function buildTicket(src: TicketSource): Ticket {
  return {
    kind: src.kind ?? "receipt",
    restaurantName: src.restaurantName,
    address: src.address ?? null,
    phone: src.phone ?? null,
    website: src.website ?? null,
    footer: src.footer ?? null,
    showVat: src.showVat !== false, // default to showing VAT
    tableNumber: src.tableNumber,
    orderType: src.orderType ?? "dine_in",
    customerName: src.customerName ?? null,
    customerAddress: src.customerAddress ?? null,
    orderRef: src.orderId.slice(0, 8).toUpperCase(),
    placedAt: src.createdAt,
    items: src.items.map((i) => ({
      quantity: i.quantity,
      name: i.name,
      modifiers: i.modifiers,
      note: i.note ?? null,
      lineTotal: i.lineTotal,
    })),
    total: src.total,
    discountAmount: src.discountAmount ?? 0,
    discountLabel: src.discountLabel ?? null,
    // Only a paid receipt shows a payment line (bills/kitchen tickets never do).
    paymentMethod: src.kind === "receipt" ? src.paymentMethod ?? null : null,
    paymentAmount: src.kind === "receipt" ? src.paymentAmount ?? null : null,
    // The kitchen ticket carries no QR (it's for the cooks, not the diner).
    qrUrl: src.kind === "kitchen" ? null : src.qrUrl ?? null,
  };
}

/** The document label printed under the heading. */
export function ticketDocLabel(t: Ticket): string {
  if (t.kind === "bill") return "*** BILL ***";
  if (t.kind === "kitchen") return "*** KITCHEN ***";
  return "*** OFFICIAL RECEIPT ***";
}

/** Net payable + VAT-of-net (centavos). */
export function ticketTotals(t: Ticket) {
  const net = Math.max(0, t.total - t.discountAmount);
  const vat = Math.round(net - net / (1 + VAT_RATE));
  return { net, vat };
}

/** The big heading line: table number, or PICKUP/DELIVERY + customer. */
export function ticketHeading(t: Ticket): string {
  if (t.orderType === "takeout") return `PICKUP - ${t.customerName ?? ""}`.trim();
  if (t.orderType === "delivery") return `DELIVERY - ${t.customerName ?? ""}`.trim();
  return `TABLE ${t.tableNumber}`;
}

/** Centered header: restaurant name + any contact lines. */
export function ticketHeaderLines(t: Ticket): string[] {
  const lines = [t.restaurantName];
  if (t.address) lines.push(t.address);
  if (t.phone) lines.push(t.phone);
  if (t.website) lines.push(t.website);
  return lines;
}

/** Left-aligned body: meta, itemized lines with prices, totals, payment. */
export function ticketBodyLines(t: Ticket): string[] {
  const lines: string[] = [];

  // Kitchen ticket = prep list only: quantities, items, modifiers and notes.
  // No prices, totals, VAT or payment — the cooks just need what to make.
  if (t.kind === "kitchen") {
    lines.push(`Order #${t.orderRef}`);
    lines.push(new Date(t.placedAt).toLocaleString());
    lines.push("--------------------------------");
    for (const item of t.items) {
      lines.push(`${item.quantity}x ${item.name}`);
      for (const mod of item.modifiers) lines.push(`   + ${mod}`);
      if (item.note) lines.push(`   ! ${item.note}`);
    }
    return lines;
  }

  const docLabel = t.kind === "bill" ? "Bill" : "Receipt";
  lines.push(`${docLabel} #${t.orderRef}`);
  lines.push(new Date(t.placedAt).toLocaleString());
  lines.push("--------------------------------");
  for (const item of t.items) {
    lines.push(pad(`${item.quantity}x ${item.name}`, amt(item.lineTotal)));
    for (const mod of item.modifiers) lines.push(`   + ${mod}`);
    if (item.note) lines.push(`   ! ${item.note}`);
  }
  lines.push("--------------------------------");
  const { net, vat } = ticketTotals(t);
  if (t.discountAmount > 0) {
    lines.push(pad("Subtotal", amt(t.total)));
    lines.push(pad(t.discountLabel ?? "Discount", `-${amt(t.discountAmount)}`));
  }
  if (t.showVat) lines.push(pad("VAT (12% incl.)", amt(vat)));
  // Bill = amount the customer must PAY; receipt = total they paid.
  lines.push(pad(t.kind === "bill" ? "AMOUNT DUE (PHP)" : "TOTAL (PHP)", amt(net)));

  if (t.kind === "bill") {
    lines.push("");
    lines.push("Please pay at the counter.");
  } else if (t.paymentMethod) {
    lines.push(pad(METHOD_LABEL[t.paymentMethod] ?? t.paymentMethod, amt(t.paymentAmount ?? net)));
    lines.push("*** PAID ***");
  }
  return lines;
}

/** Centered footer (custom message), split across lines. */
export function ticketFooterLines(t: Ticket): string[] {
  if (!t.footer) return [];
  return t.footer.split("\n").map((s) => s.trim()).filter(Boolean);
}

/** Full plain-text rendering (HTML fallback / preview). */
export function ticketLines(ticket: Ticket): string[] {
  const footer = ticketFooterLines(ticket);
  const contact: string[] = [];
  if (ticket.orderType === "delivery" && ticket.customerAddress) contact.push(ticket.customerAddress);
  return [
    ...ticketHeaderLines(ticket),
    ticketHeading(ticket),
    ticketDocLabel(ticket),
    ...contact,
    ...ticketBodyLines(ticket),
    ...(footer.length ? ["", ...footer] : []),
  ];
}
