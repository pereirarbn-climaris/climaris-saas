import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { createService, listServices, type ServiceOut } from "../../api/services";
import type { DashboardOutletContext } from "../dashboardContext";
import tableStyles from "../listTableCommon.module.css";
import styles from "./ServicesListPage.module.css";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 min";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}min`;
  if (h > 0) return `${h}h`;
  return `${m}min`;
}

type ServiceSort =
  | "name_asc"
  | "name_desc"
  | "duration_asc"
  | "duration_desc"
  | "price_asc"
  | "price_desc"
  | "material_asc"
  | "material_desc"
  | "profit_asc"
  | "profit_desc"
  | "status_active_first"
  | "status_inactive_first";

function WrenchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function DollarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function TrendingUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

function DuplicateIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="8" y="8" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none">
      <path d="M7 4L13 10L7 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ServicesListPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<ServiceSort>("name_asc");
  const [rows, setRows] = useState<ServiceOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [dupBusy, setDupBusy] = useState<number | null>(null);

  const canEdit = useMemo(() => ctx?.user.role === "admin" || ctx?.user.role === "receptionist", [ctx?.user.role]);

  useEffect(() => {
    const t = window.setTimeout(() => setQ(input.trim()), 350);
    return () => window.clearTimeout(t);
  }, [input]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const list = await listServices({ q: q || undefined, limit: 100 });
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

  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((s) => s.is_active).length;
    const inactive = total - active;
    const avgPrice = total > 0 ? rows.reduce((sum, s) => sum + Number(s.price || 0), 0) / total : 0;
    const totalProfit = rows.reduce((sum, s) => sum + Number(s.estimated_profit || 0), 0);
    return { total, active, inactive, avgPrice, totalProfit };
  }, [rows]);

  const sortedRows = useMemo(() => {
    const list = [...rows];
    const cmp = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" });
    const num = (a: number, b: number) => a - b;
    switch (sort) {
      case "name_asc":
        return list.sort((a, b) => cmp(a.name, b.name));
      case "name_desc":
        return list.sort((a, b) => cmp(b.name, a.name));
      case "duration_asc":
        return list.sort((a, b) => num(Number(a.duration_minutes || 0), Number(b.duration_minutes || 0)));
      case "duration_desc":
        return list.sort((a, b) => num(Number(b.duration_minutes || 0), Number(a.duration_minutes || 0)));
      case "price_asc":
        return list.sort((a, b) => num(Number(a.price || 0), Number(b.price || 0)));
      case "price_desc":
        return list.sort((a, b) => num(Number(b.price || 0), Number(a.price || 0)));
      case "material_asc":
        return list.sort((a, b) => num(Number(a.estimated_material_cost || 0), Number(b.estimated_material_cost || 0)));
      case "material_desc":
        return list.sort((a, b) => num(Number(b.estimated_material_cost || 0), Number(a.estimated_material_cost || 0)));
      case "profit_asc":
        return list.sort((a, b) => num(Number(a.estimated_profit || 0), Number(b.estimated_profit || 0)));
      case "profit_desc":
        return list.sort((a, b) => num(Number(b.estimated_profit || 0), Number(a.estimated_profit || 0)));
      case "status_active_first":
        return list.sort((a, b) => Number(b.is_active) - Number(a.is_active) || cmp(a.name, b.name));
      case "status_inactive_first":
        return list.sort((a, b) => Number(a.is_active) - Number(b.is_active) || cmp(a.name, b.name));
      default:
        return list;
    }
  }, [rows, sort]);

  async function duplicateService(s: ServiceOut, e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (!canEdit) return;
    setDupBusy(s.id);
    setErr("");
    const productInputs = (s.product_inputs ?? [])
      .map((i) => ({ product_id: i.product_id, quantity: Number(i.quantity) }))
      .filter((row) => Number.isFinite(row.product_id) && row.product_id > 0 && Number.isFinite(row.quantity) && row.quantity > 0);

    let name = `${s.name} (copia)`;
    try {
      const created = await createService({
        name,
        description: s.description,
        price: Number(s.price || 0),
        duration_minutes: Number(s.duration_minutes || 30),
        is_active: s.is_active,
        product_inputs: productInputs,
      });
      navigate(`/app/services/${created.id}`);
    } catch (e1) {
      const msg = e1 instanceof Error ? e1.message : "";
      if (msg.toLowerCase().includes("already") || msg.includes("Ja existe") || msg.includes("409")) {
        try {
          name = `${s.name} (copia ${Date.now().toString(36)})`;
          const created = await createService({
            name,
            description: s.description,
            price: Number(s.price || 0),
            duration_minutes: Number(s.duration_minutes || 30),
            is_active: s.is_active,
            product_inputs: productInputs,
          });
          navigate(`/app/services/${created.id}`);
        } catch (e2) {
          setErr(e2 instanceof Error ? e2.message : "Nao foi possivel duplicar.");
        }
      } else {
        setErr(msg || "Nao foi possivel duplicar.");
      }
    } finally {
      setDupBusy(null);
    }
  }

  return (
    <div className={styles.wrap}>
      {/* Stats Cards */}
      <div className={styles.heroStats}>
        <div className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Total de Servicos</p>
              <p className={styles.statValue}>{stats.total}</p>
            </div>
            <span className={styles.statIconWrap}>
              <WrenchIcon />
            </span>
          </div>
          <p className={styles.statHint}>Cadastrados no sistema</p>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Ativos</p>
              <p className={styles.statValue}>{stats.active}</p>
            </div>
            <span className={styles.statIconWrap}>
              <CheckCircleIcon />
            </span>
          </div>
          <p className={styles.statHint}>Disponiveis para uso</p>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Preco Medio</p>
              <p className={styles.statValue}>{formatCurrency(stats.avgPrice)}</p>
            </div>
            <span className={styles.statIconWrap}>
              <DollarIcon />
            </span>
          </div>
          <p className={styles.statHint}>Por servico</p>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Lucro Total Est.</p>
              <p className={styles.statValue}>{formatCurrency(stats.totalProfit)}</p>
            </div>
            <span className={styles.statIconWrap}>
              <TrendingUpIcon />
            </span>
          </div>
          <p className={styles.statHint}>Todos os servicos</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className={tableStyles.listToolbar}>
        <div className={tableStyles.listToolbarSearchCol}>
          <label className={tableStyles.listToolbarLabel} htmlFor="services-search">
            Buscar
          </label>
          <div className={tableStyles.listToolbarSearchWrap}>
            <span className={tableStyles.listToolbarSearchIcon}>
              <SearchIcon />
            </span>
            <input
              id="services-search"
              className={tableStyles.listToolbarSearchInput}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Nome ou descricao"
              autoComplete="off"
            />
          </div>
        </div>
        <div className={tableStyles.listToolbarFilterCol}>
          <label className={tableStyles.listToolbarLabel} htmlFor="services-sort">
            Ordenar
          </label>
          <select
            id="services-sort"
            className={tableStyles.listToolbarSelect}
            value={sort}
            onChange={(e) => setSort(e.target.value as ServiceSort)}
          >
            <option value="name_asc">Nome (A - Z)</option>
            <option value="name_desc">Nome (Z - A)</option>
            <option value="duration_asc">Tempo (menor - maior)</option>
            <option value="duration_desc">Tempo (maior - menor)</option>
            <option value="price_asc">Preco (menor - maior)</option>
            <option value="price_desc">Preco (maior - menor)</option>
            <option value="material_asc">Custo materiais (menor - maior)</option>
            <option value="material_desc">Custo materiais (maior - menor)</option>
            <option value="profit_asc">Lucro estimado (menor - maior)</option>
            <option value="profit_desc">Lucro estimado (maior - menor)</option>
            <option value="status_active_first">Status (Ativo primeiro)</option>
            <option value="status_inactive_first">Status (Inativo primeiro)</option>
          </select>
        </div>
        {canEdit ? (
          <Link className={tableStyles.listToolbarBtnPrimary} to="/app/services/new">
            <PlusIcon />
            Novo servico
          </Link>
        ) : null}
      </div>

      {err ? <p className={styles.msgErr}>{err}</p> : null}

      {loading ? <p className={styles.empty}>Carregando...</p> : null}
      {!loading && !err && rows.length === 0 ? <p className={styles.empty}>Nenhum servico encontrado.</p> : null}

      {!loading && rows.length > 0 ? (
        <div className={styles.tableCard}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Servico</th>
                  <th>Tempo</th>
                  <th>Preco</th>
                  <th>Custo Mat.</th>
                  <th>Lucro Est.</th>
                  <th>Status</th>
                  <th className={styles.actionsCol} aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((s) => {
                  const profit = Number(s.estimated_profit || 0);
                  return (
                    <tr
                      key={s.id}
                      onClick={() => navigate(`/app/services/${s.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/app/services/${s.id}`);
                        }
                      }}
                      role="link"
                      tabIndex={0}
                      aria-label={`Abrir servico ${s.name}`}
                    >
                      <td>
                        <div className={styles.serviceCell}>
                          <div className={styles.serviceIcon}>
                            <WrenchIcon />
                          </div>
                          <div className={styles.serviceInfo}>
                            <span className={styles.serviceName}>{s.name}</span>
                            {s.description ? (
                              <span className={styles.serviceDesc}>{s.description}</span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={styles.durationCell}>
                          <ClockIcon />
                          {formatDuration(Number(s.duration_minutes || 0))}
                        </span>
                      </td>
                      <td>
                        <span className={styles.currencyCell}>
                          {formatCurrency(Number(s.price || 0))}
                        </span>
                      </td>
                      <td>
                        <span className={styles.currencyCell}>
                          {formatCurrency(Number(s.estimated_material_cost || 0))}
                        </span>
                      </td>
                      <td>
                        <span className={profit >= 0 ? styles.profitPositive : styles.profitNegative}>
                          {formatCurrency(profit)}
                        </span>
                      </td>
                      <td>
                        <span className={s.is_active ? styles.statusActive : styles.statusInactive}>
                          {s.is_active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className={styles.actionsCol}>
                        <div className={styles.rowActions}>
                          {canEdit ? (
                            <button
                              type="button"
                              className={styles.iconCellBtn}
                              title="Duplicar servico"
                              aria-label="Duplicar servico"
                              disabled={dupBusy === s.id}
                              onClick={(e) => void duplicateService(s, e)}
                            >
                              <DuplicateIcon />
                            </button>
                          ) : null}
                          <span className={styles.rowArrow} aria-hidden>
                            <ChevronRightIcon />
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
