import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useOutletContext } from "react-router-dom";
import {
  countClients,
  exportClientsCsv,
  importClientsCsv,
  listClients,
  type ClientOut,
  type ClientStatusFilter,
} from "../../api/clients";
import {
  ClientsListView,
  type ClientListSortKey,
  type ClientListSortDir,
} from "../../components/v0-ui/clients";
import { CatalogListHeaderActions } from "../../components/ui/CatalogListHeaderActions";
import { ImportSpreadsheetModal } from "../../components/ui/ImportSpreadsheetModal";
import { minhaAgendaClientsFileToClimarisCsvFile } from "../../lib/minhaAgendaClientImport";
import type { DashboardOutletContext } from "../dashboardContext";
import tableStyles from "../listTableCommon.module.css";
import listStyles from "../../components/v0-ui/clients/clients-list.module.css";
import { toast } from "../../lib/toast";

const CLIENTS_PAGE_SIZE = 20;
const CLIENT_IMPORT_CSV_TEMPLATE = "/modelos/importacao-clientes-modelo.csv";
const CLIENT_IMPORT_XLSX_TEMPLATE = "/modelos/importacao-clientes-modelo.xlsx";
const ACCEPTED_IMPORT_EXTENSIONS = [".csv", ".xlsx"];

export function ClientsListPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [clients, setClients] = useState<ClientOut[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importOk, setImportOk] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<ClientListSortKey>("name");
  const [sortDir, setSortDir] = useState<ClientListSortDir>("asc");
  const [statusFilter, setStatusFilter] = useState<ClientStatusFilter>("active");
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, empresas: 0, pessoas: 0, ativos: 0 });
  const [page, setPage] = useState(1);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importSource, setImportSource] = useState<"climaris" | "minha_agenda" | null>(null);
  const [importing, setImporting] = useState(false);
  const [importDragActive, setImportDragActive] = useState(false);
  const [importFileLabel, setImportFileLabel] = useState<string | null>(null);

  const canEdit = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";
  const canImport = ctx?.user.role === "admin";

  useEffect(() => {
    const t = window.setTimeout(() => setQ(input.trim()), 400);
    return () => window.clearTimeout(t);
  }, [input]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  useEffect(() => {
    if (importOk) toast.success(importOk);
  }, [importOk]);

  useEffect(() => {
    setPage(1);
  }, [q, statusFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(totalCount / CLIENTS_PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const safePage = Math.max(1, page);
    const skip = (safePage - 1) * CLIENTS_PAGE_SIZE;
    try {
      const [list, counts] = await Promise.all([
        listClients({
          q: q || undefined,
          status: statusFilter,
          skip,
          limit: CLIENTS_PAGE_SIZE,
          sortKey,
          sortDir,
        }),
        countClients({ q: q || undefined, status: statusFilter }),
      ]);
      setClients(list);
      setTotalCount(counts.total);
      setStats({
        total: counts.total,
        empresas: counts.empresas,
        pessoas: counts.pessoas,
        ativos: counts.ativos,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar clientes.");
      setClients([]);
      setTotalCount(0);
      setStats({ total: 0, empresas: 0, pessoas: 0, ativos: 0 });
    } finally {
      setIsLoading(false);
    }
  }, [q, statusFilter, sortKey, sortDir, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function onSortHeader(key: ClientListSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const pagination = useMemo(
    () => ({
      currentPage: page,
      totalPages,
      totalItems: totalCount,
      itemsPerPage: CLIENTS_PAGE_SIZE,
      onPageChange: setPage,
    }),
    [page, totalPages, totalCount],
  );

  function closeImportModal() {
    setImportModalOpen(false);
    setImportSource(null);
    setImportDragActive(false);
    setImportFileLabel(null);
  }

  function isAcceptedImportFile(file: File): boolean {
    const lowerName = file.name.toLowerCase();
    return ACCEPTED_IMPORT_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  }

  async function onExportCsv() {
    setError(null);
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
      setError(e instanceof Error ? e.message : "Erro ao exportar.");
    }
  }

  async function importFile(file: File) {
    if (!canImport) return;
    if (!importSource) {
      setError("Selecione a origem do arquivo antes de importar.");
      return;
    }
    if (!isAcceptedImportFile(file)) {
      setError("Formato invalido. Selecione um arquivo .csv ou .xlsx.");
      return;
    }
    if (importSource === "minha_agenda" && !file.name.toLowerCase().endsWith(".csv")) {
      setError("Arquivos da Minha Agenda devem estar em CSV (use Salvar como CSV no Excel).");
      return;
    }

    setImporting(true);
    setError(null);
    setImportOk(null);
    setImportFileLabel(file.name);
    try {
      const payload =
        importSource === "minha_agenda" ? await minhaAgendaClientsFileToClimarisCsvFile(file) : file;
      const r = await importClientsCsv(payload);
      closeImportModal();
      setPage(1);
      await load();
      const extra = r.errors.length ? ` Avisos: ${r.errors.slice(0, 5).join("; ")}` : "";
      setImportOk(`Importacao concluida: ${r.created} criados, ${r.updated} atualizados, ${r.skipped} ignorados.${extra}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro na importacao.");
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

  const toolbar = (
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
        <button type="button" className={`${tableStyles.listToolbarBtnGhost} ${listStyles.hideOnMobile}`} onClick={() => void onExportCsv()}>
          <span className={tableStyles.listToolbarBtnIcon} aria-hidden>
            <svg viewBox="0 0 24 24">
              <path d="M12 3v12" />
              <path d="m7 10 5 5 5-5" />
              <path d="M5 21h14" />
            </svg>
          </span>
          Exportar CSV
        </button>
      </div>
    </div>
  );

  const importModal = (
    <ImportSpreadsheetModal
      open={importModalOpen}
      title="Importar clientes"
      titleId="clients-import-title"
      importing={importing}
      dragActive={importDragActive}
      fileLabel={importFileLabel}
      csvTemplateUrl={CLIENT_IMPORT_CSV_TEMPLATE}
      xlsxTemplateUrl={CLIENT_IMPORT_XLSX_TEMPLATE}
      disabled={!importSource}
      formatsMeta="Formatos aceitos: CSV, XLSX. Coluna obrigatoria: name (nome). Para Climaris, use o modelo ou exportacao desta tela."
      dropHint={
        importSource
          ? "Arraste e solte o arquivo aqui, ou clique para selecionar."
          : "Escolha a origem do arquivo abaixo antes de enviar a planilha."
      }
      onClose={closeImportModal}
      onDragActiveChange={setImportDragActive}
      onFile={(file) => void importFile(file)}
    >
      <section>
        <p className={listStyles.importSourceSectionTitle}>Origem do arquivo</p>
        <p className={listStyles.importSourceSectionHint}>
          Selecione de qual sistema veio a planilha. Minha Agenda aceita apenas CSV; Climaris aceita CSV ou XLSX.
        </p>
        <ul className={listStyles.importSourceList}>
          <li>
            <button
              type="button"
              className={`${listStyles.importSourceCard} ${importSource === "minha_agenda" ? listStyles.importSourceCardSelected : ""}`}
              onClick={() => setImportSource("minha_agenda")}
            >
              <span className={listStyles.importSourceName}>Minha Agenda</span>
              <span className={listStyles.importSourceHint}>
                Exportacao com colunas Nome, Telefone, Endereco, E-mail, CPF etc. Use CSV UTF-8 (no Excel: Salvar como CSV).
              </span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className={`${listStyles.importSourceCard} ${importSource === "climaris" ? listStyles.importSourceCardSelected : ""}`}
              onClick={() => setImportSource("climaris")}
            >
              <span className={listStyles.importSourceName}>Climaris (exportacao deste sistema)</span>
              <span className={listStyles.importSourceHint}>
                Mesmo formato do botao Exportar CSV desta tela — util para mesclar ou atualizar em lote.
              </span>
            </button>
          </li>
        </ul>
      </section>
    </ImportSpreadsheetModal>
  );

  if (ctx?.user.role === "technician") {
    return <Navigate to="/app/service-orders" replace />;
  }

  return (
    <div className={listStyles.wrap}>
      <header className={listStyles.pageHeader}>
        <div>
          <h1 className={listStyles.pageTitle}>Clientes</h1>
          <p className={listStyles.pageSubtitle}>Gerencie todos os clientes da sua empresa</p>
        </div>
        {canImport || canEdit ? (
          <CatalogListHeaderActions
            showImport={canImport}
            importing={importing}
            onImport={() => {
              setImportSource(null);
              setImportModalOpen(true);
            }}
            importTitle="Importar planilha de clientes"
            showNew={canEdit}
            newHref="/app/clients/new"
            newLabel="Novo cliente"
          />
        ) : null}
      </header>


      <ClientsListView
        clients={clients}
        isLoading={isLoading}
        error={null}
        stats={stats}
        totalCount={totalCount}
        sortKey={sortKey}
        sortDir={sortDir}
        onSortHeader={onSortHeader}
        onRowClick={(id) => navigate(`/app/clients/${id}`)}
        toolbar={toolbar}
        footerExtra={importModal}
        pagination={pagination}
      />
    </div>
  );
}
