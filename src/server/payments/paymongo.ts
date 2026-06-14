import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  CheckoutResult,
  CreateCheckoutParams,
  PaymentGateway,
  WebhookEvent,
} from "./gateway";

/**
 * PayMongo implementation of PaymentGateway (GCash + cards, Philippines).
 * Constructed with ONE restaurant's credentials (connected-accounts model).
 *
 * Docs: https://developers.paymongo.com
 */
const API = "https://api.paymongo.com/v1";

export class PayMongoGateway implements PaymentGateway {
  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
  ) {}

  private authHeader(): string {
    // PayMongo uses HTTP Basic with the secret key as the username, blank pwd.
    return "Basic " + Buffer.from(`${this.secretKey}:`).toString("base64");
  }

  async createCheckout(p: CreateCheckoutParams): Promise<CheckoutResult> {
    const body = {
      data: {
        attributes: {
          line_items: p.lineItems.map((li) => ({
            name: li.name,
            amount: li.amount,
            quantity: li.quantity,
            currency: "PHP",
          })),
          payment_method_types: p.methods,
          reference_number: p.referenceNumber,
          success_url: p.successUrl,
          send_email_receipt: false,
          show_line_items: true,
        },
      },
    };

    const res = await fetch(`${API}/checkout_sessions`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`PayMongo checkout failed (${res.status}): ${text}`);
    }
    const json = (await res.json()) as {
      data: { id: string; attributes: { checkout_url: string } };
    };
    return {
      gatewayRef: json.data.id,
      checkoutUrl: json.data.attributes.checkout_url,
    };
  }

  verifyAndParseWebhook(rawBody: string, signatureHeader: string): WebhookEvent | null {
    // Header format: "t=<timestamp>,te=<test sig>,li=<live sig>"
    const parts = Object.fromEntries(
      signatureHeader.split(",").map((kv) => {
        const [k, v] = kv.split("=");
        return [k?.trim(), v?.trim()];
      }),
    ) as { t?: string; te?: string; li?: string };

    if (!parts.t || (!parts.te && !parts.li)) return null;

    const expected = createHmac("sha256", this.webhookSecret)
      .update(`${parts.t}.${rawBody}`)
      .digest("hex");
    const provided = parts.li || parts.te || "";

    // Constant-time comparison to avoid timing attacks.
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    let event: {
      data?: { attributes?: { type?: string; data?: { id?: string } } };
    };
    try {
      event = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const type = event.data?.attributes?.type ?? "";
    const resourceId = event.data?.attributes?.data?.id ?? "";
    if (!resourceId) return null;

    let status: WebhookEvent["status"];
    if (type.endsWith("payment.paid") || type === "checkout_session.payment.paid") {
      status = "paid";
    } else if (type.endsWith("payment.failed")) {
      status = "failed";
    } else {
      status = "pending";
    }

    return { gatewayRef: resourceId, status, raw: event };
  }
}
