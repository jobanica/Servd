import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { getLoyaltyConfig } from "@/server/loyalty/loyalty";
import { LoyaltyForm } from "@/components/admin/LoyaltyForm";

export default async function LoyaltyPage() {
  const { restaurantId } = await requireAdminPage();
  const cfg = await getLoyaltyConfig(restaurantId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">
          ← Dashboard
        </Link>
        <h1 className="font-heading text-2xl font-bold">Loyalty &amp; rewards</h1>
        <p className="text-sm text-plum-ink/50">
          Customers earn points on every paid order (by phone number in the app) and redeem them
          as a discount — the cashier confirms redemption at checkout.
        </p>
      </div>

      <LoyaltyForm
        initial={{
          enabled: cfg.enabled,
          pesosPerPoint: cfg.pesosPerPoint,
          pointValuePesos: cfg.pointValue / 100,
        }}
      />
    </div>
  );
}
