-- One-time add-on purchases (the ₱500 custom-domain unlock for Free/trial
-- accounts). Kept separate from restaurant_invoices so paying one never
-- activates a subscription. Idempotent.
CREATE TABLE IF NOT EXISTS addon_purchases (
  id            text PRIMARY KEY,
  "restaurantId" text NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  addon         text NOT NULL,
  amount        integer NOT NULL,
  status        text NOT NULL DEFAULT 'pending',
  "providerRef" text UNIQUE,
  "paidAt"      timestamp(3),
  "createdAt"   timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS addon_purchases_restaurant_addon_idx
  ON addon_purchases ("restaurantId", addon);
