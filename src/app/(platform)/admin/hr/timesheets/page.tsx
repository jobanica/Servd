import Link from "next/link";
import { requireHrPage } from "@/server/hr/guard";
import { listTimeEntries } from "@/server/hr/queries";
import { approveTimeEntry } from "@/server/hr/actions";
import { computeHours } from "@/lib/hr/hours";
import { manilaDateTime, manilaTime } from "@/lib/time/manila";

export default async function TimesheetsPage() {
  const { restaurantId, eligible } = await requireHrPage();
  if (!eligible) return <p className="text-sm text-plum-ink/60">HRIS not enabled.</p>;

  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 14);
  const entries = await listTimeEntries(restaurantId, from, to);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/hr" className="text-sm text-plum-ink/50">← HR</Link>
        <h1 className="font-heading text-2xl font-bold">Timesheets (last 14 days)</h1>
      </div>

      <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="text-plum-ink/50">
            <tr><th className="p-3">Employee</th><th>In</th><th>Out</th><th>Break</th><th>Hours</th><th>OT</th><th></th></tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const h = computeHours(e.clockIn, e.clockOut, e.breakMinutes);
              return (
                <tr key={e.id} className="border-t border-plum-ink/10">
                  <td className="p-3">{e.employee.fullName}</td>
                  <td>
                    {manilaDateTime(e.clockIn)}
                    {e.clockInPhotoUrl && (
                      <a href={`/api/hr/clock-photo?path=${encodeURIComponent(e.clockInPhotoUrl)}`} target="_blank" rel="noopener" className="ml-1 text-brand-primary" title="Clock-in photo">📷</a>
                    )}
                  </td>
                  <td>
                    {e.clockOut ? manilaTime(e.clockOut) : <span className="text-mango">open</span>}
                    {e.clockOutPhotoUrl && (
                      <a href={`/api/hr/clock-photo?path=${encodeURIComponent(e.clockOutPhotoUrl)}`} target="_blank" rel="noopener" className="ml-1 text-brand-primary" title="Clock-out photo">📷</a>
                    )}
                  </td>
                  <td>{e.breakMinutes}m</td>
                  <td>{h.hours}</td>
                  <td>{h.overtime > 0 ? <span className="text-guava">{h.overtime}</span> : "—"}</td>
                  <td>
                    {e.clockOut && !e.approved ? (
                      <form action={approveTimeEntry}><input type="hidden" name="id" value={e.id} /><button className="text-xs font-semibold text-brand-primary">approve</button></form>
                    ) : e.approved ? <span className="text-xs text-mango">✓</span> : null}
                  </td>
                </tr>
              );
            })}
            {entries.length === 0 && <tr><td colSpan={7} className="p-3 text-plum-ink/40">No time entries.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
