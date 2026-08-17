/** Serializable order shape shared between the server and the live boards. */
export interface KitchenOrderItem {
  id: string;
  name: string;
  quantity: number;
  note: string | null;
  modifiers: string[];
}

export interface KitchenOrder {
  id: string;
  tableNumber: string;
  /** "🥡 Takeout" etc — from lib/orders/order-type, shown under the title. */
  typeLabel?: string;
  /** "closed" only appears in the kitchen history, never in the live queue. */
  status: "new" | "preparing" | "done" | "closed";
  createdAt: string; // ISO string (serializable across the server boundary)
  total: number; // centavos
  /**
   * Where a delivery is going — present only when the restaurant has asked for
   * it (Printer settings → kitchen). A kitchen working by zone groups every
   * order heading the same way into one run instead of cooking them one ticket
   * at a time; a kitchen that doesn't work that way shouldn't have customers'
   * home addresses on a screen the whole line can read.
   */
  customerAddress?: string | null;
  /**
   * When an advance order is wanted for, ISO. Present for as long as the ticket
   * is on the board — accepting it told the kitchen about the order, it didn't
   * make it due, and a card that drops the date is a card that says "cook now".
   */
  scheduledFor?: string | null;
  items: KitchenOrderItem[];
}
