/**
 * PAYMENT GATEWAY ABSTRACTION
 *
 * Business logic talks to this interface, never to PayMongo directly — so we can
 * swap to Xendit/HitPay later without touching the order/payment flow. The
 * connected-accounts model means each restaurant supplies its own credentials,
 * so a gateway instance is constructed per restaurant.
 */

export type PaymentMethodType = "gcash" | "card";

export interface CheckoutLineItem {
  name: string;
  amount: number; // centavos
  quantity: number;
}

export interface CreateCheckoutParams {
  lineItems: CheckoutLineItem[];
  referenceNumber: string; // our own ref (e.g. table token slice)
  successUrl: string;
  methods: PaymentMethodType[];
}

export interface CheckoutResult {
  gatewayRef: string; // gateway's checkout/session id
  checkoutUrl: string; // where we redirect the diner
}

/** Normalized webhook outcome the app acts on. */
export interface WebhookEvent {
  gatewayRef: string; // the checkout/session id this event concerns
  status: "paid" | "failed" | "pending";
  raw?: unknown;
}

export interface PaymentGateway {
  /** Create a hosted checkout and return where to send the diner. */
  createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult>;

  /**
   * Verify a webhook's signature and parse it. Returns null if the signature is
   * invalid or the event isn't one we care about. NEVER trust the client — this
   * signature-verified path is the ONLY thing allowed to mark a payment paid.
   */
  verifyAndParseWebhook(rawBody: string, signatureHeader: string): WebhookEvent | null;
}
