import type { HistoryItem } from "../../v0-ui/clients";
import styles from "../../../pages/clients/ClientDetail.module.css";
import { EmptyState, formatDateTimeBR } from "./shared";

const FIELD_LABELS: Record<string, string> = {
  name: "Nome/Razão social",
  document: "Documento",
  trade_name: "Nome fantasia",
  phone: "Telefone",
  whatsapp: "WhatsApp",
  email: "E-mail",
  is_active: "Status do cadastro",
  rg: "RG",
  birth_date: "Data de nascimento",
  address_street: "Endereço",
  address_city: "Cidade",
  address_state: "Estado",
  address_postal_code: "CEP",
  state_registration: "Inscrição estadual",
  municipal_registration: "Inscrição municipal",
  contact_person_name: "Responsável pelo contato",
};

const ACTION_TITLES: Record<string, string> = {
  created: "Cliente criado",
  updated: "Alterações cadastrais",
  cnpj_commercial_refresh: "Atualização via Receita (Comercial)",
};

function describeHistoryItem(item: HistoryItem): string {
  if (item.title === "created") return "Cadastro do cliente criado no sistema.";
  if (item.title === "cnpj_commercial_refresh") return "Dados atualizados automaticamente via consulta à Receita Federal.";
  if (item.title === "updated" && item.description) {
    try {
      const changes = JSON.parse(item.description) as Record<string, unknown>;
      const fields = Object.keys(changes).map((k) => FIELD_LABELS[k] ?? k);
      if (fields.length) return `Campos alterados: ${fields.join(", ")}.`;
    } catch {
      // ignore parse errors, fall back below
    }
  }
  return item.description ?? "";
}

type Props = {
  history: HistoryItem[];
  loading?: boolean;
  isNew: boolean;
};

export function ClientHistoryTab({ history, loading, isNew }: Props) {
  return (
    <div className={styles.tabPanel}>
      <section className={styles.card}>
        <div className={styles.cardHeadRow}>
          <div>
            <h3 className={styles.cardTitle}>Histórico do cliente</h3>
            <p className={styles.cardHint}>Linha do tempo de eventos e alterações realizadas neste cadastro.</p>
          </div>
        </div>

        {isNew ? (
          <p className={styles.cardHint}>O histórico ficará disponível após salvar o cliente.</p>
        ) : loading ? (
          <p className={styles.loading}>Carregando histórico…</p>
        ) : history.length === 0 ? (
          <EmptyState message="Nenhum evento registrado ainda." />
        ) : (
          <div className={styles.timeline}>
            {history.map((item, idx) => (
              <div key={item.id} className={styles.timelineItem}>
                <span className={styles.timelineDot} aria-hidden />
                {idx < history.length - 1 ? <span className={styles.timelineLine} aria-hidden /> : null}
                <div className={styles.timelineContent}>
                  <div className={styles.timelineHeader}>
                    <h4 className={styles.timelineTitle}>{ACTION_TITLES[item.title] ?? item.title}</h4>
                    <span className={styles.timelineDate}>{formatDateTimeBR(String(item.date))}</span>
                  </div>
                  <p className={styles.timelineDesc}>{describeHistoryItem(item)}</p>
                  {item.user ? <p className={styles.timelineUser}>Por {item.user}</p> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
