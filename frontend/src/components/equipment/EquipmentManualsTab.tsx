import { useCallback, useEffect, useState } from "react";
import { Download, FileText, RefreshCw } from "lucide-react";
import { listClientEquipmentManuals, type ClientEquipmentManualOut } from "../../api/equipmentCatalog";
import { ingestKnowledgeManual } from "../../api/knowledgeBase";
import { toast } from "../../lib/toast";
import type { EquipmentItem } from "../v0-ui/clients/ClientEquipmentManager";
import styles from "./EquipmentManualsTab.module.css";

type Props = {
  equipment: EquipmentItem;
};

function fallbackManualsFromEquipment(equipment: EquipmentItem): ClientEquipmentManualOut[] {
  const seen = new Set<string>();
  const items: ClientEquipmentManualOut[] = [];
  for (const part of equipment.components ?? []) {
    if (!part.manualUrl || seen.has(part.manualUrl)) continue;
    seen.add(part.manualUrl);
    items.push({
      id: part.id,
      title: `Manual — ${part.brand} ${part.model}`.trim(),
      url: part.manualUrl,
      kind: "Manual",
      component_label: equipment.components && equipment.components.length > 1 ? `${part.brand} · ${part.model}` : null,
    });
  }
  return items;
}

function statusLabel(status: string | null | undefined): string {
  switch (status) {
    case "ready":
      return "Indexado";
    case "processing":
      return "Indexando…";
    case "failed":
      return "Falha na indexação";
    case "pending":
    default:
      return "Pendente";
  }
}

export function EquipmentManualsTab({ equipment }: Props) {
  const [manuals, setManuals] = useState<ClientEquipmentManualOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reindexingId, setReindexingId] = useState<string | null>(null);
  const [reindexingAll, setReindexingAll] = useState(false);

  const loadManuals = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await listClientEquipmentManuals(equipment.id);
      setManuals(rows);
    } catch (e) {
      const fallback = fallbackManualsFromEquipment(equipment);
      setManuals(fallback);
      if (fallback.length === 0) {
        setError(e instanceof Error ? e.message : "Não foi possível carregar os manuais.");
      }
    } finally {
      setLoading(false);
    }
  }, [equipment]);

  useEffect(() => {
    void loadManuals();
  }, [loadManuals]);

  async function handleReindex(manualId: string) {
    setReindexingId(manualId);
    try {
      const result = await ingestKnowledgeManual(manualId);
      setManuals((prev) =>
        prev.map((row) =>
          row.id === manualId
            ? {
                ...row,
                ingestion_status: result.ingestion_status,
                ingestion_error: result.ingestion_error ?? null,
              }
            : row,
        ),
      );
      toast.success("Reindexação iniciada. O assistente usará o manual em instantes.");
      window.setTimeout(() => void loadManuals(), 4000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao reindexar manual.");
    } finally {
      setReindexingId(null);
    }
  }

  async function handleReindexAll() {
    if (manuals.length === 0) return;
    setReindexingAll(true);
    try {
      await Promise.all(manuals.map((manual) => ingestKnowledgeManual(manual.id)));
      toast.success("Reindexação dos manuais deste equipamento iniciada.");
      window.setTimeout(() => void loadManuals(), 4000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao reindexar manuais.");
    } finally {
      setReindexingAll(false);
    }
  }

  if (loading) {
    return <p className={styles.loading}>Carregando manuais…</p>;
  }

  if (error) {
    return <p className={styles.err}>{error}</p>;
  }

  if (manuals.length === 0) {
    return (
      <p className={styles.emptyState}>
        Nenhum manual PDF vinculado a este equipamento. Cadastre manuais no catálogo de modelos.
      </p>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <p className={styles.toolbarHint}>
          Indexe os PDFs para a Iris responder com base nos manuais.
        </p>
        <button
          type="button"
          className={styles.reindexAllBtn}
          disabled={reindexingAll || reindexingId !== null}
          onClick={() => void handleReindexAll()}
        >
          <RefreshCw size={15} aria-hidden className={reindexingAll ? styles.spin : undefined} />
          {reindexingAll ? "Reindexando…" : "Reindexar todos"}
        </button>
      </div>

      <ul className={styles.list}>
        {manuals.map((manual) => (
          <li key={manual.id} className={styles.item}>
            <div className={styles.iconWrap} aria-hidden>
              <FileText size={20} />
            </div>
            <div className={styles.body}>
              <p className={styles.title}>{manual.title}</p>
              <p className={styles.meta}>
                {[manual.kind, manual.component_label].filter(Boolean).join(" · ")}
              </p>
              <p
                className={`${styles.status} ${
                  manual.ingestion_status === "ready"
                    ? styles.statusReady
                    : manual.ingestion_status === "failed"
                      ? styles.statusFailed
                      : styles.statusPending
                }`}
              >
                {statusLabel(manual.ingestion_status)}
                {manual.ingestion_status === "failed" && manual.ingestion_error
                  ? ` — ${manual.ingestion_error}`
                  : ""}
              </p>
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.reindexBtn}
                disabled={reindexingId === manual.id || reindexingAll}
                onClick={() => void handleReindex(manual.id)}
                title="Reindexar manual para o assistente IA"
              >
                <RefreshCw size={15} aria-hidden className={reindexingId === manual.id ? styles.spin : undefined} />
                {reindexingId === manual.id ? "…" : "Reindexar"}
              </button>
              <a
                className={styles.downloadBtn}
                href={manual.url}
                target="_blank"
                rel="noopener noreferrer"
                download
              >
                <Download size={16} aria-hidden />
                Baixar PDF
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
