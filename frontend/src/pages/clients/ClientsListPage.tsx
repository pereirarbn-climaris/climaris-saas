import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { listClients, type ClientOut } from "../../api/clients";
import { digitsOnly, formatPhoneBrDisplay, whatsappMeUrl } from "../../lib/brMask";
import type { DashboardOutletContext } from "../dashboardContext";
import tableStyles from "../listTableCommon.module.css";
import styles from "./ClientsListPage.module.css";

type ClientSortKey = "name" | "email" | "phone" | "whatsapp";
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

  const canEdit = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";

  useEffect(() => {
    const t = window.setTimeout(() => setQ(input.trim()), 400);
    return () => window.clearTimeout(t);
  }, [input]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const list = await listClients({ q: q || undefined, limit: 100 });
      setRows(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [q]);

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
        case "phone":
          return compareDigits(a.phone, b.phone, sortDir);
        case "whatsapp":
          return compareDigits(a.whatsapp, b.whatsapp, sortDir);
        default:
          return 0;
      }
    });
    return list;
  }, [rows, sortKey, sortDir]);

  const totals = useMemo(() => {
    const total = rows.length;
    const empresas = rows.filter((c) => (c.tax_id_kind || "").toLowerCase() === "cnpj").length;
    const pessoas = rows.filter((c) => (c.tax_id_kind || "").toLowerCase() === "cpf").length;
    const ativos = rows.filter((c) => Boolean((c.email ?? "").trim() || (c.phone ?? "").trim() || (c.whatsapp ?? "").trim())).length;
    return { total, empresas, pessoas, ativos };
  }, [rows]);

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
              <p className={styles.statLabel}>Ativos</p>
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

      <div className={styles.toolbar}>
        <div className={styles.searchCol}>
          <label className={styles.searchLabel} htmlFor="clients-search">
            Buscar
          </label>
          <div className={styles.searchInputWrap}>
            <span className={styles.searchIcon} aria-hidden>
              <svg viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <input
              id="clients-search"
              className={styles.searchInput}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Buscar nome, documento, e-mail, telefone ou WhatsApp"
              autoComplete="off"
            />
          </div>
        </div>

        <div className={styles.toolbarActions}>
          <button type="button" className={styles.btnGhost}>
            <span className={styles.btnIcon} aria-hidden>
              <svg viewBox="0 0 24 24">
                <path d="M4 6h16" />
                <path d="M7 12h10" />
                <path d="M10 18h4" />
              </svg>
            </span>
            Filtros
          </button>
          <button type="button" className={styles.btnGhost}>
            <span className={styles.btnIcon} aria-hidden>
              <svg viewBox="0 0 24 24">
                <path d="M12 3v12" />
                <path d="m7 10 5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
            </span>
            Exportar
          </button>
          {canEdit ? (
            <Link className={styles.btnPrimary} to="/app/clients/new">
              <span className={styles.btnIcon} aria-hidden>
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
          <table className={tableStyles.table}>
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
                  aria-sort={sortAriaSort("phone")}
                >
                  <button
                    type="button"
                    className={styles.sortableThBtn}
                    onClick={() => onSortHeader("phone")}
                  >
                    Telefone
                    {sortKey === "phone" ? (
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
                    WhatsApp
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
                const ativo = Boolean((c.email ?? "").trim() || (c.phone ?? "").trim() || (c.whatsapp ?? "").trim());
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
                          {c.trade_name ? (
                            <span className={styles.clientTrade}>{c.trade_name}</span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td>{c.email?.trim() ? c.email : "—"}</td>
                    <td>{formatPhoneBrDisplay(c.phone)}</td>
                    <td onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
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
                    </td>
                    <td>
                      <span className={`${styles.statusPill} ${ativo ? styles.statusOk : styles.statusWarn}`}>
                        {ativo ? "Ativo" : "Inativo"}
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
        <p className={styles.listFoot}>Mostrando {sortedRows.length} de {rows.length} clientes</p>
      ) : null}
    </div>
  );
}
