import type { OfflineDigitalWorkOrderDraft, OfflineEvidenceDraft, OfflineMeasurementDraft } from '../types'

const DB_NAME = 'climaris-dwo'
const DB_VERSION = 2
const BLOB_STORE = 'evidence-blobs'
const DRAFT_STORE = 'drafts'

const LEGACY_QUEUE_KEY = 'climaris:dwo:offline-queue'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error('Falha ao abrir IndexedDB.'))
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE)
      }
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

function txPromise<T>(db: IDBDatabase, storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const request = run(tx.objectStore(storeName))
    request.onsuccess = () => resolve(request.result as T)
    request.onerror = () => reject(request.error ?? new Error(`Falha na transação ${storeName}.`))
    tx.onerror = () => reject(tx.error ?? new Error(`Falha na transação ${storeName}.`))
  })
}

let migrationDone = false

async function migrateLegacyLocalStorageQueue(): Promise<void> {
  if (migrationDone) return
  migrationDone = true

  try {
    const raw = localStorage.getItem(LEGACY_QUEUE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.removeItem(LEGACY_QUEUE_KEY)
      return
    }

    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const legacy = item as Partial<OfflineDigitalWorkOrderDraft>
      if (!legacy.offline_client_id || !legacy.service_order_id) continue

      const normalized: OfflineDigitalWorkOrderDraft = {
        offline_client_id: legacy.offline_client_id,
        service_order_id: legacy.service_order_id,
        measurement_values: legacy.measurement_values ?? {},
        measurements: legacy.measurements ?? [],
        evidences: legacy.evidences ?? [],
        sync_status: legacy.sync_status === 'pending_sync' ? 'pending_sync' : 'pending',
        finalized_offline_at: legacy.finalized_offline_at ?? null,
        last_version: typeof legacy.last_version === 'number' ? legacy.last_version : 1,
        updated_at: legacy.updated_at ?? new Date().toISOString(),
      }
      await putOfflineDraft(normalized)
    }
    localStorage.removeItem(LEGACY_QUEUE_KEY)
  } catch {
    // Mantém fila legada se a migração falhar.
  }
}

export async function putOfflineEvidenceBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDb()
  try {
    await txPromise(db, BLOB_STORE, 'readwrite', (store) => store.put(blob, id))
  } finally {
    db.close()
  }
}

export async function getOfflineEvidenceBlob(id: string): Promise<Blob | null> {
  const db = await openDb()
  try {
    const blob = await txPromise<Blob | undefined>(db, BLOB_STORE, 'readonly', (store) => store.get(id))
    return blob ?? null
  } finally {
    db.close()
  }
}

export async function deleteOfflineEvidenceBlob(id: string): Promise<void> {
  const db = await openDb()
  try {
    await txPromise(db, BLOB_STORE, 'readwrite', (store) => store.delete(id))
  } finally {
    db.close()
  }
}

export async function getOfflineDraft(offlineClientId: string): Promise<OfflineDigitalWorkOrderDraft | null> {
  await migrateLegacyLocalStorageQueue()
  const db = await openDb()
  try {
    const draft = await txPromise<OfflineDigitalWorkOrderDraft | undefined>(
      db,
      DRAFT_STORE,
      'readonly',
      (store) => store.get(offlineClientId),
    )
    return draft ?? null
  } finally {
    db.close()
  }
}

export async function putOfflineDraft(draft: OfflineDigitalWorkOrderDraft): Promise<void> {
  await migrateLegacyLocalStorageQueue()
  const db = await openDb()
  try {
    await txPromise(db, DRAFT_STORE, 'readwrite', (store) => store.put(draft, draft.offline_client_id))
  } finally {
    db.close()
  }
}

export async function deleteOfflineDraft(offlineClientId: string): Promise<void> {
  const db = await openDb()
  try {
    await txPromise(db, DRAFT_STORE, 'readwrite', (store) => store.delete(offlineClientId))
  } finally {
    db.close()
  }
}

export async function getAllOfflineDrafts(): Promise<OfflineDigitalWorkOrderDraft[]> {
  await migrateLegacyLocalStorageQueue()
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE, 'readonly')
      const store = tx.objectStore(DRAFT_STORE)
      const request = store.getAll()
      request.onsuccess = () => resolve((request.result as OfflineDigitalWorkOrderDraft[]) ?? [])
      request.onerror = () => reject(request.error ?? new Error('Falha ao listar rascunhos offline.'))
      tx.onerror = () => reject(tx.error ?? new Error('Falha ao listar rascunhos offline.'))
    })
  } finally {
    db.close()
  }
}

export async function getPendingOfflineDrafts(): Promise<OfflineDigitalWorkOrderDraft[]> {
  const all = await getAllOfflineDrafts()
  return all.filter((d) => d.sync_status === 'pending' || d.sync_status === 'pending_sync')
}

function mergeMeasurements(
  existing: OfflineMeasurementDraft[],
  incoming: OfflineMeasurementDraft[],
): OfflineMeasurementDraft[] {
  const map = new Map(existing.map((m) => [m.metric_key, m]))
  for (const row of incoming) {
    map.set(row.metric_key, row)
  }
  return [...map.values()]
}

function mergeEvidences(existing: OfflineEvidenceDraft[], incoming: OfflineEvidenceDraft[]): OfflineEvidenceDraft[] {
  const map = new Map(existing.map((e) => [e.evidence_key, e]))
  for (const row of incoming) {
    map.set(row.evidence_key, row)
  }
  return [...map.values()]
}

export function mergeOfflineDraftParts(
  existing: OfflineDigitalWorkOrderDraft | null,
  partial: Partial<OfflineDigitalWorkOrderDraft> & Pick<OfflineDigitalWorkOrderDraft, 'offline_client_id' | 'service_order_id'>,
): OfflineDigitalWorkOrderDraft {
  const base = existing ?? {
    offline_client_id: partial.offline_client_id,
    service_order_id: partial.service_order_id,
    measurement_values: {},
    measurements: [],
    evidences: [],
    sync_status: 'pending' as const,
    finalized_offline_at: null,
    last_version: partial.last_version ?? 1,
    updated_at: new Date().toISOString(),
  }

  const measurement_values = {
    ...base.measurement_values,
    ...(partial.measurement_values ?? {}),
  }

  const merged: OfflineDigitalWorkOrderDraft = {
    ...base,
    ...partial,
    measurement_values,
    measurements: mergeMeasurements(base.measurements, partial.measurements ?? []),
    evidences: mergeEvidences(base.evidences, partial.evidences ?? []),
    last_version: partial.last_version ?? base.last_version ?? 1,
    updated_at: new Date().toISOString(),
  }

  if (partial.sync_status) {
    merged.sync_status = partial.sync_status
  } else if (merged.sync_status === 'synced') {
    merged.sync_status = 'pending'
  }

  return merged
}

export async function mergeAndPersistOfflineDraft(
  partial: Partial<OfflineDigitalWorkOrderDraft> & Pick<OfflineDigitalWorkOrderDraft, 'offline_client_id' | 'service_order_id'>,
): Promise<OfflineDigitalWorkOrderDraft> {
  const existing = await getOfflineDraft(partial.offline_client_id)
  const merged = mergeOfflineDraftParts(existing, partial)
  await putOfflineDraft(merged)
  return merged
}

export async function markOfflineDraftSynced(offlineClientId: string): Promise<void> {
  const draft = await getOfflineDraft(offlineClientId)
  if (!draft) return

  for (const ev of draft.evidences) {
    if (ev.blob_ref) {
      await deleteOfflineEvidenceBlob(ev.blob_ref)
    }
  }
  await deleteOfflineDraft(offlineClientId)
}

export async function updateOfflineDraftVersion(offlineClientId: string, version: number): Promise<void> {
  const draft = await getOfflineDraft(offlineClientId)
  if (!draft) return
  await putOfflineDraft({ ...draft, last_version: version, updated_at: new Date().toISOString() })
}

export async function markOfflineDraftFailed(offlineClientId: string): Promise<void> {
  const draft = await getOfflineDraft(offlineClientId)
  if (!draft) return
  await putOfflineDraft({ ...draft, sync_status: 'failed', updated_at: new Date().toISOString() })
}
