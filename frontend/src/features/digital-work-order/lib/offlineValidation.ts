import type { OfflineMeasurementDraft } from '../types'

type MeasurementSpec = {
  key: string
  unit?: string
}

export function parseMeasurementValues(
  values: Record<string, string>,
  specs: MeasurementSpec[],
): OfflineMeasurementDraft[] {
  const now = new Date().toISOString()
  const rows: OfflineMeasurementDraft[] = []

  for (const spec of specs) {
    const raw = (values[spec.key] ?? '').trim()
    if (!raw) continue
    const numeric = Number(raw.replace(',', '.'))
    if (!Number.isFinite(numeric)) continue
    rows.push({
      metric_key: spec.key,
      value_numeric: numeric,
      unit: spec.unit,
      recorded_offline: true,
      recorded_at: now,
    })
  }

  return rows
}

export function validateOfflineRequirements(
  values: Record<string, string>,
  measurementKeys: string[],
  evidenceKeys: string[],
  offlineEvidenceKeys: Set<string>,
  serverEvidenceKeys: Set<string>,
): string[] {
  const missing: string[] = []

  for (const key of measurementKeys) {
    const raw = (values[key] ?? '').trim()
    if (!raw) missing.push(`Medição: ${key}`)
  }

  for (const key of evidenceKeys) {
    if (!offlineEvidenceKeys.has(key) && !serverEvidenceKeys.has(key)) {
      missing.push(`Evidência: ${key}`)
    }
  }

  return missing
}
