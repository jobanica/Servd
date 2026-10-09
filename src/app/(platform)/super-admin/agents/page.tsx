import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { systemDb } from "@/server/tenancy/scoped-db";
import { manilaDate, manilaDateTime } from "@/lib/time/manila";
import { callbackUrl } from "@/server/agent-portal/config";
import { getPaymentDetails } from "@/server/agent-portal/billing";
import { retryEvent } from "@/server/agent-portal/admin-actions";
import { AttachAgentCodeForm } from "@/components/super-admin/agents/AttachAgentCodeForm";
import { PaymentDetailsForm } from "@/components/super-admin/agents/PaymentDetailsForm";

export const dynamic = "force-dynamic";

/**
 * CANVEXIA sales agents: the connection, the queue, where owners pay, and
 * which restaurants came through an agent. Servd never works out commission —
 * the portal does; this screen only shows what was reported and what failed.
 */
export default async function AgentsPage() {
  await requireSuperAdminPage();

  const env = {
    url: !!process.env.AGENT_PORTAL_URL?.trim(),
    slug: process.env.AGENT_PORTAL_PRODUCT_SLUG?.trim() || null,
    secret: !!process.env.AGENT_PORTAL_SECRET?.trim(),
  };
  const configured = env.url && !!env.slug && env.secret;

  let data: Awaited<ReturnType<typeof load>> | null = null;
  try {
    data = await load();
  } catch {
    data = null;
  }
  const paymentDetails = await getPaymentDetails();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Sales agents</h1>
        <p className="text-sm text-plum-ink/50">
          Restaurants referred by CANVEXIA agents report to the agent portal, which confirms their payments and
          works out commission.
        </p>
      </div>

      <section className="rounded-tile border border-plum-ink/10 bg-white p-5 text-sm">
        <h2 className="font-heading font-bold">Connection</h2>
        <p className="mt-1">
          {configured ? (
            <span className="font-semibold text-plum-ink">✓ Configured — product slug {env.slug}</span>
          ) : (
            <span className="font-semibold text-guava">
              Not configured — events are queued and nothing is sent. Missing:{" "}
              {[!env.url && "AGENT_PORTAL_URL", !env.slug && "AGENT_PORTAL_PRODUCT_SLUG", !env.secret && "AGENT_PORTAL_SECRET"]
                .filter(Boolean)
                .join(", ")}
            </span>
          )}
        </p>
        <p className="mt-2 text-plum-ink/60">Callback URL to register in the portal:</p>
        <code className="mt-1 block break-all rounded bg-cream px-2 py-1 font-mono text-xs">{callbackUrl()}</code>
      </section>

      {!data ? (
        <p className="rounded-tile border border-guava/30 bg-guava/10 p-4 text-sm">
          The agent tables aren&apos;t there yet — run <code>prisma/manual/add-agent-portal.sql</code>.
        </p>
      ) : (
        <>
          <section className="rounded-tile border border-plum-ink/10 bg-white p-5 text-sm">
            <h2 className="font-heading font-bold">Event queue</h2>
            <p className="mt-1 text-plum-ink/70">
              {data.counts.pending} pending · {data.counts.sent} sent · {data.counts.failed} failed
            </p>
            {data.failed.length > 0 && (
              <ul className="mt-3 divide-y divide-plum-ink/5">
                {data.failed.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 py-2">
                    <span>
                      <span className="font-semibold">{e.type}</span> · {e.restaurant}
                      <span className="block text-xs text-guava">
                        {e.lastStatus ? `HTTP ${e.lastStatus}: ` : ""}
                        {e.lastError ?? "unknown error"}
                      </span>
                      <span className="block text-xs text-plum-ink/40">
                        {manilaDateTime(e.createdAt)} · {e.attempts} attempt{e.attempts === 1 ? "" : "s"}
                      </span>
                    </span>
                    <form action={retryEvent}>
                      <input type="hidden" name="id" value={e.id} />
                      <button className="rounded-full border border-plum-ink/15 px-3 py-1 text-xs font-semibold">Retry</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-tile border border-plum-ink/10 bg-white p-5">
            <h2 className="font-heading font-bold">Where owners pay</h2>
            <p className="mb-3 mt-1 text-sm text-plum-ink/60">
              Shown on an agent-referred owner&apos;s billing page once they sign, right above the receipt form.
              Nothing is shown until at least one method is filled in.
            </p>
            <PaymentDetailsForm initial={paymentDetails} />
          </section>

          <section className="rounded-tile border border-plum-ink/10 bg-white p-5">
            <h2 className="font-heading font-bold">Referred restaurants ({data.accounts.length})</h2>
            {data.accounts.length > 0 && (
              <ul className="mt-2 divide-y divide-plum-ink/5 text-sm">
                {data.accounts.map((a) => (
                  <li key={a.restaurantId} className="flex items-start justify-between gap-3 py-2">
                    <span>
                      <span className="font-semibold">{a.restaurant}</span>
                      <span className="block text-xs text-plum-ink/50">
                        {a.ownerName} · {a.ownerPhone}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="font-mono">{a.agentCode}</span>
                      <span className="block text-xs text-plum-ink/50">
                        {a.contractStatus === "signed"
                          ? `Agreement signed${a.contractSignedAt ? ` ${manilaDate(a.contractSignedAt)}` : ""}`
                          : "Agreement not signed"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 border-t border-plum-ink/10 pt-5">
              <h3 className="mb-3 text-sm font-semibold">Attach an agent code to an existing restaurant</h3>
              <AttachAgentCodeForm />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

async function load() {
  return systemDb(async (tx) => {
    const grouped = await tx.productEventOutbox.groupBy({ by: ["status"], _count: { _all: true } });
    const counts = { pending: 0, sent: 0, failed: 0 } as Record<string, number>;
    for (const g of grouped) counts[g.status] = g._count._all;

    const failedRows = await tx.productEventOutbox.findMany({
      where: { status: "failed" },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, restaurantId: true, type: true, lastStatus: true, lastError: true, attempts: true, createdAt: true },
    });
    const accountRows = await tx.agentAccount.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        restaurantId: true, agentCode: true, ownerName: true, ownerPhone: true,
        contractStatus: true, contractSignedAt: true,
      },
    });
    const ids = [...new Set([...failedRows.map((f) => f.restaurantId), ...accountRows.map((a) => a.restaurantId)])];
    const names = new Map(
      (
        await tx.restaurant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      ).map((r) => [r.id, r.name]),
    );
    const nameOf = (id: string) => names.get(id) ?? `${id.slice(0, 8)}… (deleted)`;

    return {
      counts: { pending: counts.pending ?? 0, sent: counts.sent ?? 0, failed: counts.failed ?? 0 },
      failed: failedRows.map((f) => ({ ...f, restaurant: nameOf(f.restaurantId) })),
      accounts: accountRows.map((a) => ({ ...a, restaurant: nameOf(a.restaurantId) })),
    };
  });
}
