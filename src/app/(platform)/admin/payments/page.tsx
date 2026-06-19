import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { requireFeaturePage } from "@/server/billing/feature-gate";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { PaymentSettingsForm } from "@/components/admin/PaymentSettingsForm";

export default async function PaymentsSettingsPage() {
  const { restaurantId } = await requireAdminPage();
  await requireFeaturePage(restaurantId, "onlinePayments");

  const restaurant = await tenantDb(restaurantId, (tx) =>
    tx.restaurant.findFirstOrThrow({
      select: {
        id: true,
        paymentOnlineEnabled: true,
        paymentCredentialsEnc: true,
        paymentGateway: true,
      },
    }),
  );

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const webhookBase = `${base}/api/webhooks`;
  const gateway = restaurant.paymentGateway === "xendit" ? "xendit" : "paymongo";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">
          ← Dashboard
        </Link>
        <h1 className="font-heading text-2xl font-bold">Online payment</h1>
        <p className="text-sm text-plum-ink/50">
          Connected-accounts model: your own PayMongo or Xendit account receives the money.
        </p>
      </div>

      <PaymentSettingsForm
        initial={{
          enabled: restaurant.paymentOnlineEnabled,
          configured: !!restaurant.paymentCredentialsEnc,
          gateway,
        }}
        webhookBase={webhookBase}
        restaurantId={restaurant.id}
      />
    </div>
  );
}
