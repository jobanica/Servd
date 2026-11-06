import Link from "next/link";

/** Tabs and the ?ok= / ?error= banner the neighborhood actions send back. */
export function NbChrome({
  active,
  title,
  intro,
  flash,
}: {
  active: "network" | "partners" | "ledger" | "statements";
  title: string;
  intro?: string;
  flash?: { ok?: string; error?: string };
}) {
  const tabs = [
    ["network", "Network & territories", "/super-admin/neighborhood"],
    ["partners", "Partners & activation", "/super-admin/neighborhood/partners"],
    ["ledger", "Commission ledger", "/super-admin/neighborhood/ledger"],
    ["statements", "Statements & payments", "/super-admin/neighborhood/statements"],
  ] as const;
  return (
    <div className="space-y-3">
      <div>
        <h1 className="font-heading text-2xl font-bold">{title}</h1>
        {intro && <p className="text-sm text-plum-ink/55">{intro}</p>}
      </div>
      <nav className="flex flex-wrap gap-1.5">
        {tabs.map(([key, label, href]) => (
          <Link
            key={key}
            href={href}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              active === key ? "bg-plum-ink text-cream" : "bg-plum-ink/5 text-plum-ink/70 hover:text-plum-ink"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {flash?.ok && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">✓ {flash.ok}</p>}
      {flash?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{flash.error}</p>}
    </div>
  );
}

export const input = "rounded-lg border border-plum-ink/15 px-2.5 py-1.5 text-sm";
export const label = "block text-[11px] font-semibold uppercase tracking-wide text-plum-ink/50";
export const btn = "rounded-lg bg-plum-ink px-3 py-1.5 text-xs font-semibold text-cream";
export const btnGhost = "rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold";
export const card = "rounded-tile border border-plum-ink/10 bg-white p-4";

export function Dot({ on, label: text }: { on: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${on ? "text-green-700" : "text-plum-ink/40"}`}>
      <span aria-hidden>{on ? "●" : "○"}</span>
      {text}
    </span>
  );
}
