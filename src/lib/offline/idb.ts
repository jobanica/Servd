/**
 * Tiny IndexedDB wrapper for offline mode (Phase 0). No dependencies. Two
 * stores: `kv` (cached JSON snapshots, e.g. the last kitchen orders) and
 * `outbox` (queued mutations replayed on reconnect). All calls are safe to run
 * in the browser only; on the server / unsupported envs they no-op.
 */
const DB_NAME = "servd-offline";
const DB_VERSION = 1;

/** Kitchen: move an existing order along. */
export interface AdvanceOp {
  opId: string;
  type: "advance";
  orderId: string;
  toStatus: "preparing" | "done";
  createdAt: number;
}

/**
 * Till: an order rung up while offline.
 *
 * `opId` doubles as the idempotency key sent to the server, so a replay after a
 * lost reply settles onto the same order rather than ringing the sale up twice.
 * `input` is whatever createCashierOrder takes — kept opaque here so the queue
 * doesn't have to be edited every time that call gains a field.
 */
export interface CreateOrderOp {
  opId: string;
  type: "create-order";
  input: unknown;
  /** For showing the cashier what is waiting, without replaying it. */
  summary: { label: string; total: number; lines: number };
  createdAt: number;
}

export type OutboxOp = AdvanceOp | CreateOrderOp;

function hasIDB(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "opId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

export async function kvGet<T>(key: string): Promise<T | null> {
  if (!hasIDB()) return null;
  try {
    return (await run<T | undefined>("kv", "readonly", (s) => s.get(key))) ?? null;
  } catch {
    return null;
  }
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  if (!hasIDB()) return;
  try {
    await run("kv", "readwrite", (s) => s.put(value as unknown as IDBValidKey, key));
  } catch {
    /* ignore */
  }
}

export async function outboxAdd(op: OutboxOp): Promise<void> {
  if (!hasIDB()) return;
  try {
    await run("outbox", "readwrite", (s) => s.put(op));
  } catch {
    /* ignore */
  }
}

export async function outboxAll(): Promise<OutboxOp[]> {
  if (!hasIDB()) return [];
  try {
    const all = await run<OutboxOp[]>("outbox", "readonly", (s) => s.getAll());
    return (all ?? []).sort((a, b) => a.createdAt - b.createdAt);
  } catch {
    return [];
  }
}

export async function outboxRemove(opId: string): Promise<void> {
  if (!hasIDB()) return;
  try {
    await run("outbox", "readwrite", (s) => s.delete(opId));
  } catch {
    /* ignore */
  }
}
