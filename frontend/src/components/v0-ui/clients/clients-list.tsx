/**
 * Listagem de clientes — componentes visuais (v0-ui).
 * Dados e chamadas de API ficam na página (`ClientsListPage`).
 */

import type { ReactNode } from "react";
import { formatPhoneBrDisplay, whatsappMeUrl } from "../../../lib/brMask";
import tableStyles from "../../../pages/listTableCommon.module.css";
import styles from "./clients-list.module.css";

export type ClientListSortKey = "name" | "email" | "whatsapp";
export type ClientListSortDir = "asc" | "desc";

export type ClientListItem = {
  id: number;
  name: string;
  email: string | null;
  whatsapp: string | null;
  is_active: boolean;
  tax_id_kind?: string;
  contact_person_name?: string | null;
  trade_name?: string | null;
};

export type ClientsStats = {
  total: number;
  empresas: number;
  pessoas: number;
  ativos: number;
};

function initials(name: string): string {
  const chunks = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (chunks.length === 0) return "?";
  if (chunks.length === 1) return chunks[0]!.slice(0, 2).toUpperCase();
  return `${chunks[0]![0] ?? ""}${chunks[1]![0] ?? ""}`.toUpperCase();
}

function avatarClass(seed: number): string {
  const i = Math.abs(seed) % 5;
  return [styles.avatarA, styles.avatarB, styles.avatarC, styles.avatarD, styles.avatarE][i] ?? styles.avatarA;
}

function WaMark({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.881 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"
      />
    </svg>
  );
}

export interface ClientsStatsGridProps {
  stats: ClientsStats;
}

export function ClientsStatsGrid({ stats }: ClientsStatsGridProps) {
  return (
    <div className={styles.heroStats}>
      <article className={styles.statCard}>
        <div className={styles.statHead}>
          <div>
            <p className={styles.statLabel}>Total de clientes</p>
            <p className={styles.statValue}>{stats.total}</p>
          </div>
          <span className={styles.statIconWrap} aria-hidden>
            <svg viewBox="0 0 24 24" className={styles.statIcon}>
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            </svg>
          </span>
        </div>
        <p className={styles.statHint}>{stats.total > 0 ? "Cadastrados no sistema" : "Sem registros"}</p>
      </article>
      <article className={styles.statCard}>
        <div className={styles.statHead}>
          <div>
            <p className={styles.statLabel}>Empresas</p>
            <p className={styles.statValue}>{stats.empresas}</p>
          </div>
          <span className={styles.statIconWrap} aria-hidden>
            <svg viewBox="0 0 24 24" className={styles.statIcon}>
              <path d="M3 21h18" />
              <path d="M5 21V7l8-4v18" />
              <path d="M19 21V11l-6-4" />
            </svg>
          </span>
        </div>
        <p className={styles.statHint}>
          {stats.total ? `${Math.round((stats.empresas / stats.total) * 100)}% do total` : "0% do total"}
        </p>
      </article>
      <article className={styles.statCard}>
        <div className={styles.statHead}>
          <div>
            <p className={styles.statLabel}>Pessoas fisicas</p>
            <p className={styles.statValue}>{stats.pessoas}</p>
          </div>
          <span className={styles.statIconWrap} aria-hidden>
            <svg viewBox="0 0 24 24" className={styles.statIcon}>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 20a8 8 0 0 1 16 0" />
            </svg>
          </span>
        </div>
        <p className={styles.statHint}>
          {stats.total ? `${Math.round((stats.pessoas / stats.total) * 100)}% do total` : "0% do total"}
        </p>
      </article>
      <article className={styles.statCard}>
        <div className={styles.statHead}>
          <div>
            <p className={styles.statLabel}>Cadastro ativo</p>
            <p className={styles.statValue}>{stats.ativos}</p>
          </div>
          <span className={styles.statIconWrap} aria-hidden>
            <svg viewBox="0 0 24 24" className={styles.statIcon}>
              <circle cx="12" cy="12" r="9" />
              <path d="m8.5 12.5 2.2 2.1 4.8-5" />
            </svg>
          </span>
        </div>
        <p className={styles.statHint}>
          {stats.total ? `${Math.round((stats.ativos / stats.total) * 100)}% ativos` : "0% ativos"}
        </p>
      </article>
    </div>
  );
}

function ClientsListTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className={styles.tableContainer} aria-busy="true" aria-label="Carregando clientes">
      <div className={tableStyles.tableWrap}>
        <table className={`${tableStyles.table} ${styles.clientsTableDense}`}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>WhatsApp</th>
              <th>Status</th>
              <th className={tableStyles.tailCol} aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, i) => (
              <tr key={i}>
                <td colSpan={5}>
                  <div
                    style={{
                      height: "2.25rem",
                      borderRadius: "var(--radius-md)",
                      background: "linear-gradient(90deg, var(--color-surface) 0%, #e2e8f0 50%, var(--color-surface) 100%)",
                      backgroundSize: "200% 100%",
                      animation: "shimmer 1.2s ease-in-out infinite",
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export interface ClientsListTableProps {
  clients: ClientListItem[];
  isLoading?: boolean;
  sortKey: ClientListSortKey;
  sortDir: ClientListSortDir;
  onSortHeader: (key: ClientListSortKey) => void;
  onRowClick: (clientId: number) => void;
}

export function ClientsListTable({
  clients,
  isLoading = false,
  sortKey,
  sortDir,
  onSortHeader,
  onRowClick,
}: ClientsListTableProps) {
  function sortAriaSort(key: ClientListSortKey): "ascending" | "descending" | "none" {
    if (sortKey !== key) return "none";
    return sortDir === "asc" ? "ascending" : "descending";
  }

  if (isLoading) {
    return <ClientsListTableSkeleton />;
  }

  if (clients.length === 0) {
    return <p className={styles.empty}>Nenhum cliente encontrado.</p>;
  }

  return (
    <div className={styles.tableContainer}>
      <div className={tableStyles.tableWrap}>
        <table className={`${tableStyles.table} ${styles.clientsTableDense}`}>
          <thead>
            <tr>
              <th className={styles.sortableTh} aria-sort={sortAriaSort("name")}>
                <button type="button" className={styles.sortableThBtn} onClick={() => onSortHeader("name")}>
                  Nome
                  <span className={styles.sortIcon} aria-hidden>
                    <svg viewBox="0 0 24 24">
                      <path d="m8 9 4-4 4 4" />
                      <path d="m16 15-4 4-4-4" />
                    </svg>
                  </span>
                </button>
              </th>
              <th className={styles.sortableTh} aria-sort={sortAriaSort("email")}>
                <button type="button" className={styles.sortableThBtn} onClick={() => onSortHeader("email")}>
                  E-mail
                  {sortKey === "email" ? (
                    <span className={styles.sortIndicator}>{sortDir === "asc" ? "↑" : "↓"}</span>
                  ) : null}
                </button>
              </th>
              <th className={styles.sortableTh} aria-sort={sortAriaSort("whatsapp")}>
                <button type="button" className={styles.sortableThBtn} onClick={() => onSortHeader("whatsapp")}>
                  <span className={styles.waThLabel}>
                    <WaMark className={styles.waThIcon} />
                    WhatsApp
                  </span>
                  {sortKey === "whatsapp" ? (
                    <span className={styles.sortIndicator}>{sortDir === "asc" ? "↑" : "↓"}</span>
                  ) : null}
                </button>
              </th>
              <th>Status</th>
              <th className={tableStyles.tailCol} aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => {
              const wa = whatsappMeUrl(c.whatsapp);
              const cadastroAtivo = c.is_active !== false;
              const isCnpj = (c.tax_id_kind || "").toLowerCase() === "cnpj";
              const subline = (
                isCnpj
                  ? (c.contact_person_name?.trim() || c.trade_name?.trim() || "")
                  : (c.trade_name?.trim() || "")
              ).trim();
              return (
                <tr
                  key={c.id}
                  className={tableStyles.rowClickable}
                  onClick={() => onRowClick(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onRowClick(c.id);
                    }
                  }}
                  role="link"
                  tabIndex={0}
                  aria-label={`Abrir cliente ${c.name}`}
                >
                  <td>
                    <div className={styles.clientCell}>
                      <span className={`${styles.avatar} ${avatarClass(c.id)}`}>{initials(c.name)}</span>
                      <div className={styles.clientInfo}>
                        <span className={styles.clientName}>{c.name}</span>
                        {subline ? <span className={styles.clientTrade}>{subline}</span> : null}
                      </div>
                    </div>
                  </td>
                  <td>{c.email?.trim() ? c.email : "—"}</td>
                  <td onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <span className={styles.waCellInner}>
                      <WaMark className={styles.waCellIcon} />
                      {wa ? (
                        <a
                          className={styles.waLink}
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Abrir WhatsApp de ${c.name}`}
                        >
                          {formatPhoneBrDisplay(c.whatsapp)}
                        </a>
                      ) : (
                        formatPhoneBrDisplay(c.whatsapp)
                      )}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.statusPill} ${cadastroAtivo ? styles.statusOk : styles.statusWarn}`}>
                      {cadastroAtivo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className={`${tableStyles.tailCol} ${tableStyles.rowHint}`} aria-hidden="true">
                    <span className={tableStyles.rowHintIcon}>
                      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
                        <path
                          d="M7 4L13 10L7 16"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export interface ClientsListViewProps {
  clients: ClientListItem[];
  isLoading?: boolean;
  error?: string | null;
  stats: ClientsStats;
  totalCount: number;
  sortKey: ClientListSortKey;
  sortDir: ClientListSortDir;
  onSortHeader: (key: ClientListSortKey) => void;
  onRowClick: (clientId: number) => void;
  toolbar: ReactNode;
  footerExtra?: ReactNode;
}

export function ClientsListView({
  clients,
  isLoading = false,
  error = null,
  stats,
  totalCount,
  sortKey,
  sortDir,
  onSortHeader,
  onRowClick,
  toolbar,
  footerExtra,
}: ClientsListViewProps) {
  return (
    <>
      <ClientsStatsGrid stats={stats} />

      {toolbar}

      {error ? (
        <p className={styles.msgErr} role="alert">
          {error}
        </p>
      ) : null}

      <ClientsListTable
        clients={clients}
        isLoading={isLoading}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortHeader={onSortHeader}
        onRowClick={onRowClick}
      />

      {!isLoading && !error && clients.length > 0 ? (
        <p className={styles.listFoot}>
          <span>
            Mostrando {clients.length} de {totalCount} cliente{totalCount === 1 ? "" : "s"}
          </span>
        </p>
      ) : null}

      {footerExtra}
    </>
  );
}
