import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { PrintSettingsForm } from "@/components/admin/PrintSettingsForm";

export default async function PrintingSettingsPage() {
  const { restaurantId } = await requireAdminPage();

  const restaurant = await tenantDb(restaurantId, (tx) =>
    tx.restaurant.findFirstOrThrow({
      select: { id: true, printMethod: true, autoPrint: true, printerConfig: true },
    }),
  );

  const cfg = (restaurant.printerConfig as
    | { bridgeUrl?: string; pollToken?: string }
    | null) ?? {};
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const cloudPollUrl = cfg.pollToken
    ? `${base}/api/print/cloud/${restaurant.id}?token=${cfg.pollToken}`
    : null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">
          ← Dashboard
        </Link>
        <h1 className="font-heading text-2xl font-bold">Printer settings</h1>
        <p className="text-sm text-plum-ink/50">
          Choose how kitchen tickets print. The method is pluggable per
          restaurant.
        </p>
      </div>

      <PrintSettingsForm
        initial={{
          printMethod: restaurant.printMethod,
          autoPrint: restaurant.autoPrint,
          bridgeUrl: cfg.bridgeUrl ?? "",
        }}
        cloudPollUrl={cloudPollUrl}
      />
    </div>
  );
}
