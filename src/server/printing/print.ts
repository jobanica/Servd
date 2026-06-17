"use server";

import { tenantDb, systemDb } from "@/server/tenancy/scoped-db";
import { requireStaff } from "@/server/tenancy/current-user";
import { buildTicket, type Ticket } from "@/lib/printing/ticket";
import { encodeTicketBase64 } from "@/lib/printing/escpos";
import { restaurantSiteUrl } from "@/lib/qr";

/**
 * PLUGGABLE PRINTING
 *
 * One ticket model, four transports (stored per restaurant as `printMethod`):
 *   network   — POST ESC/POS to a local print-bridge agent (browsers can't open
 *               raw TCP :9100, so a tiny agent at the cashier station relays it).
 *   cloud     — enqueue a PrintJob; the printer POLLS /api/print/cloud/[id].
 *               Works on ANY device (iPad/iPhone included).
 *   bluetooth — handled in the browser (Web Bluetooth, Chromium only).
 *   os_dialog — handled in the browser (print the HTML ticket via the OS dialog).
 *
 * The server handles network + cloud; for the two client transports it returns
 * the ticket data and tells the UI to finish the job.
 */

export interface PrintDispatch {
  ok: boolean;
  handledOnServer: boolean;
  clientAction?: "bluetooth" | "os_dialog";
  ticket?: Ticket;
  ticketBase64?: string;
  message: string;
}

type PrinterConfig = {
  bridgeUrl?: string;
  pollToken?: string;
  receipt?: {
    address?: string | null;
    phone?: string | null;
    website?: string | null;
    footer?: string | null;
  };
};

async function loadTicket(restaurantId: string, orderId: string) {
  return tenantDb(restaurantId, async (tx) => {
    const restaurant = await tx.restaurant.findFirstOrThrow({
      select: {
        name: true,
        displayName: true,
        slug: true,
        printMethod: true,
        printerConfig: true,
        autoPrint: true,
      },
    });
    // Explicit select (no SELECT *) so a lagging schema can't break printing.
    const order = await tx.order.findFirst({
      where: { id: orderId },
      select: {
        id: true,
        total: true,
        createdAt: true,
        table: { select: { tableNumber: true } },
        items: {
          select: {
            quantity: true,
            nameAtTime: true,
            note: true,
            unitPrice: true,
            modifiers: { select: { nameAtTime: true, priceDeltaAtTime: true } },
          },
        },
      },
    });

    // Latest settled payment → tendered line on the receipt (best-effort).
    let payment: { method: string; amount: number } | null = null;
    if (order) {
      try {
        const pay = await tx.payment.findFirst({
          where: { orderId, status: "paid" },
          orderBy: { createdAt: "desc" },
          select: { method: true, amount: true },
        });
        if (pay) payment = { method: pay.method, amount: pay.amount };
      } catch {
        /* no payment yet */
      }
    }

    // Newer columns (discount / order type) — read best-effort.
    let meta: {
      discountAmount: number;
      discountLabel: string | null;
      orderType: "dine_in" | "takeout" | "delivery";
      customerName: string | null;
      customerAddress: string | null;
    } = { discountAmount: 0, discountLabel: null, orderType: "dine_in", customerName: null, customerAddress: null };
    if (order) {
      try {
        const m = await tx.order.findFirst({
          where: { id: orderId },
          select: {
            discountAmount: true,
            discountLabel: true,
            orderType: true,
            customerName: true,
            customerAddress: true,
          },
        });
        if (m) {
          meta = {
            discountAmount: m.discountAmount ?? 0,
            discountLabel: m.discountLabel ?? null,
            orderType: (m.orderType ?? "dine_in") as typeof meta.orderType,
            customerName: m.customerName ?? null,
            customerAddress: m.customerAddress ?? null,
          };
        }
      } catch {
        /* not migrated yet */
      }
    }
    return { restaurant, order, meta, payment };
  });
}

/** Core dispatch usable both from the cashier action and from auto-print. */
async function dispatch(restaurantId: string, orderId: string): Promise<PrintDispatch> {
  const { restaurant, order, meta, payment } = await loadTicket(restaurantId, orderId);
  if (!order) return { ok: false, handledOnServer: false, message: "Order not found." };

  const config = (restaurant.printerConfig as PrinterConfig | null) ?? {};
  const r = config.receipt ?? {};

  const ticket = buildTicket({
    restaurantName: restaurant.displayName || restaurant.name,
    address: r.address,
    phone: r.phone,
    website: r.website,
    footer: r.footer,
    tableNumber: order.table?.tableNumber ?? "—",
    orderType: meta.orderType,
    customerName: meta.customerName,
    customerAddress: meta.customerAddress,
    orderId: order.id,
    createdAt: order.createdAt.toISOString(),
    total: order.total,
    discountAmount: meta.discountAmount,
    discountLabel: meta.discountLabel,
    paymentMethod: payment?.method ?? null,
    paymentAmount: payment?.amount ?? null,
    qrUrl: restaurantSiteUrl(restaurant.slug),
    items: order.items.map((i) => {
      const unit = i.unitPrice + i.modifiers.reduce((s, m) => s + m.priceDeltaAtTime, 0);
      return {
        quantity: i.quantity,
        name: i.nameAtTime,
        modifiers: i.modifiers.map((m) => m.nameAtTime),
        note: i.note,
        lineTotal: unit * i.quantity,
      };
    }),
  });
  const base64 = encodeTicketBase64(ticket);

  switch (restaurant.printMethod) {
    case "network": {
      if (!config.bridgeUrl) {
        return { ok: false, handledOnServer: true, message: "No print-bridge URL configured." };
      }
      let status = "printed";
      try {
        const res = await fetch(config.bridgeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: Buffer.from(base64, "base64"),
        });
        if (!res.ok) status = "failed";
      } catch {
        status = "failed";
      }
      await systemDb((tx) =>
        tx.printJob.create({
          data: { restaurantId, orderId, method: "network", payloadBase64: base64, status,
            printedAt: status === "printed" ? new Date() : null },
        }),
      );
      return {
        ok: status === "printed",
        handledOnServer: true,
        message: status === "printed" ? "Sent to printer." : "Printer didn't respond.",
      };
    }
    case "cloud": {
      await systemDb((tx) =>
        tx.printJob.create({
          data: { restaurantId, orderId, method: "cloud", payloadBase64: base64, status: "queued" },
        }),
      );
      return { ok: true, handledOnServer: true, message: "Queued — the printer will pick it up." };
    }
    case "bluetooth":
      return { ok: true, handledOnServer: false, clientAction: "bluetooth", ticketBase64: base64, message: "" };
    case "os_dialog":
    default:
      return { ok: true, handledOnServer: false, clientAction: "os_dialog", ticket, message: "" };
  }
}

/** Cashier-triggered print. */
export async function printOrderTicket(orderId: string): Promise<PrintDispatch> {
  let staff;
  try {
    staff = await requireStaff(["cashier", "admin"]);
  } catch {
    return { ok: false, handledOnServer: false, message: "Not allowed." };
  }
  return dispatch(staff.restaurantId, orderId);
}

/**
 * Auto-print a ticket. The server-handled transports (network/cloud) print
 * unattended here. For the browser transports (bluetooth/os_dialog) the server
 * can't print on its own, so we return `clientPrintNeeded: true` and the cashier
 * board opens the printable ticket page (which auto-fires the print dialog).
 */
export async function autoPrintIfEnabled(
  restaurantId: string,
  orderId: string,
): Promise<{ clientPrintNeeded: boolean }> {
  const { restaurant } = await loadTicket(restaurantId, orderId);
  if (!restaurant.autoPrint) return { clientPrintNeeded: false };
  if (restaurant.printMethod === "network" || restaurant.printMethod === "cloud") {
    await dispatch(restaurantId, orderId);
    return { clientPrintNeeded: false };
  }
  return { clientPrintNeeded: true };
}
