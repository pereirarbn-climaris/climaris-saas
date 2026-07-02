/**
 * Fila de sincronização offline — persistência em IndexedDB (offlineEvidenceStore).
 */

import {
  deleteOfflineDraft,
  getAllOfflineDrafts,
  getPendingOfflineDrafts,
  markOfflineDraftSynced,
  mergeAndPersistOfflineDraft,
} from './offlineEvidenceStore'
import type { OfflineDigitalWorkOrderDraft } from '../types'

export async function enqueueOfflineDraft(draft: OfflineDigitalWorkOrderDraft): Promise<OfflineDigitalWorkOrderDraft> {
  return mergeAndPersistOfflineDraft({ ...draft, sync_status: draft.sync_status ?? 'pending' })
}

export async function getOfflineQueue(): Promise<OfflineDigitalWorkOrderDraft[]> {
  return getAllOfflineDrafts()
}

export async function getPendingSyncQueue(): Promise<OfflineDigitalWorkOrderDraft[]> {
  return getPendingOfflineDrafts()
}

export async function clearOfflineDraft(offlineClientId: string): Promise<void> {
  await markOfflineDraftSynced(offlineClientId)
}

export async function mergeOfflineDraft(
  partial: Partial<OfflineDigitalWorkOrderDraft> & Pick<OfflineDigitalWorkOrderDraft, 'offline_client_id' | 'service_order_id'>,
): Promise<OfflineDigitalWorkOrderDraft> {
  return mergeAndPersistOfflineDraft(partial)
}

export async function removeOfflineDraft(offlineClientId: string): Promise<void> {
  await deleteOfflineDraft(offlineClientId)
}
