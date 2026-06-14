/**
 * Shared diner-side types. These are the SERIALIZABLE shapes passed from the
 * server (menu loader) into the client cart components — plain data, money in
 * centavos.
 */

export interface DinerModifier {
  id: string;
  name: string;
  priceDelta: number; // centavos
}

export interface DinerModifierGroup {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number; // 1 => single-select, >1 => multi-select
  modifiers: DinerModifier[];
}

export interface DinerItem {
  id: string;
  name: string;
  description: string | null;
  price: number; // centavos
  imageUrl: string | null;
  isAvailable: boolean;
  groups: DinerModifierGroup[];
}

export interface DinerCategory {
  id: string;
  name: string;
  items: DinerItem[];
}

/** What the diner picked: modifier ids chosen, keyed by group id. */
export type Selection = Record<string, string[]>;

/** A snapshot of one chosen modifier, kept on the cart line for display + order. */
export interface CartLineModifier {
  modifierId: string;
  groupId: string;
  name: string;
  priceDelta: number;
}

/** One line in the cart. unitPrice already includes modifier deltas. */
export interface CartLine {
  lineId: string; // client-generated, unique per line
  itemId: string;
  name: string;
  basePrice: number;
  unitPrice: number; // basePrice + sum(modifier deltas)
  quantity: number;
  modifiers: CartLineModifier[];
  note?: string;
}
