import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { createProduct, importProductsFile, listProducts, type ProductOut } from "../../api/products";
import type { DashboardOutletContext } from "../dashboardContext";
import tableStyles from "../listTableCommon.module.css";
import styles from "./ProductsListPage.module.css";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

type ProductSort =
  | "name_asc"
  | "name_desc"
  | "sku_asc"
  | "sku_desc"
  | "purchase_asc"
  | "purchase_desc"
  | "sale_asc"
  | "sale_desc"
  | "margin_asc"
  | "margin_desc"
  | "status_active_first"
  | "status_inactive_first";

function marginOf(p: ProductOut): number {
  return Number((p.sale_price || p.unit_price || 0) - (p.purchase_price || 0));
}

function makeDuplicateSku(baseSku: string): string {
  const suffix = `-${Date.now().toString(36).slice(-8)}`;
  const max = 50;
  const room = max - suffix.length;
  const trimmed = baseSku.trim().slice(0, Math.max(1, room));
  return (trimmed + suffix).slice(0, max);
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
      <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 4L12 14.01l-3-3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AlertTriangleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function TrendingUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="17 6 23 6 23 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
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

function ImportIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 4v10m0 0l-4-4m4 4l4-4M5 16.5v1A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5v-1"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ProductsListPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<ProductSort>("name_asc");
  const [rows, setRows] = useState<ProductOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [dupBusy, setDupBusy] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canEdit = useMemo(() => ctx?.user.role === "admin" || ctx?.user.role === "receptionist", [ctx?.user.role]);

  useEffect(() => {
    const t = window.setTimeout(() => setQ(input.trim()), 350);
    return () => window.clearTimeout(t);
  }, [input]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const list = await listProducts({ q: q || undefined, limit: 100 });
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
    const active = rows.filter(p => p.is_active).length;
    const inactive = total - active;
    const avgMargin = total > 0 
      ? rows.reduce((acc, p) => acc + marginOf(p), 0) / total 
      : 0;
    return { total, active, inactive, avgMargin };
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
      case "sku_asc":
        return list.sort((a, b) => cmp(a.sku, b.sku));
      case "sku_desc":
        return list.sort((a, b) => cmp(b.sku, a.sku));
      case "purchase_asc":
        return list.sort((a, b) => num(Number(a.purchase_price || 0), Number(b.purchase_price || 0)));
      case "purchase_desc":
        return list.sort((a, b) => num(Number(b.purchase_price || 0), Number(a.purchase_price || 0)));
      case "sale_asc":
        return list.sort((a, b) =>
          num(Number(a.sale_price || a.unit_price || 0), Number(b.sale_price || b.unit_price || 0)),
        );
      case "sale_desc":
        return list.sort((a, b) =>
          num(Number(b.sale_price || b.unit_price || 0), Number(a.sale_price || a.unit_price || 0)),
        );
      case "margin_asc":
        return list.sort((a, b) => num(marginOf(a), marginOf(b)));
      case "margin_desc":
        return list.sort((a, b) => num(marginOf(b), marginOf(a)));
      case "status_active_first":
        return list.sort((a, b) => Number(b.is_active) - Number(a.is_active) || cmp(a.name, b.name));
      case "status_inactive_first":
        return list.sort((a, b) => Number(a.is_active) - Number(b.is_active) || cmp(a.name, b.name));
      default:
        return list;
    }
  }, [rows, sort]);

  async function duplicateProduct(p: ProductOut, e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (!canEdit) return;
    setDupBusy(p.id);
    setErr("");
    setOk("");
    try {
      const created = await createProduct({
        name: `${p.name} (copia)`,
        sku: makeDuplicateSku(p.sku || "SKU"),
        purchase_price: Number(p.purchase_price || 0),
        sale_price: Number(p.sale_price || p.unit_price || 0),
        is_active: p.is_active,
      });
      navigate(`/app/products/${created.id}`);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Nao foi possivel duplicar.");
    } finally {
      setDupBusy(null);
    }
  }

  async function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!canEdit) return;

    setImporting(true);
    setErr("");
    setOk("");
    try {
      const lowerName = file.name.toLowerCase();
      if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".csv")) {
        throw new Error("Formato invalido. Selecione um arquivo .xlsx ou .csv.");
      }
      const result = await importProductsFile(file);
      await load();
      const base = `Importacao finalizada: ${result.created_count} criados`;
      const skipped = result.skipped_count ? `, ${result.skipped_count} ignorados (SKU ja existente/duplicado).` : ".";
      const details =
        result.error_count > 0
          ? ` ${result.error_count} linhas com erro: ${result.errors
              .slice(0, 3)
              .map((x) => `linha ${x.row_number} (${x.message})`)
              .join("; ")}${result.errors.length > 3 ? "..." : ""}`
          : "";
      setOk(`${base}${skipped}${details}`);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Nao foi possivel importar a planilha.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className={styles.wrap}>
      {/* Stats Cards */}
      <div className={styles.heroStats}>
        <div className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Total de Produtos</p>
              <p className={styles.statValue}>{stats.total}</p>
            </div>
            <div className={styles.statIconWrap}>
              <PackageIcon />
            </div>
          </div>
          <p className={styles.statHint}>Cadastrados no sistema</p>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Produtos Ativos</p>
              <p className={styles.statValue}>{stats.active}</p>
            </div>
            <div className={styles.statIconWrap}>
              <CheckCircleIcon />
            </div>
          </div>
          <p className={styles.statHint}>Disponiveis para venda</p>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Produtos Inativos</p>
              <p className={styles.statValue}>{stats.inactive}</p>
            </div>
            <div className={styles.statIconWrap}>
              <AlertTriangleIcon />
            </div>
          </div>
          <p className={styles.statHint}>Fora de catalogo</p>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statHead}>
            <div>
              <p className={styles.statLabel}>Margem Media</p>
              <p className={styles.statValue}>{formatCurrency(stats.avgMargin)}</p>
            </div>
            <div className={styles.statIconWrap}>
              <TrendingUpIcon />
            </div>
          </div>
          <p className={styles.statHint}>Por produto</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchCol}>
          <label className={styles.searchLabel} htmlFor="products-search">
            Buscar
          </label>
          <div className={styles.searchInputWrap}>
            <span className={styles.searchIcon}>
              <SearchIcon />
            </span>
            <input
              id="products-search"
              className={styles.searchInput}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Nome ou SKU do produto..."
              autoComplete="off"
            />
          </div>
        </div>

        <div className={styles.filterCol}>
          <label className={styles.searchLabel} htmlFor="products-sort">
            Ordenar por
          </label>
          <select
            id="products-sort"
            className={styles.selectInput}
            value={sort}
            onChange={(e) => setSort(e.target.value as ProductSort)}
          >
            <option value="name_asc">Nome (A - Z)</option>
            <option value="name_desc">Nome (Z - A)</option>
            <option value="sku_asc">SKU (A - Z)</option>
            <option value="sku_desc">SKU (Z - A)</option>
            <option value="purchase_asc">Compra (menor - maior)</option>
            <option value="purchase_desc">Compra (maior - menor)</option>
            <option value="sale_asc">Venda (menor - maior)</option>
            <option value="sale_desc">Venda (maior - menor)</option>
            <option value="margin_asc">Margem (menor - maior)</option>
            <option value="margin_desc">Margem (maior - menor)</option>
            <option value="status_active_first">Status (Ativo primeiro)</option>
            <option value="status_inactive_first">Status (Inativo primeiro)</option>
          </select>
        </div>

        <div className={styles.toolbarActions}>
          {canEdit ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv"
                className={styles.fileInputHidden}
                onChange={(e) => void onPickFile(e)}
              />
              <button
                type="button"
                className={styles.iconToolbarBtn}
                title="Importar planilha de produtos"
                aria-label="Importar planilha de produtos"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
              >
                <ImportIcon />
              </button>
            </>
          ) : null}
          {canEdit ? (
            <Link className={styles.btnPrimary} to="/app/products/new">
              <span className={styles.btnIcon}>
                <PlusIcon />
              </span>
              Novo produto
            </Link>
          ) : null}
        </div>
      </div>

      {err ? <p className={styles.msgErr}>{err}</p> : null}
      {ok ? <p className={styles.msgOk}>{ok}</p> : null}
      {canEdit ? (
        <p className={styles.msgHint}>
          Baixe a planilha modelo em{" "}
          <a href="/modelos/importacao-produtos-modelo.csv" download>
            importacao-produtos-modelo.csv
          </a>{" "}
          e preencha uma informacao por coluna (nome, sku, preco_compra, preco_venda, estoque_inicial, ativo).
        </p>
      ) : null}

      {loading ? <p className={styles.empty}>Carregando...</p> : null}
      {!loading && !err && rows.length === 0 ? <p className={styles.empty}>Nenhum produto encontrado.</p> : null}

      {!loading && rows.length > 0 ? (
        <div className={styles.tableContainer}>
          <div className={tableStyles.tableWrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Compra</th>
                  <th>Venda</th>
                  <th>Margem</th>
                  <th>Status</th>
                  <th className={tableStyles.tailActionsCol} aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((p) => {
                  const margin = marginOf(p);
                  return (
                    <tr
                      key={p.id}
                      className={tableStyles.rowClickable}
                      onClick={() => navigate(`/app/products/${p.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/app/products/${p.id}`);
                        }
                      }}
                      role="link"
                      tabIndex={0}
                      aria-label={`Abrir produto ${p.name}`}
                    >
                      <td>
                        <div className={styles.productCell}>
                          <div className={styles.productIcon}>
                            <PackageIcon />
                          </div>
                          <div className={styles.productInfo}>
                            <span className={styles.productName}>{p.name}</span>
                            <span className={styles.productSku}>{p.sku}</span>
                          </div>
                        </div>
                      </td>
                      <td className={styles.priceCell}>{formatCurrency(Number(p.purchase_price || 0))}</td>
                      <td className={styles.priceCell}>{formatCurrency(Number(p.sale_price || p.unit_price || 0))}</td>
                      <td className={`${styles.marginCell} ${margin >= 0 ? styles.marginPositive : styles.marginNegative}`}>
                        {formatCurrency(margin)}
                      </td>
                      <td>
                        <span className={p.is_active ? styles.statusActive : styles.statusInactive}>
                          {p.is_active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className={`${tableStyles.tailActionsCol} ${tableStyles.rowHint}`}>
                        <div className={tableStyles.rowActions}>
                          {canEdit ? (
                            <button
                              type="button"
                              className={styles.iconCellBtn}
                              title="Duplicar produto"
                              aria-label="Duplicar produto"
                              disabled={dupBusy === p.id}
                              onClick={(e) => void duplicateProduct(p, e)}
                            >
                              <DuplicateIcon />
                            </button>
                          ) : null}
                          <span className={tableStyles.rowHintIcon} aria-hidden>
                            <svg viewBox="0 0 20 20" fill="none" focusable="false">
                              <path
                                d="M7 4L13 10L7 16"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className={styles.listFoot}>
            Mostrando {sortedRows.length} de {rows.length} produtos
          </p>
        </div>
      ) : null}
    </div>
  );
}
