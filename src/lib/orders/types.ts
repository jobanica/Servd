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
  status: "new" | "preparing" | "done";
  createdAt: string; // ISO string (serializable across the server boundary)
  total: number; // centavos
  items: KitchenOrderItem[];
}
