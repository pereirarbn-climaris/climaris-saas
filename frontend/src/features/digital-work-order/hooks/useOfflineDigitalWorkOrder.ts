/**
 * Hook offline-first para OS digital.
 * Persiste rascunhos no IndexedDB; sincroniza sequencialmente ao reconectar.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { useConnectivity } from '../../../hooks/useConnectivity'
import { getOfflineDraft, markOfflineDraftFailed, mergeAndPersistOfflineDraft, updateOfflineDraftVersion } from '../lib/offlineEvidenceStore'
import { clearOfflineDraft, getPendingSyncQueue } from '../lib/offlineQueue'
import type { OfflineDigitalWorkOrderDraft } from '../types'

export type OfflineSyncHandlerResult = {
  conflictDetected: boolean
  version: number
}

type SyncHandler = (draft: OfflineDigitalWorkOrderDraft) => Promise<OfflineSyncHandlerResult>

export function useOfflineDigitalWorkOrder(
  offlineClientId: string,
  serviceOrderId: number,
  syncHandler?: SyncHandler,
  onSyncConflict?: () => void,
) {
  const { isOnline } = useConnectivity()
  const [draft, setDraft] = useState<OfflineDigitalWorkOrderDraft | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [isSyncing, setIsSyncing] = useState(false)
  const [draftLoaded, setDraftLoaded] = useState(false)
  const syncHandlerRef = useRef(syncHandler)
  const onSyncConflictRef = useRef(onSyncConflict)
  syncHandlerRef.current = syncHandler
  onSyncConflictRef.current = onSyncConflict

  const refreshPendingCount = useCallback(async () => {
    const queue = await getPendingSyncQueue()
    setPendingCount(queue.length)
  }, [])

  const loadDraft = useCallback(async () => {
    const row = await getOfflineDraft(offlineClientId)
    setDraft(row)
    setDraftLoaded(true)
    await refreshPendingCount()
  }, [offlineClientId, refreshPendingCount])

  useEffect(() => {
    void loadDraft()
  }, [loadDraft])

  const flushQueue = useCallback(async () => {
    const handler = syncHandlerRef.current
    if (!handler || !navigator.onLine) return

    const queue = await getPendingSyncQueue()
    if (!queue.length) {
      await refreshPendingCount()
      return
    }

    setIsSyncing(true)
    try {
      const sorted = [...queue].sort((a, b) => a.updated_at.localeCompare(b.updated_at))
      for (const item of sorted) {
        try {
          const result = await handler(item)
          if (result.conflictDetected) {
            onSyncConflictRef.current?.()
          }
          await updateOfflineDraftVersion(item.offline_client_id, result.version)
          await clearOfflineDraft(item.offline_client_id)
        } catch {
          await markOfflineDraftFailed(item.offline_client_id)
        }
      }
      if (offlineClientId) {
        const current = await getOfflineDraft(offlineClientId)
        setDraft(current)
      }
    } finally {
      await refreshPendingCount()
      setIsSyncing(false)
    }
  }, [offlineClientId, refreshPendingCount])

  useEffect(() => {
    const onOnline = () => {
      void flushQueue()
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [flushQueue])

  useEffect(() => {
    if (isOnline) {
      void flushQueue()
    }
  }, [isOnline, flushQueue])

  const saveDraft = useCallback(
    async (partial: Partial<OfflineDigitalWorkOrderDraft> & Pick<OfflineDigitalWorkOrderDraft, 'offline_client_id' | 'service_order_id'>) => {
      const merged = await mergeAndPersistOfflineDraft(partial)
      setDraft(merged)
      await refreshPendingCount()
      if (navigator.onLine) {
        void flushQueue()
      }
      return merged
    },
    [flushQueue, refreshPendingCount],
  )

  const finalizeOffline = useCallback(async () => {
    const merged = await mergeAndPersistOfflineDraft({
      offline_client_id: offlineClientId,
      service_order_id: serviceOrderId,
      sync_status: 'pending_sync',
      finalized_offline_at: new Date().toISOString(),
    })
    setDraft(merged)
    await refreshPendingCount()
    return merged
  }, [offlineClientId, refreshPendingCount, serviceOrderId])

  return {
    isOnline,
    isSyncing,
    pendingCount,
    draft,
    draftLoaded,
    saveDraft,
    finalizeOffline,
    flushQueue,
    reloadDraft: loadDraft,
  }
}
