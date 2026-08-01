import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { patchTenantAdmin } from "../../api/auth";
import {
  countProducts,
  createProduct,
  importProductsFile,
  listProducts,
  type ProductListSort,
  type ProductOut,
} from "../../api/products";
import { ProductsListTable } from "../../components/products";
import { CatalogListHeaderActions } from "../../components/ui/CatalogListHeaderActions";
import { ListPaginationBar } from "../../components/ui/list-pagination";
import { FormSwitch } from "../../components/ui/form-switch";
import { ImportSpreadsheetModal } from "../../components/ui/ImportSpreadsheetModal";
import type { DashboardOutletContext } from "../dashboardContext";
import { isInventoryActive, isInventoryAllowedByPlan } from "../../lib/planProducts";
import tableStyles from "../listTableCommon.module.css";
import styles from "./ProductsListPage.module.css";

const PRODUCTS_PAGE_SIZE = 20;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
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

const PRODUCT_IMPORT_CSV_TEMPLATE = "/modelos/importacao-produtos-modelo.csv";
const PRODUCT_IMPORT_XLSX_TEMPLATE = "/modelos/importacao-produtos-modelo.xlsx";
const ACCEPTED_IMPORT_EXTENSIONS = [".csv", ".xlsx"];

export function ProductsListPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<ProductListSort>("name_asc");
  const [rows, setRows] = useState<ProductOut[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, avgMargin: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [dupBusy, setDupBusy] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importDragActive, setImportDragActive] = useState(false);
  const [importFileLabel, setImportFileLabel] = useState<string | null>(null);
  const [savingInventory, setSavingInventory] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches,
  );

  const inventoryAllowed = isInventoryAllowedByPlan(ctx?.tenant);
  const inventoryEnabled = isInventoryActive(ctx?.tenant);
  const isAdmin = ctx?.user.role === "admin";
  const canEdit = useMemo(() => ctx?.user.role === "admin" || ctx?.user.role === "receptionist", [ctx?.user.role]);

  useEffect(() => {
    const t = window.setTimeout(() => setQ(input.trim()), 350);
    return () => window.clearTimeout(t);
  }, [input]);

  useEffect(() => {
    setPage(1);
  }, [q, sort]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PRODUCTS_PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    const safePage = Math.max(1, page);
    const skip = (safePage - 1) * PRODUCTS_PAGE_SIZE;
    try {
      const [list, counts] = await Promise.all([
        listProducts({ q: q || undefined, skip, limit: PRODUCTS_PAGE_SIZE, sort }),
        countProducts({ q: q || undefined }),
      ]);
      setRows(list);
      setTotalCount(counts.total);
      setStats({
        total: counts.total,
        active: counts.active,
        inactive: counts.inactive,
        avgMargin: counts.avg_margin,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar.");
      setRows([]);
      setTotalCount(0);
      setStats({ total: 0, active: 0, inactive: 0, avgMargin: 0 });
    } finally {
      setLoading(false);
    }
  }, [q, sort, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const pagination = useMemo(
    () => ({
      currentPage: page,
      totalPages,
      totalItems: totalCount,
      itemsPerPage: PRODUCTS_PAGE_SIZE,
      onPageChange: setPage,
    }),
    [page, totalPages, totalCount],
  );

  async function toggleInventoryEnabled() {
    if (!isAdmin || savingInventory || !inventoryAllowed) return;
    setSavingInventory(true);
    setErr("");
    try {
      await patchTenantAdmin({ inventory_enabled: !inventoryEnabled });
      await ctx?.refreshWorkspace();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível salvar a preferência de estoque.");
    } finally {
      setSavingInventory(false);
    }
  }

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

  function closeImportModal() {
    setImportModalOpen(false);
    setImportDragActive(false);
    setImportFileLabel(null);
  }

  function isAcceptedImportFile(file: File): boolean {
    const lowerName = file.name.toLowerCase();
    return ACCEPTED_IMPORT_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  }

  async function importFile(file: File) {
    if (!canEdit) return;
    if (!isAcceptedImportFile(file)) {
      throw new Error("Formato invalido. Selecione um arquivo .csv ou .xlsx.");
    }

    setImporting(true);
    setErr("");
    setOk("");
    try {
      const result = await importProductsFile(file);
      closeImportModal();
      setPage(1);
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

  useEffect(() => {
    if (!importModalOpen) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape" && !importing) closeImportModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [importModalOpen, importing]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const sync = () => setIsMobileLayout(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <div className={`${styles.wrap} ${isMobileLayout ? styles.wrapMobile : ""}`}>
      <nav className={styles.breadcrumb} aria-label="Navegação">
        <Link className={styles.breadcrumbLink} to="/app/products">
          Produtos
        </Link>
        <span className={styles.breadcrumbSep} aria-hidden>
          /
        </span>
        <span className={styles.breadcrumbCurrent}>Lista</span>
      </nav>

      <header className={`${styles.headerRow} ${isMobileLayout ? styles.mobileHeader : ""}`}>
        <div className={styles.headerMain}>
          <span className={styles.headerIcon} aria-hidden>
            <PackageIcon />
          </span>
          <div>
            <h1 className={styles.headerTitle}>Produtos</h1>
            <p className={styles.headerSubtitle}>Gerencie equipamentos, peças, materiais e estoque da sua empresa.</p>
          </div>
        </div>
        {canEdit && !isMobileLayout ? (
          <CatalogListHeaderActions
            showImport
            importing={importing}
            onImport={() => setImportModalOpen(true)}
            importTitle="Importar planilha de produtos"
            newHref="/app/products/new"
            newLabel="Novo produto"
          />
        ) : null}
      </header>

      <div className={`${styles.heroStats} ${styles.heroStatsDesktop}`}>
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

      <div className={`${tableStyles.listToolbar} ${styles.productsToolbar}`}>
        <div className={`${tableStyles.listToolbarSearchCol} ${styles.productsToolbarSearchCol}`}>
          <label className={tableStyles.listToolbarLabel} htmlFor="products-search">
            Buscar
          </label>
          <div className={tableStyles.listToolbarSearchWrap}>
            <span className={tableStyles.listToolbarSearchIcon}>
              <SearchIcon />
            </span>
            <input
              id="products-search"
              className={tableStyles.listToolbarSearchInput}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Nome ou SKU do produto..."
              autoComplete="off"
            />
          </div>
        </div>

        <div className={`${tableStyles.listToolbarFilterCol} ${styles.hideOnMobile}`}>
          <label className={tableStyles.listToolbarLabel} htmlFor="products-sort">
            Ordenar por
          </label>
          <select
            id="products-sort"
            className={tableStyles.listToolbarSelect}
            value={sort}
            onChange={(e) => setSort(e.target.value as ProductListSort)}
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

        {isAdmin && inventoryAllowed ? (
          <div className={`${styles.inventoryToggleCol} ${styles.hideOnMobile}`}>
            <span className={tableStyles.listToolbarLabel}>Controle de estoque</span>
            <div className={styles.inventoryToggleRow}>
              <FormSwitch
                id="products-inventory-enabled"
                checked={inventoryEnabled}
                disabled={savingInventory || loading}
                ariaLabel="Ativar controle de estoque"
                onChange={() => void toggleInventoryEnabled()}
              />
              <span className={styles.inventoryToggleState}>{inventoryEnabled ? "Ligado" : "Desligado"}</span>
            </div>
            <p className={styles.inventoryToggleHint}>
              {inventoryEnabled
                ? "Exibe fisico, reservado e disponivel na listagem."
                : "Oculta colunas de estoque para quem nao controla almoxarifado."}
            </p>
          </div>
        ) : null}
      </div>

      {err ? <p className={styles.msgErr}>{err}</p> : null}
      {ok ? <p className={styles.msgOk}>{ok}</p> : null}

      <ImportSpreadsheetModal
        open={importModalOpen}
        title="Importar produtos"
        titleId="products-import-title"
        importing={importing}
        dragActive={importDragActive}
        fileLabel={importFileLabel}
        csvTemplateUrl={PRODUCT_IMPORT_CSV_TEMPLATE}
        xlsxTemplateUrl={PRODUCT_IMPORT_XLSX_TEMPLATE}
        formatsMeta="Formatos aceitos: CSV, XLSX. Colunas obrigatorias: nome e sku. Opcionais: preco_compra, preco_venda, estoque_inicial e ativo."
        onClose={closeImportModal}
        onDragActiveChange={setImportDragActive}
        onFile={(file) => {
          setImportFileLabel(file.name);
          void importFile(file);
        }}
      />

      {loading ? <p className={styles.empty}>Carregando...</p> : null}
      {!loading && !err && totalCount === 0 ? <p className={styles.empty}>Nenhum produto encontrado.</p> : null}

      {!loading && rows.length > 0 ? (
        <>
          {isMobileLayout ? (
            <div className={styles.mobileCardsGrid}>
              {rows.map((p) => (
                <article key={p.id} className={styles.mobileProductCard}>
                  <button
                    type="button"
                    className={styles.mobileProductCardTap}
                    onClick={() => navigate(`/app/products/${p.id}`)}
                    aria-label={`Abrir produto ${p.name}`}
                  >
                    <div className={styles.mobileProductTop}>
                      <div className={styles.mobileProductImageWrap}>
                        {p.primary_image_url ? (
                          <img src={p.primary_image_url} alt="" className={styles.mobileProductImage} />
                        ) : (
                          <span className={styles.mobileProductImageFallback} aria-hidden>
                            <PackageIcon />
                          </span>
                        )}
                      </div>
                      <div className={styles.mobileProductInfo}>
                        <h3 className={styles.mobileProductName}>{p.name}</h3>
                        <p className={styles.mobileProductSku}>SKU: {p.sku}</p>
                      </div>
                    </div>
                    <p className={styles.mobileProductPrice}>{formatCurrency(Number(p.sale_price || p.unit_price || 0))}</p>
                    <span className={styles.mobileProductAction}>Ver Detalhes</span>
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <ProductsListTable
              rows={rows}
              canEdit={canEdit}
              canOpenDetail={canEdit}
              dupBusy={dupBusy}
              onDuplicate={(p, e) => void duplicateProduct(p, e)}
              productIcon={<PackageIcon />}
              duplicateIcon={<DuplicateIcon />}
              showStock={inventoryEnabled}
            />
          )}
          {totalCount > 0 ? (
            <div className={styles.listFoot}>
              <ListPaginationBar {...pagination} itemLabel="produto" />
            </div>
          ) : null}
        </>
      ) : null}

      {isMobileLayout && canEdit ? (
        <button type="button" className={styles.mobileNewProductFab} onClick={() => navigate("/app/products/new")}>
          + Adicionar Novo Produto
        </button>
      ) : null}
    </div>
  );
}
