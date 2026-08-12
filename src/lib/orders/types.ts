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
  items: KitchenOrderItem[];
}
