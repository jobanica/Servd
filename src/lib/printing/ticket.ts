/**
 * The order ticket / receipt — built ONCE as structured data, then rendered to
 * either ESC/POS bytes (thermal printers) or printable HTML (OS dialog). The
 * header (restaurant name + contact lines) and footer message are customizable
 * by the restaurant in Printer settings.
 */

import { formatPeso } from "@/lib/money";

export interface TicketLine {
  quantity: number;
  name: string;
  modifiers: string[];
  note?: string | null;
}

export interface ReceiptBranding {
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  footer?: string | null;
}

export interface Ticket {
  restaurantName: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  footer: string | null;
  tableNumber: string;
  orderRef: string; // short, human-readable
  placedAt: string; // ISO
  items: TicketLine[];
  total: number; // centavos (gross subtotal)
  discountAmount: number; // centavos off
  discountLabel: string | null;
}

export interface TicketSource extends ReceiptBranding {
  restaurantName: string;
  tableNumber: string;
  orderId: string;
  createdAt: string;
  total: number;
  discountAmount?: number;
  discountLabel?: string | null;
  items: { quantity: number; name: string; modifiers: string[]; note?: string | null }[];
}

export function buildTicket(src: TicketSource): Ticket {
  return {
    restaurantName: src.restaurantName,
    address: src.address ?? null,
    phone: src.phone ?? null,
    website: src.website ?? null,
    footer: src.footer ?? null,
    tableNumber: src.tableNumber,
    orderRef: src.orderId.slice(0, 8).toUpperCase(),
    placedAt: src.createdAt,
    items: src.items.map((i) => ({
      quantity: i.quantity,
      name: i.name,
      modifiers: i.modifiers,
      note: i.note ?? null,
    })),
    total: src.total,
    discountAmount: src.discountAmount ?? 0,
    discountLabel: src.discountLabel ?? null,
  };
}

/** Centered header: restaurant name + any contact lines. */
export function ticketHeaderLines(t: Ticket): string[] {
  const lines = [t.restaurantName];
  if (t.address) lines.push(t.address);
  if (t.phone) lines.push(t.phone);
  if (t.website) lines.push(t.website);
  return lines;
}

/** Left-aligned body: order meta, items, totals. */
export function ticketBodyLines(t: Ticket): string[] {
  const lines: string[] = [];
  lines.push(`Order #${t.orderRef}`);
  lines.push(new Date(t.placedAt).toLocaleString());
  lines.push("--------------------------------");
  for (const item of t.items) {
    lines.push(`${item.quantity}x ${item.name}`);
    for (const mod of item.modifiers) lines.push(`   + ${mod}`);
    if (item.note) lines.push(`   ! ${item.note}`);
  }
  lines.push("--------------------------------");
  if (t.discountAmount > 0) {
    lines.push(`SUBTOTAL  ${formatPeso(t.total)}`);
    lines.push(`DISCOUNT  -${formatPeso(t.discountAmount)}`);
    if (t.discountLabel) lines.push(`  (${t.discountLabel})`);
    lines.push(`TOTAL DUE  ${formatPeso(Math.max(0, t.total - t.discountAmount))}`);
  } else {
    lines.push(`TOTAL  ${formatPeso(t.total)}`);
  }
  return lines;
}

/** Centered footer (custom message), split across lines. */
export function ticketFooterLines(t: Ticket): string[] {
  if (!t.footer) return [];
  return t.footer
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Full plain-text rendering (HTML fallback / preview). */
export function ticketLines(ticket: Ticket): string[] {
  const footer = ticketFooterLines(ticket);
  return [
    ...ticketHeaderLines(ticket),
    `TABLE ${ticket.tableNumber}`,
    ...ticketBodyLines(ticket),
    ...(footer.length ? ["", ...footer] : []),
  ];
}
