/** Tipos da OS digital — offline-first. */

export type DigitalWorkOrderSyncStatus = 'synced' | 'pending' | 'pending_sync' | 'conflict' | 'failed'

export interface OfflineMeasurementDraft {
  metric_key: string
  value_numeric?: number | null
  value_text?: string | null
  unit?: string | null
  recorded_offline: true
  recorded_at: string
}

export interface OfflineEvidenceDraft {
  evidence_key: string
  evidence_type: string
  storage_key?: string | null
  blob_ref?: string
  mime_type?: string | null
  latitude?: number | null
  longitude?: number | null
  accuracy_meters?: number | null
  captured_offline: true
  captured_at: string
}

export interface OfflineDigitalWorkOrderDraft {
  offline_client_id: string
  service_order_id: number
  /** Valores crus dos inputs — restaurados após refresh. */
  measurement_values: Record<string, string>
  measurements: OfflineMeasurementDraft[]
  evidences: OfflineEvidenceDraft[]
  sync_status: DigitalWorkOrderSyncStatus
  finalized_offline_at?: string | null
  /** Versão otimista conhecida pelo cliente (conflict resolution). */
  last_version: number
  updated_at: string
}

export function emptyOfflineDraft(serviceOrderId: number, offlineClientId: string): OfflineDigitalWorkOrderDraft {
  return {
    offline_client_id: offlineClientId,
    service_order_id: serviceOrderId,
    measurement_values: {},
    measurements: [],
    evidences: [],
    sync_status: 'pending',
    finalized_offline_at: null,
    last_version: 1,
    updated_at: new Date().toISOString(),
  }
}
