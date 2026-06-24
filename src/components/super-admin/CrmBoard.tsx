"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { logTouch, markReplied, setStage, deleteClient } from "@/server/crm/actions";
import type { CrmClientRow, CrmStage } from "@/server/crm/queries";
import { AddClientForm } from "./AddClientForm";
import {
  SEQUENCE,
  TOTAL_TOUCHES,
  FOLLOW_UPS,
  nextStep,
  renderMessage,
} from "@/lib/crm/sequence";

const STAGE_LABEL: Record<CrmStage, string> = {
  new: "To contact",
  in_sequence: "In sequence",
  replied: "Replied",
  won: "Won",
  lost: "Lost",
};
const STAGE_STYLE: Record<CrmStage, string> = {
  new: "bg-plum-ink/10 text-plum-ink/70",
  in_sequence: "bg-sky-500/15 text-sky-700",
  replied: "bg-amber-500/15 text-amber-700",
  won: "bg-mango/15 text-mango",
  lost: "bg-guava/15 text-guava",
};

const COLUMNS: CrmStage[] = ["new", "in_sequence", "replied", "won", "lost"];

function fromNow(iso: string | null): string {
  if (!iso) return "";
  const diff = new Date(iso).getTime() - Date.now();
  const days = Math.round(diff / 86400000);
  if (days === 0) return "today";
  if (days < 0) return `${-days}d overdue`;
  return `in ${days}d`;
}

/** A client whose next touch is due now (or never contacted). */
function isDue(c: CrmClientRow): boolean {
  if (c.stage === "new") return true;
  if (c.stage !== "in_sequence") return false;
  return !!c.nextDueAt && new Date(c.nextDueAt).getTime() <= Date.now();
}

export function CrmBoard({ clients }: { clients: CrmClientRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);
  const [filter, setFilter] = useState<CrmStage | "all">("all");
  const [view, setView] = useState<"list" | "board">("board");
  const [showAdd, setShowAdd] = useState(clients.length === 0);

  // Pointer-based drag (works with both mouse and touch).
  const dragMeta = useRef<{ id: string; from: CrmStage } | null>(null);
  const [dragging, setDragging] = useState<{ id: string; name: string } | null>(null);
  const [hoverStage, setHoverStage] = useState<CrmStage | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const metrics = useMemo(() => {
    const m = { total: clients.length, due: 0, scheduled: 0, replied: 0, won: 0, lost: 0, contacted: 0 };
    for (const c of clients) {
      if (c.step > 0 || c.stage !== "new") m.contacted++;
      if (c.stage === "replied") m.replied++;
      else if (c.stage === "won") m.won++;
      else if (c.stage === "lost") m.lost++;
      else if (isDue(c)) m.due++;
      else if (c.stage === "in_sequence") m.scheduled++;
    }
    return m;
  }, [clients]);

  const replyRate =
    metrics.contacted > 0 ? Math.round(((metrics.replied + metrics.won) / metrics.contacted) * 100) : 0;

  const dueList = useMemo(
    () =>
      clients
        .filter(isDue)
        .sort((a, b) => (a.nextDueAt ?? "0").localeCompare(b.nextDueAt ?? "0")),
    [clients],
  );

  const shown = filter === "all" ? clients : clients.filter((c) => c.stage === filter);

  function act(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  function stageUnder(x: number, y: number): CrmStage | null {
    const col = document.elementFromPoint(x, y)?.closest("[data-stage]");
    const s = col?.getAttribute("data-stage");
    return s && (COLUMNS as string[]).includes(s) ? (s as CrmStage) : null;
  }

  function startDrag(e: React.PointerEvent, c: CrmClientRow) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragMeta.current = { id: c.id, from: c.stage };
    setDragging({ id: c.id, name: c.name });
    setGhost({ x: e.clientX, y: e.clientY });
  }

  function moveDrag(e: React.PointerEvent) {
    if (!dragMeta.current) return;
    setGhost({ x: e.clientX, y: e.clientY });
    setHoverStage(stageUnder(e.clientX, e.clientY));
  }

  function endDrag(e: React.PointerEvent) {
    const meta = dragMeta.current;
    dragMeta.current = null;
    setDragging(null);
    setHoverStage(null);
    if (!meta) return;
    const target = stageUnder(e.clientX, e.clientY);
    if (target && target !== meta.from) act(() => setStage(meta.id, target));
  }

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  const metricCard = (label: string, value: number | string, tone = "text-plum-ink") => (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-3">
      <p className={`font-heading text-2xl font-bold ${tone}`}>{value}</p>
      <p className="text-xs text-plum-ink/50">{label}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {metricCard("Clients", metrics.total)}
        {metricCard("Need a message", metrics.due, metrics.due > 0 ? "text-brand-primary" : "text-plum-ink")}
        {metricCard("Scheduled", metrics.scheduled)}
        {metricCard("Replied", metrics.replied, "text-amber-700")}
        {metricCard("Won", metrics.won, "text-mango")}
        {metricCard("Reply rate", `${replyRate}%`)}
      </div>

      {/* Action needed — send today */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">
            Send today{" "}
            <span className="text-sm font-normal text-plum-ink/50">
              {dueList.length} client{dueList.length === 1 ? "" : "s"} due
            </span>
          </h2>
          <button
            onClick={() => setShowAdd((s) => !s)}
            className="rounded-full border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold hover:bg-cream"
          >
            {showAdd ? "Close" : "+ Add client"}
          </button>
        </div>

        {showAdd && (
          <div className="mb-4">
            <AddClientForm onAdded={() => router.refresh()} />
          </div>
        )}

        {dueList.length === 0 ? (
          <p className="rounded-tile border border-dashed border-plum-ink/15 bg-white p-5 text-sm text-plum-ink/50">
            Nothing due right now. Add clients, or come back when the next follow-ups are scheduled.
          </p>
        ) : (
          <div className="space-y-3">
            {dueList.map((c) => {
              const next = nextStep(c.step);
              if (!next) return null;
              const msg = renderMessage(next.message, c.name);
              return (
                <div key={c.id} className="rounded-tile border border-plum-ink/10 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold">{c.name}</span>
                      <span className="ml-2 rounded-full bg-plum-ink/5 px-2 py-0.5 text-[11px] font-semibold text-plum-ink/55">
                        {c.step === 0 ? "First message" : next.label} · touch {next.step}/{TOTAL_TOUCHES}
                      </span>
                      {c.nextDueAt && c.step > 0 && (
                        <span className="ml-2 text-xs text-guava">{fromNow(c.nextDueAt)}</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {c.facebookUrl && (
                        <a
                          href={c.facebookUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg bg-[#1877f2] px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          Open Messenger ↗
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg bg-cream/60 p-3 text-sm text-plum-ink/80">{msg}</div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => copy(msg, c.id)}
                      className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold hover:bg-cream"
                    >
                      {copied === c.id ? "Copied ✓" : "Copy message"}
                    </button>
                    <button
                      disabled={pending}
                      onClick={() => act(() => logTouch(c.id))}
                      className="rounded-lg bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {c.step === 0 ? "Mark sent → start sequence" : "Mark follow-up sent"}
                    </button>
                    <button
                      disabled={pending}
                      onClick={() => act(() => markReplied(c.id))}
                      className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-700 disabled:opacity-60"
                    >
                      They replied ✋
                    </button>
                    <button
                      disabled={pending}
                      onClick={() => act(() => setStage(c.id, "lost"))}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-plum-ink/50 hover:bg-plum-ink/5 disabled:opacity-60"
                    >
                      Not interested
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Full pipeline */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-lg font-bold">Pipeline</h2>
          <div className="inline-flex rounded-full border border-plum-ink/15 p-0.5">
            {(["board", "list"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                  view === v ? "bg-brand-gradient text-white" : "text-plum-ink/55"
                }`}
              >
                {v === "board" ? "Board" : "List"}
              </button>
            ))}
          </div>
        </div>

        {view === "board" ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {COLUMNS.map((stage) => {
              const items = clients.filter((c) => c.stage === stage);
              const hovered = hoverStage === stage && !!dragging;
              return (
                <div
                  key={stage}
                  data-stage={stage}
                  className={`rounded-tile border bg-cream/40 p-2 transition ${
                    hovered ? "border-brand-primary ring-2 ring-brand-primary/30" : "border-plum-ink/10"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STAGE_STYLE[stage]}`}>
                      {STAGE_LABEL[stage]}
                    </span>
                    <span className="text-xs text-plum-ink/40">{items.length}</span>
                  </div>
                  <div className="min-h-[64px] space-y-2">
                    {items.map((c) => (
                      <div
                        key={c.id}
                        className={`rounded-lg border border-plum-ink/10 bg-white p-2 shadow-sm ${
                          dragging?.id === c.id ? "opacity-40" : ""
                        }`}
                      >
                        <div className="flex items-start gap-1.5">
                          <span
                            onPointerDown={(e) => startDrag(e, c)}
                            onPointerMove={moveDrag}
                            onPointerUp={endDrag}
                            role="button"
                            aria-label="Drag to move"
                            className="mt-0.5 shrink-0 cursor-grab touch-none select-none text-plum-ink/30 active:cursor-grabbing"
                          >
                            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                              <circle cx="9" cy="6" r="1.6" />
                              <circle cx="15" cy="6" r="1.6" />
                              <circle cx="9" cy="12" r="1.6" />
                              <circle cx="15" cy="12" r="1.6" />
                              <circle cx="9" cy="18" r="1.6" />
                              <circle cx="15" cy="18" r="1.6" />
                            </svg>
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold leading-tight">{c.name}</p>
                            <div className="mt-1 flex items-center justify-between text-[11px] text-plum-ink/50">
                              <span>
                                {c.step}/{TOTAL_TOUCHES} touches
                              </span>
                              {c.stage === "in_sequence" && c.nextDueAt && (
                                <span className={isDue(c) ? "font-semibold text-guava" : ""}>{fromNow(c.nextDueAt)}</span>
                              )}
                            </div>
                            {c.facebookUrl && (
                              <a
                                href={c.facebookUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 block text-[11px] font-semibold text-[#1877f2]"
                              >
                                facebook ↗
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {items.length === 0 && (
                      <p className="px-1 py-4 text-center text-[11px] text-plum-ink/30">Drop here</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {(["all", "new", "in_sequence", "replied", "won", "lost"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    filter === s ? "bg-brand-gradient text-white" : "bg-plum-ink/5 text-plum-ink/60"
                  }`}
                >
                  {s === "all" ? "All" : STAGE_LABEL[s]}
                  {s !== "all" && (
                    <span className="ml-1 opacity-70">{clients.filter((c) => c.stage === s).length}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="overflow-x-auto rounded-tile border border-plum-ink/10 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="text-plum-ink/50">
              <tr className="border-b border-plum-ink/10">
                <th className="px-3 py-2">Client</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">Progress</th>
                <th className="px-3 py-2">Next</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-plum-ink/50">No clients here.</td>
                </tr>
              ) : (
                shown.map((c) => (
                  <tr key={c.id} className="border-t border-plum-ink/5 align-top">
                    <td className="px-3 py-2">
                      <span className="font-medium">{c.name}</span>
                      {c.contactName && <span className="block text-xs text-plum-ink/45">{c.contactName}</span>}
                      {c.address && <span className="block text-xs text-plum-ink/40">📍 {c.address}</span>}
                      {(c.phone || c.email) && (
                        <span className="block text-xs text-plum-ink/40">{[c.phone, c.email].filter(Boolean).join(" · ")}</span>
                      )}
                      {c.facebookUrl && (
                        <a href={c.facebookUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[#1877f2]">
                          facebook ↗
                        </a>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STAGE_STYLE[c.stage]}`}>
                        {STAGE_LABEL[c.stage]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-plum-ink/70">
                      {c.step}/{TOTAL_TOUCHES} touches
                    </td>
                    <td className="px-3 py-2 text-plum-ink/60">
                      {c.stage === "in_sequence" && c.nextDueAt ? (
                        <span className={isDue(c) ? "text-guava font-semibold" : ""}>{fromNow(c.nextDueAt)}</span>
                      ) : c.stage === "new" ? (
                        "not contacted"
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1.5">
                        {(c.stage === "replied" || c.stage === "won") && (
                          <button
                            disabled={pending}
                            onClick={() => act(() => setStage(c.id, "won"))}
                            className="rounded-lg bg-mango/15 px-2.5 py-1.5 text-xs font-semibold text-mango disabled:opacity-60"
                          >
                            Won
                          </button>
                        )}
                        {(c.stage === "lost" || c.stage === "replied") && (
                          <button
                            disabled={pending}
                            onClick={() => act(() => setStage(c.id, "in_sequence"))}
                            className="rounded-lg border border-plum-ink/15 px-2.5 py-1.5 text-xs font-semibold hover:bg-cream disabled:opacity-60"
                          >
                            Reopen
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm(`Remove ${c.name} from the CRM?`)) act(() => deleteClient(c.id));
                          }}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-guava hover:bg-guava/10"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
            </div>
          </>
        )}
      </section>

      <p className="text-xs text-plum-ink/40">
        Sequence: 1 initial message + {FOLLOW_UPS} follow-ups over ~4 weeks. Clients stay in the
        queue until you mark them replied. Drag the grip (⋮⋮) to move a card between columns — works
        on phone too. Facebook doesn&apos;t allow auto-detecting replies, so tap “They replied” when
        they message back.
      </p>

      {/* Floating label that follows the pointer/finger while dragging. */}
      {dragging && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-brand-primary bg-white px-3 py-1.5 text-xs font-semibold shadow-xl"
          style={{ left: ghost.x, top: ghost.y }}
        >
          {dragging.name}
        </div>
      )}
    </div>
  );
}
