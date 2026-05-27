import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import { listClientEquipmentManuals, type ClientEquipmentManualOut } from "../../api/equipmentCatalog";
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

export function EquipmentManualsTab({ equipment }: Props) {
  const [manuals, setManuals] = useState<ClientEquipmentManualOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const rows = await listClientEquipmentManuals(equipment.id);
        if (!cancelled) setManuals(rows);
      } catch (e) {
        if (!cancelled) {
          const fallback = fallbackManualsFromEquipment(equipment);
          setManuals(fallback);
          if (fallback.length === 0) {
            setError(e instanceof Error ? e.message : "Não foi possível carregar os manuais.");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [equipment]);

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
          </div>
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
        </li>
      ))}
    </ul>
  );
}
