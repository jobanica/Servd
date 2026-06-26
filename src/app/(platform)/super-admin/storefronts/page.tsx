import Link from "next/link";
import { listDemoStorefronts } from "@/server/storefront-demo/queries";
import { CreateStorefrontForm } from "@/components/super-admin/CreateStorefrontForm";

export const metadata = { title: "Demo storefronts · Servd" };

export default async function StorefrontsPage() {
  const stores = await listDemoStorefronts();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://servdph.com";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Demo storefronts</h1>
        <p className="max-w-2xl text-sm text-plum-ink/50">
          Build a live online-ordering page for a prospect — <strong>no login account needed</strong>.
          Enter their details, add their menu, and share the link so they can see a commission-free
          ordering system they already have (and stop losing 30% to delivery apps).
        </p>
      </div>

      <CreateStorefrontForm />

      <div>
        <h2 className="mb-2 font-heading text-lg font-bold">Storefronts</h2>
        <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="text-plum-ink/50">
              <tr className="border-b border-plum-ink/10">
                <th className="px-3 py-2">Business</th>
                <th className="px-3 py-2">Menu</th>
                <th className="px-3 py-2">Storefront link</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {stores.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-plum-ink/50">
                    No demo storefronts yet. Create one above.
                  </td>
                </tr>
              ) : (
                stores.map((s) => (
                  <tr key={s.id} className="border-t border-plum-ink/5">
                    <td className="px-3 py-2">
                      <span className="font-medium">{s.name}</span>
                      <span className="block text-xs text-plum-ink/40">/{s.slug}</span>
                    </td>
                    <td className="px-3 py-2 text-plum-ink/60">
                      {s.itemCount} item{s.itemCount === 1 ? "" : "s"}
                    </td>
                    <td className="px-3 py-2">
                      <a
                        href={`${appUrl}/r/${s.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all text-xs font-semibold text-brand-primary"
                      >
                        {appUrl.replace(/^https?:\/\//, "")}/r/{s.slug} ↗
                      </a>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/super-admin/storefronts/${s.id}`}
                        className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold hover:bg-cream"
                      >
                        Manage & menu
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
