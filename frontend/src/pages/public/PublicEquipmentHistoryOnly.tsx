import type { PublicEquipmentPagePayload } from "../../api/publicEquipment";
import { mapPublicHistoryEntries } from "../../lib/equipmentProfileAdapter";
import styles from "./PublicEquipmentPage.module.css";

type Props = {
  data: PublicEquipmentPagePayload;
  statusLabel: string;
};

export function PublicEquipmentHistoryOnly({ data, statusLabel }: Props) {
  const history = mapPublicHistoryEntries(data.entries);

  return (
    <div className={styles.page}>
      <div className={styles.wrapWide}>
        <header className={styles.hero}>
          <p className={styles.brand}>{data.tenant_name}</p>
          <div className={styles.heroTop}>
            <h1 className={styles.title}>Histórico de manutenções</h1>
            <span
              className={
                statusLabel === "Em Manutenção"
                  ? styles.statusMaintenance
                  : statusLabel === "Inativo"
                    ? styles.statusInactive
                    : styles.statusActive
              }
            >
              {statusLabel}
            </span>
          </div>
          <p className={styles.meta}>
            {data.identificacao}
            {data.fabricante || data.modelo
              ? ` · ${[data.fabricante, data.modelo].filter(Boolean).join(" ")}`
              : ""}
          </p>
          <p className={styles.leadSection}>
            Leitura pública. Faça login como técnico para abrir uma nova ordem de serviço.
          </p>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Manutenções registradas</h2>
          {history.length === 0 ? (
            <p className={styles.muted}>Nenhuma manutenção registrada para este equipamento.</p>
          ) : (
            <ul className={styles.historyList}>
              {history.map((event) => (
                <li key={event.id} className={styles.historyItem}>
                  <time className={styles.historyDate}>
                    {new Date(event.date).toLocaleDateString("pt-BR")}
                  </time>
                  <p className={styles.historyTitle}>{event.title}</p>
                  {event.description ? (
                    <p className={styles.historyDetail}>{event.description}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
