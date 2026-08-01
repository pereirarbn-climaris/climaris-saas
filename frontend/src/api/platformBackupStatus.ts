import { apiErrorMessage } from "../lib/apiErrorMessage";
import { apiUrl } from "../lib/apiUrl";
import { getAccessToken } from "../lib/authStorage";

export type BackupStorageClassInfo = {
  total_objects: number;
  non_standard_objects: number;
  non_standard_pct: number;
};

export type BackupComponentStatus = {
  ok: boolean;
  last_run_at?: string | null;
  last_success_at?: string | null;
  last_failure_at?: string | null;
  message?: string | null;
  stale?: boolean;
  last_snapshot_id?: string | null;
  last_snapshot_time?: string | null;
  snapshot_count?: number | null;
  prune_warning?: boolean;
  dump_included?: boolean;
  storage_class_warning?: boolean;
  storage_class_info?: BackupStorageClassInfo | null;
};

export type PlatformBackupStatus = {
  available: boolean;
  message?: string;
  updated_at?: string | null;
  backup?: BackupComponentStatus | null;
  verify?: BackupComponentStatus | null;
  deep_check?: BackupComponentStatus | null;
};

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  if (!token) throw new Error("Sessão expirada.");
  return { Authorization: `Bearer ${token}` };
}

export async function fetchPlatformBackupStatus(): Promise<PlatformBackupStatus> {
  const response = await fetch(apiUrl("/api/v1/platform/backup-status"), { headers: authHeaders() });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(apiErrorMessage(body, "Não foi possível carregar o status do backup.", response));
  }
  return body as PlatformBackupStatus;
}
