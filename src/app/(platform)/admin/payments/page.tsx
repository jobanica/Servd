import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { PaymentSettingsForm } from "@/components/admin/PaymentSettingsForm";

export default async function PaymentsSettingsPage() {
  const { restaurantId } = await requireAdminPage();

  const restaurant = await tenantDb(restaurantId, (tx) =>
    tx.restaurant.findFirstOrThrow({
      select: { id: true, paymentOnlineEnabled: true, paymentCredentialsEnc: true },
    }),
  );

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const webhookUrl = `${base}/api/webhooks/paymongo/${restaurant.id}`;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">
          ← Dashboard
        </Link>
        <h1 className="font-heading text-2xl font-bold">Online payment</h1>
        <p className="text-sm text-plum-ink/50">
          Connected-accounts model: your own PayMongo account receives the money.
        </p>
      </div>

      <PaymentSettingsForm
        initial={{
          enabled: restaurant.paymentOnlineEnabled,
          configured: !!restaurant.paymentCredentialsEnc,
        }}
        webhookUrl={webhookUrl}
      />
    </div>
  );
}
