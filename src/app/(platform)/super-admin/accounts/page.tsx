import { listBusinesses } from "@/server/billing/super-admin";
import { CreateAccountForm } from "@/components/super-admin/CreateAccountForm";
import { CopyLinkButton } from "@/components/super-admin/CopyLinkButton";

function mapUrl(lat: number | null, lng: number | null, address: string | null): string | null {
  if (lat != null && lng != null) return `https://www.google.com/maps?q=${lat},${lng}`;
  if (address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  return null;
}

export default async function SuperAdminAccountsPage() {
  const businesses = await listBusinesses();
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Create business</h1>
        <p className="text-sm text-plum-ink/50">
          Create a business with just its name + location. The owner adds their own email &amp;
          password via the setup link — no credentials needed here.
        </p>
      </div>

      <CreateAccountForm />

      <div>
        <h2 className="mb-2 font-heading text-lg font-bold">Businesses</h2>
        <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="text-plum-ink/50">
              <tr className="border-b border-plum-ink/10">
                <th className="px-4 py-2">Business</th>
                <th className="px-4 py-2">Location</th>
                <th className="px-4 py-2">Owner / setup</th>
                <th className="px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {businesses.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-plum-ink/50">No businesses yet.</td>
                </tr>
              ) : (
                businesses.map((b) => {
                  const map = mapUrl(b.latitude, b.longitude, b.businessAddress);
                  return (
                    <tr key={b.id} className="border-t border-plum-ink/5 align-top">
                      <td className="px-4 py-2 font-medium">
                        {b.name}
                        <span className="block text-xs text-plum-ink/40">/{b.slug} · {b.status}</span>
                      </td>
                      <td className="px-4 py-2 text-plum-ink/60">
                        {b.businessAddress ?? <span className="text-plum-ink/30">—</span>}
                        {map && (
                          <a href={map} target="_blank" rel="noopener noreferrer" className="ml-2 text-xs font-semibold text-brand-primary">
                            Visit on map ↗
                          </a>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {b.claimedAt ? (
                          <span className="rounded-full bg-mango/15 px-2 py-0.5 text-xs font-semibold text-mango">Claimed ✓</span>
                        ) : b.claimToken ? (
                          <CopyLinkButton url={`${base.replace(/\/$/, "")}/claim/${b.claimToken}`} />
                        ) : (
                          <span className="text-xs text-plum-ink/40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-plum-ink/50">{new Date(b.createdAt).toLocaleDateString()}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
