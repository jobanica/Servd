import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { PayMongoGateway } from "@/server/payments/paymongo";

const WEBHOOK_SECRET = "whsk_test_secret";

function signedHeader(body: string, secret = WEBHOOK_SECRET) {
  const t = "1700000000";
  const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},te=${sig}`;
}

describe("PayMongo webhook verification", () => {
  const gw = new PayMongoGateway("sk_test", WEBHOOK_SECRET);

  const body = JSON.stringify({
    data: {
      attributes: {
        type: "checkout_session.payment.paid",
        data: { id: "cs_abc123" },
      },
    },
  });

  it("accepts a correctly signed paid event", () => {
    const event = gw.verifyAndParseWebhook(body, signedHeader(body));
    expect(event).not.toBeNull();
    expect(event?.status).toBe("paid");
    expect(event?.gatewayRef).toBe("cs_abc123");
  });

  it("rejects a tampered body (signature mismatch)", () => {
    const header = signedHeader(body);
    const tampered = body.replace("cs_abc123", "cs_hacked");
    expect(gw.verifyAndParseWebhook(tampered, header)).toBeNull();
  });

  it("rejects a wrong signing secret", () => {
    const header = signedHeader(body, "whsk_wrong");
    expect(gw.verifyAndParseWebhook(body, header)).toBeNull();
  });
});
