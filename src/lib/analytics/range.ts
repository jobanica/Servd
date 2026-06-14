export type RangeKey = "7" | "30" | "90";

export const RANGES: { key: RangeKey; label: string }[] = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "90 days" },
];

/** Normalizes an untrusted query value to a supported range. */
export function parseRange(value: string | undefined): RangeKey {
  return value === "7" || value === "90" ? value : "30";
}

/** Returns the [from, to] window for a range (to = now). */
export function rangeToDates(range: RangeKey, now: Date = new Date()): {
  from: Date;
  to: Date;
} {
  const days = Number(range);
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  return { from, to: now };
}
