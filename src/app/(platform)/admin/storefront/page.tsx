import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { getStorefront } from "@/server/storefront/storefront";
import { StorefrontForm } from "@/components/admin/StorefrontForm";

export default async function StorefrontPage() {
  const { restaurantId } = await requireAdminPage();
  const sf = await getStorefront(restaurantId);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
        <h1 className="font-heading text-2xl font-bold">Online website</h1>
        <p className="text-sm text-plum-ink/50">Store hours and delivery zones shown on your public ordering site.</p>
      </div>
      <StorefrontForm
        initial={{
          hours: sf.hours,
          zones: sf.zones.map((z) => ({ name: z.name, feePesos: z.fee / 100 })),
          pauseWhenClosed: sf.pauseWhenClosed,
        }}
      />
    </div>
  );
}
