import { NextRequest } from "next/server";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * Cloud / server-direct print poll endpoint.
 *
 * A CloudPRNT-style printer is configured to poll this URL. We hand it the next
 * queued job as a raw ESC/POS byte stream and mark it printed. This is the
 * device-agnostic transport — it works even from an iPad/iPhone cashier because
 * the printer, not the browser, fetches the job.
 *
 * The printer authenticates with a per-restaurant token stored in
 * `printerConfig.pollToken`. The request is unauthenticated otherwise, so this
 * runs in systemDb but is tightly scoped by restaurantId + token.
 *
 * NOTE: simplified vs the full CloudPRNT handshake (status POST → job GET →
 * confirm) — enough to demonstrate the transport; harden per your printer model.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ restaurantId: string }> },
) {
  const { restaurantId } = await params;
  const token = req.nextUrl.searchParams.get("token");

  const job = await systemDb(async (tx) => {
    const restaurant = await tx.restaurant.findUnique({
      where: { id: restaurantId },
      select: { printerConfig: true },
    });
    const cfg = (restaurant?.printerConfig as { pollToken?: string } | null) ?? null;
    if (!cfg?.pollToken || cfg.pollToken !== token) return "unauthorized" as const;

    const next = await tx.printJob.findFirst({
      where: { restaurantId, method: "cloud", status: "queued" },
      orderBy: { createdAt: "asc" },
    });
    if (!next) return null;

    await tx.printJob.update({
      where: { id: next.id },
      data: { status: "printed", printedAt: new Date() },
    });
    return next;
  });

  if (job === "unauthorized") {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!job) {
    // No work — printers treat an empty 200 as "nothing to print".
    return new Response(null, { status: 200 });
  }

  const bytes = Buffer.from(job.payloadBase64, "base64");
  return new Response(bytes, {
    status: 200,
    headers: { "Content-Type": "application/octet-stream" },
  });
}
