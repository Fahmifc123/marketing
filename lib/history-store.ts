/**
 * Local generation history in IndexedDB (images are too large for localStorage).
 * Stores only images and safe metadata — never API keys or access codes.
 */
import type { HistoryItem } from "@/types/image";

const DB_NAME = "intelligo-marketing-kit";
const DB_VERSION = 1;
const STORE = "history";
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
