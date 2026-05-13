import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import {
  countClients,
  exportClientsCsv,
  importClientsCsv,
  listClientsAll,
  type ClientOut,
  type ClientStatusFilter,
} from "../../api/clients";
import { digitsOnly, formatPhoneBrDisplay, whatsappMeUrl } from "../../lib/brMask";
import type { DashboardOutletContext } from "../dashboardContext";
import tableStyles from "../listTableCommon.module.css";
import styles from "./ClientsListPage.module.css";

type ClientSortKey = "name" | "email" | "whatsapp";
type SortDir = "asc" | "desc";

function compareText(a: string, b: string, dir: SortDir): number {
  const c = a.localeCompare(b, "pt-BR", { sensitivity: "base" });
  return dir === "asc" ? c : -c;
}

function compareDigits(a: string | null | undefined, b: string | null | undefined, dir: SortDir): number {
  const da = digitsOnly(a ?? "");
  const db = digitsOnly(b ?? "");
  if (da === db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  const maxLen = Math.max(da.length, db.length);
  const na = da.padStart(maxLen, "0");
  const nb = db.padStart(maxLen, "0");
  const cmp = na < nb ? -1 : na > nb ? 1 : 0;
  return dir === "asc" ? cmp : -cmp;
}

function initials(name: string): string {
  const chunks = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (chunks.length === 0) return "?";
  if (chunks.length === 1) return chunks[0]!.slice(0, 2).toUpperCase();
  return `${chunks[0]![0] ?? ""}${chunks[1]![0] ?? ""}`.toUpperCase();
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

function avatarClass(seed: number): string {
  const i = Math.abs(seed) % 5;
  return [styles.avatarA, styles.avatarB, styles.avatarC, styles.avatarD, styles.avatarE][i] ?? styles.avatarA;
}

export function ClientsListPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ClientOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [sortKey, setSortKey] = useState<ClientSortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [statusFilter, setStatusFilter] = useState<ClientStatusFilter>("active");
  const [totalCount, setTotalCount] = useState(0);

  const canEdit = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";

  useEffect(() => {
    const t = window.setTimeout(() => setQ(input.trim()), 400);
    return () => window.clearTimeout(t);
  }, [input]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [list, total] = await Promise.all([
        listClientsAll({ q: q || undefined, status: statusFilter }),
        countClients({ q: q || undefined, status: statusFilter }),
      ]);
      setRows(list);
      setTotalCount(total);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar.");
      setRows([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedRows = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      switch (sortKey) {
        case "name":
          return compareText(a.name.trim(), b.name.trim(), sortDir);
        case "email":
          return compareText((a.email ?? "").trim(), (b.email ?? "").trim(), sortDir);
        case "whatsapp":
          return compareDigits(a.whatsapp, b.whatsapp, sortDir);
        default:
          return 0;
      }
    });
    return list;
  }, [rows, sortKey, sortDir]);

  const totals = useMemo(() => {
    const total = totalCount;
    const empresas = rows.filter((c) => (c.tax_id_kind || "").toLowerCase() === "cnpj").length;
    const pessoas = rows.filter((c) => (c.tax_id_kind || "").toLowerCase() === "cpf").length;
    const ativos = rows.filter((c) => c.is_active).length;
    return { total, empresas, pessoas, ativos };
  }, [rows, totalCount]);

  function onSortHeader(key: ClientSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function sortAriaSort(key: ClientSortKey): "ascending" | "descending" | "none" {
    if (sortKey !== key) return "none";
    return sortDir === "asc" ? "ascending" : "descending";
  }

  async function onExportCsv() {
    setErr("");
    try {
      const blob = await exportClientsCsv({
        status: statusFilter === "all" ? "all" : statusFilter === "inactive" ? "inactive" : "active",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "clientes.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao exportar.");
    }
  }

  async function onImportCsv(file: File) {
    setErr("");
    try {
      const r = await importClientsCsv(file);
      const extra = r.errors.length ? `\nAvisos: ${r.errors.slice(0, 5).join("; ")}` : "";
      window.alert(`Importação concluída.\nCriados: ${r.created}\nAtualizados: ${r.updated}\nIgnorados: ${r.skipped}${extra}`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro na importação.");
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.heroStats}>
        <article className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Total de clientes</p>
              <p className={styles.statValue}>{totals.total}</p>
            </div>
            <span className={styles.statIconWrap} aria-hidden>
              <svg viewBox="0 0 24 24" className={styles.statIcon}>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              </svg>
            </span>
          </div>
          <p className={styles.statHint}>{totals.total > 0 ? `Cadastrados no sistema` : "Sem registros"}</p>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Empresas</p>
              <p className={styles.statValue}>{totals.empresas}</p>
            </div>
            <span className={styles.statIconWrap} aria-hidden>
              <svg viewBox="0 0 24 24" className={styles.statIcon}>
                <path d="M3 21h18" />
                <path d="M5 21V7l8-4v18" />
                <path d="M19 21V11l-6-4" />
              </svg>
            </span>
          </div>
          <p className={styles.statHint}>{totals.total ? `${Math.round((totals.empresas / totals.total) * 100)}% do total` : "0% do total"}</p>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Pessoas fisicas</p>
              <p className={styles.statValue}>{totals.pessoas}</p>
            </div>
            <span className={styles.statIconWrap} aria-hidden>
              <svg viewBox="0 0 24 24" className={styles.statIcon}>
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20a8 8 0 0 1 16 0" />
              </svg>
            </span>
          </div>
          <p className={styles.statHint}>{totals.total ? `${Math.round((totals.pessoas / totals.total) * 100)}% do total` : "0% do total"}</p>
        </article>
        <article className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Cadastro ativo</p>
              <p className={styles.statValue}>{totals.ativos}</p>
            </div>
            <span className={styles.statIconWrap} aria-hidden>
              <svg viewBox="0 0 24 24" className={styles.statIcon}>
                <circle cx="12" cy="12" r="9" />
                <path d="m8.5 12.5 2.2 2.1 4.8-5" />
              </svg>
            </span>
          </div>
          <p className={styles.statHint}>{totals.total ? `${Math.round((totals.ativos / totals.total) * 100)}% ativos` : "0% ativos"}</p>
        </article>
      </div>

      <div className={tableStyles.listToolbar}>
        <div className={tableStyles.listToolbarSearchCol}>
          <label className={tableStyles.listToolbarLabel} htmlFor="clients-search">
            Buscar
          </label>
          <div className={tableStyles.listToolbarSearchWrap}>
            <span className={tableStyles.listToolbarSearchIcon} aria-hidden>
              <svg viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <input
              id="clients-search"
              className={tableStyles.listToolbarSearchInput}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Buscar nome, documento, e-mail, telefone ou WhatsApp"
              autoComplete="off"
            />
          </div>
        </div>

        <div className={tableStyles.listToolbarActions}>
          <div className={tableStyles.listToolbarFilterBlock}>
            <label className={tableStyles.listToolbarLabel} htmlFor="clients-status">
              Status
            </label>
            <select
              id="clients-status"
              className={`${tableStyles.listToolbarSelect} ${tableStyles.listToolbarSelectShrink}`}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ClientStatusFilter)}
            >
              <option value="active">Ativos no cadastro</option>
              <option value="inactive">Inativos</option>
              <option value="all">Todos</option>
            </select>
          </div>
          <button type="button" className={tableStyles.listToolbarBtnGhost} onClick={() => void onExportCsv()}>
            <span className={tableStyles.listToolbarBtnIcon} aria-hidden>
              <svg viewBox="0 0 24 24">
                <path d="M12 3v12" />
                <path d="m7 10 5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
            </span>
            Exportar CSV
          </button>
          {ctx?.user.role === "admin" ? (
            <label className={tableStyles.listToolbarBtnGhost}>
              <input
                type="file"
                accept=".csv,text/csv"
                className={styles.fileHidden}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void onImportCsv(f);
                }}
              />
              <span className={tableStyles.listToolbarBtnIcon} aria-hidden>
                <svg viewBox="0 0 24 24">
                  <path d="M12 3v12" />
                  <path d="m17 8-5-5-5 5" />
                  <path d="M5 21h14" />
                </svg>
              </span>
              Importar CSV
            </label>
          ) : null}
          {canEdit ? (
            <Link className={tableStyles.listToolbarBtnPrimary} to="/app/clients/new">
              <span className={tableStyles.listToolbarBtnIcon} aria-hidden>
                <svg viewBox="0 0 24 24">
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
              </span>
              Novo cliente
            </Link>
          ) : null}
        </div>
      </div>

      {err ? <p className={styles.msgErr}>{err}</p> : null}

      {loading ? <p className={styles.empty}>Carregando…</p> : null}
      {!loading && !err && rows.length === 0 ? (
        <p className={styles.empty}>Nenhum cliente encontrado.</p>
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className={tableStyles.tableWrap}>
          <table className={`${tableStyles.table} ${styles.clientsTableDense}`}>
            <thead>
              <tr>
                <th
                  className={styles.sortableTh}
                  aria-sort={sortAriaSort("name")}
                >
                  <button
                    type="button"
                    className={styles.sortableThBtn}
                    onClick={() => onSortHeader("name")}
                  >
                    Nome
                    <span className={styles.sortIcon} aria-hidden>
                      <svg viewBox="0 0 24 24">
                        <path d="m8 9 4-4 4 4" />
                        <path d="m16 15-4 4-4-4" />
                      </svg>
                    </span>
                  </button>
                </th>
                <th
                  className={styles.sortableTh}
                  aria-sort={sortAriaSort("email")}
                >
                  <button
                    type="button"
                    className={styles.sortableThBtn}
                    onClick={() => onSortHeader("email")}
                  >
                    E-mail
                    {sortKey === "email" ? (
                      <span className={styles.sortIndicator}>{sortDir === "asc" ? "↑" : "↓"}</span>
                    ) : null}
                  </button>
                </th>
                <th
                  className={styles.sortableTh}
                  aria-sort={sortAriaSort("whatsapp")}
                >
                  <button
                    type="button"
                    className={styles.sortableThBtn}
                    onClick={() => onSortHeader("whatsapp")}
                  >
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
              {sortedRows.map((c) => {
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
                    onClick={() => navigate(`/app/clients/${c.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/app/clients/${c.id}`);
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
      ) : null}

      {!loading && rows.length > 0 ? (
        <p className={styles.listFoot}>
          Mostrando {sortedRows.length} de {totalCount} cliente{totalCount === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}
