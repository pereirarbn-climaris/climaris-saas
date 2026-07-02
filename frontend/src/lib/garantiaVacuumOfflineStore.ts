const DB_NAME = "climaris-garantia-vacuum";
const DB_VERSION = 1;
const BLOB_STORE = "vacuum-blobs";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Falha ao abrir IndexedDB (vácuo)."));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function txPromise<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, mode);
    const request = run(tx.objectStore(BLOB_STORE));
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error ?? new Error("Falha na transação de vácuo."));
    tx.onerror = () => reject(tx.error ?? new Error("Falha na transação de vácuo."));
  });
}

export async function putGarantiaVacuumBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  try {
    await txPromise(db, "readwrite", (store) => store.put(blob, id));
  } finally {
    db.close();
  }
}

export async function getGarantiaVacuumBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  try {
    const blob = await txPromise<Blob | undefined>(db, "readonly", (store) => store.get(id));
    return blob ?? null;
  } finally {
    db.close();
  }
}

export async function deleteGarantiaVacuumBlob(id: string): Promise<void> {
  const db = await openDb();
  try {
    await txPromise(db, "readwrite", (store) => store.delete(id));
  } finally {
    db.close();
  }
}

export function newVacuumOfflineBlobRef(orderId: number): string {
  return `vacuo-os${orderId}-${crypto.randomUUID()}`;
}

export function newStartupOfflineBlobRef(orderId: number, metricKey: string): string {
  const safe = metricKey.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 32);
  return `startup-${safe}-os${orderId}-${crypto.randomUUID()}`;
}
