import { useMemo, useState } from "react";
import { Calendar, MessageCircle, Users } from "lucide-react";
import { Link } from "react-router-dom";
import type { PreventiveLead } from "../../api/preventiveMaintenance";
import {
  preventiveInterestKindLabel,
  preventiveServiceOrderUrl,
  whatsappChatUrl,
} from "../../lib/preventiveLeadStatus";
import { CampaignEmptyState } from "./CampaignEmptyState";
import { PreventiveLeadStatusBadge } from "./PreventiveLeadStatusBadge";
import styles from "./CampaignDashboard.module.css";

const PAGE_SIZE = 10;

type Props = {
  leads: PreventiveLead[];
  loading?: boolean;
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function PreventiveLeadsDataGrid({ leads, loading }: Props) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) => {
      const name = (l.client_name ?? "").toLowerCase();
      const phone = l.whatsapp_digits.toLowerCase();
      const kind = preventiveInterestKindLabel(l.interest_kind).toLowerCase();
      return name.includes(q) || phone.includes(q) || kind.includes(q) || String(l.client_id).includes(q);
    });
  }, [leads, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  if (loading) {
    return (
      <div className={styles.panelCard}>
        <p className={styles.hint}>Carregando interessados…</p>
      </div>
    );
  }

  if (!leads.length) {
    return (
      <CampaignEmptyState
        icon={<Users size={28} strokeWidth={1.75} />}
        title="Nenhum interessado ainda"
        description="Quando clientes responderem MAIS ou AGENDAR nos lembretes preventivos, eles aparecerão aqui para follow-up."
      />
    );
  }

  return (
    <div className={styles.panelCard}>
      <h2 className={styles.panelTitle}>Lista de espera / interações</h2>
      <p className={styles.hint} style={{ marginTop: "-0.75rem" }}>
        Respostas aos botões ou textos MAIS / AGENDAR nos lembretes preventivos.
      </p>

      <div className={styles.gridToolbar}>
        <div className={styles.gridSearch}>
          <label className={styles.fieldLabel} htmlFor="prev-leads-search">
            Buscar
          </label>
          <input
            id="prev-leads-search"
            className={styles.textInput}
            style={{ marginBottom: 0 }}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Cliente, telefone ou tipo de resposta"
            autoComplete="off"
          />
        </div>
      </div>

      {!filtered.length ? (
        <p className={styles.hint}>Nenhum resultado para &quot;{search.trim()}&quot;.</p>
      ) : (
        <>
          <div className={styles.dataGrid} role="table" aria-label="Interessados preventiva">
            <div className={`${styles.dataGridHead} ${styles.dataGridHeadPreventive}`} role="row">
              <span role="columnheader">Cliente</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Resposta</span>
              <span role="columnheader">Quando</span>
              <span role="columnheader" style={{ textAlign: "right" }}>
                Ações
              </span>
            </div>
            {slice.map((l) => {
              const waUrl = whatsappChatUrl(l.whatsapp_digits);
              const osUrl = preventiveServiceOrderUrl(l.client_id);
              return (
                <div key={l.id} className={`${styles.dataGridRow} ${styles.dataGridRowPreventive}`} role="row">
                  <div className={styles.cellCampaign} role="cell">
                    <strong>
                      {l.client_name?.trim() ? (
                        <Link to={`/app/clients/${l.client_id}`}>{l.client_name}</Link>
                      ) : (
                        `Cliente #${l.client_id}`
                      )}
                    </strong>
                    <span>{l.whatsapp_digits}</span>
                  </div>
                  <div role="cell">
                    <PreventiveLeadStatusBadge lead={l} />
                  </div>
                  <div role="cell">{preventiveInterestKindLabel(l.interest_kind)}</div>
                  <div role="cell">
                    <span title={l.created_at}>{formatWhen(l.created_at)}</span>
                  </div>
                  <div className={styles.cellActions} role="cell">
                    {waUrl ? (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.btnIcon}
                        aria-label="Abrir WhatsApp"
                        title="Abrir conversa no WhatsApp"
                      >
                        <MessageCircle size={16} />
                      </a>
                    ) : null}
                    <Link
                      to={osUrl}
                      className={styles.btnIcon}
                      aria-label="Agendar ordem de serviço"
                      title="Nova O.S. preventiva"
                    >
                      <Calendar size={16} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.paginationBar}>
            <span>
              {filtered.length} registro{filtered.length === 1 ? "" : "s"}
              {search.trim() ? " (filtrados)" : ""}
            </span>
            <div className={styles.row}>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={safePage <= 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Anterior
              </button>
              <span>
                Página {safePage + 1} de {pageCount}
              </span>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              >
                Próxima
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
