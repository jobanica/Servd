import "server-only";
import { timingSafeEqual } from "node:crypto";
import type {
  CheckoutResult,
  CreateCheckoutParams,
  PaymentGateway,
  PaymentMethodType,
  WebhookEvent,
} from "./gateway";

/**
 * Xendit implementation of PaymentGateway (GCash, cards, e-wallets — Philippines).
 * Constructed with ONE restaurant's credentials (connected-accounts model).
 *
 * Uses Xendit Invoices (hosted checkout). Webhooks are authenticated with the
 * restaurant's callback verification token in the `x-callback-token` header —
 * Xendit doesn't HMAC-sign, so we compare the token in constant time.
 *
 * Docs: https://developers.xendit.co/api-reference/#create-invoice
 */
const API = "https://api.xendit.co";

// Map our generic method types to Xendit's payment_methods codes.
const METHOD_MAP: Record<PaymentMethodType, string> = {
  gcash: "GCASH",
  card: "CREDIT_CARD",
};

export class XenditGateway implements PaymentGateway {
  constructor(
    private readonly secretKey: string,
    private readonly webhookToken: string,
  ) {}

  private authHeader(): string {
    // Xendit uses HTTP Basic with the secret key as username, blank password.
    return "Basic " + Buffer.from(`${this.secretKey}:`).toString("base64");
  }

  async createCheckout(p: CreateCheckoutParams): Promise<CheckoutResult> {
    const totalCentavos = p.lineItems.reduce((s, li) => s + li.amount * li.quantity, 0);
    const body = {
      external_id: p.referenceNumber,
      amount: Number((totalCentavos / 100).toFixed(2)), // Xendit PHP amounts are in pesos
      currency: "PHP",
      success_redirect_url: p.successUrl,
      payment_methods: p.methods.map((m) => METHOD_MAP[m]).filter(Boolean),
      items: p.lineItems.map((li) => ({
        name: li.name,
        quantity: li.quantity,
        price: Number((li.amount / 100).toFixed(2)),
      })),
    };

    const res = await fetch(`${API}/v2/invoices`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Xendit checkout failed (${res.status}): ${text}`);
    }
    const json = (await res.json()) as { id: string; invoice_url: string };
    return { gatewayRef: json.id, checkoutUrl: json.invoice_url };
  }

  verifyAndParseWebhook(rawBody: string, callbackToken: string): WebhookEvent | null {
    // Authenticate via the x-callback-token header (constant-time compare).
    if (!callbackToken || !this.webhookToken) return null;
    const a = Buffer.from(callbackToken);
    const b = Buffer.from(this.webhookToken);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    let event: { id?: string; status?: string };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (!event.id) return null;

    const s = (event.status ?? "").toUpperCase();
    let status: WebhookEvent["status"];
    if (s === "PAID" || s === "SETTLED") status = "paid";
    else if (s === "EXPIRED" || s === "FAILED") status = "failed";
    else status = "pending";

    return { gatewayRef: event.id, status, raw: event };
  }
}
