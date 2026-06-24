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
      "Hi [Name]! Nakita ko si [Business Name] sa delivery apps. 👀\n\n" +
      "Grabe po kasi ang commissions ngayon —30% per order na nawawala sa profit niyo.\n\n" +
      "Sa 100,000 revenue, 30,000 sa app, mas malaki pa kita ng Food Panda kesa sa Restaurant nyo.\n\n" +
      "Pwede po namin kayo gawan ng ONLINE ORDERING SYSTEM, pag order ng customer, automatic papasok sa POS nyo tapos 0% commission pa\n\n" +
      "Libre lang po, wala kayong babayaran.\n\n" +
      "May personalized demo na po ako para sa [Business Name] — okay lang po bang i-share?",
  },
  {
    step: 2,
    key: "fu1",
    label: "Follow-up 1 — gentle bump",
    waitDays: 2,
    message:
      "Hi [Name], pa-follow up lang po sa message ko 🙂\n\n" +
      "Yung sariling online ordering system po para sa [Business Name] — diretso pasok sa POS nyo, walang 30% commission na kinakaltas. " +
      "Gusto nyo po bang makita muna yung quick demo?",
  },
  {
    step: 3,
    key: "fu2",
    label: "Follow-up 2 — new angle",
    waitDays: 3,
    message:
      "Hi po! Alam ko po busy kayo sa [Business Name]. 🙏\n\n" +
      "Marami na pong restaurant dito ang lumipat sa sariling ordering page para hindi na kainin ng app ang kita nila. " +
      "Padalhan ko po kayo ng 1-minute video para makita nyo kahit anong oras — okay lang po?",
  },
  {
    step: 4,
    key: "fu3",
    label: "Follow-up 3 — remove the risk",
    waitDays: 5,
    message:
      "Hi [Name], libre lang po talaga — wala kayong babayaran at walang commission per order.\n\n" +
      "Gusto nyo po bang i-set up ko muna para sa [Business Name] para masubukan nyo nang walang risk?",
  },
  {
    step: 5,
    key: "fu4",
    label: "Follow-up 4 — soft check-in",
    waitDays: 7,
    message:
      "Hi po, ayaw ko po kayong istorbohin 🙏 — tama lang po bang i-check ko ulit kayo mamaya, " +
      "o hindi pa po tamang panahon para sa [Business Name]?",
  },
  {
    step: 6,
    key: "breakup",
    label: "Break-up — close the loop",
    waitDays: 10,
    message:
      "Hi [Name], dito ko na po isasara para hindi na po dumami sa inbox nyo. 🙂\n\n" +
      "Kung balang araw gusto nyo na pong magkaroon ng sariling online ordering (walang commission) para sa [Business Name], " +
      "message nyo lang po ako anytime. Sana po laging puno ang [Business Name]! 🍽️",
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

/**
 * Fill a step's message: [Business Name] → the business, [Name] → the contact
 * person (falls back to a polite "po" when no contact name is on file).
 */
export function renderMessage(message: string, business: string, contact?: string | null): string {
  const greet = (contact && contact.trim()) || "po";
  return message
    .replace(/\[Business Name\]/g, business || "your restaurant")
    .replace(/\[Name\]/g, greet);
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
