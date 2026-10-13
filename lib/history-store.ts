/**
 * Local generation history in IndexedDB (images are too large for localStorage).
 * Stores only images and safe metadata — never API keys or access codes.
 */
import type { HistoryItem } from "@/types/image";

const DB_NAME = "intelligo-marketing-kit";
const DB_VERSION = 2;
const STORE = "history";
/** Brand assets (official logo files + preferences), kept in this browser only. */
const BRAND_STORE = "brand";
export const MAX_HISTORY_ITEMS = 40;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt");
        }
        if (!db.objectStoreNames.contains(BRAND_STORE)) {
          db.createObjectStore(BRAND_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("IndexedDB blocked"));
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function listHistory(): Promise<HistoryItem[]> {
  const db = await openDb();
  const items = await promisify(db.transaction(STORE, "readonly").objectStore(STORE).getAll() as IDBRequest<HistoryItem[]>);
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function addHistoryItem(item: HistoryItem): Promise<void> {
  const db = await openDb();
  const existing = await listHistory();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  store.put(item);
  // Keep history light: drop the oldest items beyond the limit.
  existing.slice(MAX_HISTORY_ITEMS - 1).forEach((old) => store.delete(old.id));
  await transactionDone(tx);
}

export async function deleteHistoryItem(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await transactionDone(tx);
}

// ---------- Brand assets ----------

export type BrandAssetKey = "logo-primary" | "logo-on-dark" | "logo-prefs";

export async function getBrandAsset<T>(key: BrandAssetKey): Promise<T | undefined> {
  const db = await openDb();
  return promisify(db.transaction(BRAND_STORE, "readonly").objectStore(BRAND_STORE).get(key) as IDBRequest<T | undefined>);
}

export async function setBrandAsset(key: BrandAssetKey, value: unknown): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(BRAND_STORE, "readwrite");
  tx.objectStore(BRAND_STORE).put(value, key);
  await transactionDone(tx);
}

export async function deleteBrandAsset(key: BrandAssetKey): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(BRAND_STORE, "readwrite");
  tx.objectStore(BRAND_STORE).delete(key);
  await transactionDone(tx);
}
