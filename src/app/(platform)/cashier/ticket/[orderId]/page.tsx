import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/server/tenancy/current-user";
import { getOrderTicket } from "@/server/printing/ticket-query";
import { ticketLines } from "@/lib/printing/ticket";
import { AutoPrint } from "@/components/cashier/AutoPrint";

/**
 * Printable HTML ticket for the OS-dialog / AirPrint transport. Rendered in a
 * narrow, monospace, receipt-like layout and auto-opens the print dialog.
 */
export default async function TicketPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const user = await getCurrentUser();
  if (!user || user.kind !== "staff" || !["cashier", "admin"].includes(user.role)) {
    redirect("/login");
  }

  const ticket = await getOrderTicket(user.restaurantId, orderId);
  if (!ticket) notFound();

  return (
    <div className="mx-auto max-w-[300px] bg-white p-4 font-mono text-sm text-black">
      <AutoPrint />
      <pre className="whitespace-pre-wrap leading-snug">
        {ticketLines(ticket).join("\n")}
      </pre>
    </div>
  );
}
