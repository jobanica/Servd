/**
 * Cold-outreach follow-up sequence for the client CRM. Pure data — safe to
 * import on the client and server. The cadence is 1 initial message + 5
 * follow-ups over ~4 weeks; a client stays in the sequence until they reply.
 *
 * `waitDays` = days to wait AFTER the previous touch before this one is due.
 * Messages use {name} as a placeholder for the business name.
 */

export interface SequenceStep {
  step: number; // 1-based touch number
  key: string;
  label: string;
  waitDays: number;
  message: string;
  breakup?: boolean;
}

export const SEQUENCE: SequenceStep[] = [
  {
    step: 1,
    key: "initial",
    label: "Initial message",
    waitDays: 0,
    message:
      "Hi {name}! 👋 I help restaurants here take orders straight from a QR code and run the kitchen, cashier and receipts from one app (Servd) — no app for diners to download. Mind if I send you a quick 1-minute demo?",
  },
  {
    step: 2,
    key: "fu1",
    label: "Follow-up 1 — gentle bump",
    waitDays: 2,
    message:
      "Hi {name}, just floating my message back up 🙂 Would a quick look at how Servd speeds up your orders be useful? Happy to keep it short.",
  },
  {
    step: 3,
    key: "fu2",
    label: "Follow-up 2 — new angle",
    waitDays: 3,
    message:
      "Hey {name}! Totally understand you're busy. A lot of restaurants nearby are moving to QR ordering — want me to send a short video so you can watch whenever it's convenient?",
  },
  {
    step: 4,
    key: "fu3",
    label: "Follow-up 3 — remove the risk",
    waitDays: 5,
    message:
      "Hi {name}, I can set you up with a free account so you can try it on a few tables with zero cost and zero commitment. Want me to get it ready for you?",
  },
  {
    step: 5,
    key: "fu4",
    label: "Follow-up 4 — soft check-in",
    waitDays: 7,
    message:
      "Hi {name}, I don't want to keep bugging you 🙏 — should I check back later, or is now just not the right time for digitizing your ordering?",
  },
  {
    step: 6,
    key: "breakup",
    label: "Break-up — close the loop",
    waitDays: 10,
    message:
      "Hi {name}, I'll close the loop here so I'm not cluttering your inbox. If you ever want to take orders by QR and tidy up your operations, just message me anytime — wishing you full tables! 🍽️",
    breakup: true,
  },
];

/** Total touches in the sequence (initial + follow-ups). */
export const TOTAL_TOUCHES = SEQUENCE.length;

/** Number of follow-ups after the initial message. */
export const FOLLOW_UPS = SEQUENCE.length - 1;

/** The next touch to send given how many have already been sent (`step`). */
export function nextStep(step: number): SequenceStep | null {
  return step < SEQUENCE.length ? SEQUENCE[step] : null;
}

/** Fill {name} into a step's message. */
export function renderMessage(message: string, name: string): string {
  return message.replace(/\{name\}/g, name || "there");
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
