"use server";

import { tenantDb, systemDb } from "@/server/tenancy/scoped-db";
import { requireStaff } from "@/server/tenancy/current-user";
import { buildTicket, type Ticket } from "@/lib/printing/ticket";
import { encodeTicketBase64 } from "@/lib/printing/escpos";

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
};

async function loadTicket(restaurantId: string, orderId: string) {
  return tenantDb(restaurantId, async (tx) => {
    const restaurant = await tx.restaurant.findFirstOrThrow({
      select: {
        name: true,
        displayName: true,
        printMethod: true,
        printerConfig: true,
        autoPrint: true,
      },
    });
    const order = await tx.order.findFirst({
      where: { id: orderId },
      include: {
        table: { select: { tableNumber: true } },
        items: { include: { modifiers: { select: { nameAtTime: true } } } },
      },
    });
    return { restaurant, order };
  });
}

/** Core dispatch usable both from the cashier action and from auto-print. */
async function dispatch(restaurantId: string, orderId: string): Promise<PrintDispatch> {
  const { restaurant, order } = await loadTicket(restaurantId, orderId);
  if (!order) return { ok: false, handledOnServer: false, message: "Order not found." };

  const ticket = buildTicket({
    restaurantName: restaurant.displayName || restaurant.name,
    tableNumber: order.table?.tableNumber ?? "—",
    orderId: order.id,
    createdAt: order.createdAt.toISOString(),
    total: order.total,
    items: order.items.map((i) => ({
      quantity: i.quantity,
      name: i.nameAtTime,
      modifiers: i.modifiers.map((m) => m.nameAtTime),
      note: i.note,
    })),
  });

  const config = (restaurant.printerConfig as PrinterConfig | null) ?? {};
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

/** Auto-print on new order — only the server-handled transports run unattended. */
export async function autoPrintIfEnabled(restaurantId: string, orderId: string): Promise<void> {
  const { restaurant } = await loadTicket(restaurantId, orderId);
  if (!restaurant.autoPrint) return;
  if (restaurant.printMethod === "network" || restaurant.printMethod === "cloud") {
    await dispatch(restaurantId, orderId);
  }
  // Client transports (bluetooth/os_dialog) can't print unattended — the cashier
  // board prompts instead.
}
