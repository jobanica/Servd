/**
 * The kitchen ticket — built ONCE as structured data, then rendered to either
 * ESC/POS bytes (thermal printers) or printable HTML (OS dialog / AirPrint).
 * Keeping it as a plain model means every transport prints the same thing.
 */

import { formatPeso } from "@/lib/money";

export interface TicketLine {
  quantity: number;
  name: string;
  modifiers: string[];
  note?: string | null;
}

export interface Ticket {
  restaurantName: string;
  tableNumber: string;
  orderRef: string; // short, human-readable
  placedAt: string; // ISO
  items: TicketLine[];
  total: number; // centavos (gross subtotal)
  discountAmount: number; // centavos off
  discountLabel: string | null;
}

export interface TicketSource {
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

/** Plain-text rendering shared by the HTML fallback and as ESC/POS body text. */
export function ticketLines(ticket: Ticket): string[] {
  const lines: string[] = [];
  lines.push(ticket.restaurantName);
  lines.push(`TABLE ${ticket.tableNumber}`);
  lines.push(`Order #${ticket.orderRef}`);
  lines.push(new Date(ticket.placedAt).toLocaleString());
  lines.push("--------------------------------");
  for (const item of ticket.items) {
    lines.push(`${item.quantity}x ${item.name}`);
    for (const mod of item.modifiers) lines.push(`   + ${mod}`);
    if (item.note) lines.push(`   ! ${item.note}`);
  }
  lines.push("--------------------------------");
  if (ticket.discountAmount > 0) {
    lines.push(`SUBTOTAL  ${formatPeso(ticket.total)}`);
    lines.push(`DISCOUNT  -${formatPeso(ticket.discountAmount)}`);
    if (ticket.discountLabel) lines.push(`  (${ticket.discountLabel})`);
    lines.push(`TOTAL DUE  ${formatPeso(Math.max(0, ticket.total - ticket.discountAmount))}`);
  } else {
    lines.push(`TOTAL  ${formatPeso(ticket.total)}`);
  }
  return lines;
}
