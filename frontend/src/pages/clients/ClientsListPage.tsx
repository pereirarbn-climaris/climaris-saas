import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useOutletContext } from "react-router-dom";
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
import { minhaAgendaClientsFileToClimarisCsvFile } from "../../lib/minhaAgendaClientImport";
import type { DashboardOutletContext } from "../dashboardContext";
import tableStyles from "../listTableCommon.module.css";
import listStyles from "../../components/v0-ui/clients/clients-list.module.css";
import styles from "./ClientsListPage.module.css";

const CLIENTS_PAGE_SIZE = 20;

export function ClientsListPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [clients, setClients] = useState<ClientOut[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<ClientListSortKey>("name");
  const [sortDir, setSortDir] = useState<ClientListSortDir>("asc");
  const [statusFilter, setStatusFilter] = useState<ClientStatusFilter>("active");
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, empresas: 0, pessoas: 0, ativos: 0 });
  const [page, setPage] = useState(1);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importSource, setImportSource] = useState<"climaris" | "minha_agenda" | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const canEdit = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";

  useEffect(() => {
    const t = window.setTimeout(() => setQ(input.trim()), 400);
    return () => window.clearTimeout(t);
  }, [input]);

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

  async function onImportCsv(file: File) {
    setError(null);
    try {
      const r = await importClientsCsv(file);
      const extra = r.errors.length ? `\nAvisos: ${r.errors.slice(0, 5).join("; ")}` : "";
      window.alert(`Importação concluída.\nCriados: ${r.created}\nAtualizados: ${r.updated}\nIgnorados: ${r.skipped}${extra}`);
      setPage(1);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro na importação.");
    }
  }

  function startImportPick(source: "climaris" | "minha_agenda") {
    setImportSource(source);
    queueMicrotask(() => importFileRef.current?.click());
  }

  async function onImportFilePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const source = importSource;
    setImportSource(null);
    if (!file || !source) return;
    setImportModalOpen(false);
    setError(null);
    try {
      if (source === "minha_agenda") {
        const converted = await minhaAgendaClientsFileToClimarisCsvFile(file);
        await onImportCsv(converted);
      } else {
        await onImportCsv(file);
      }
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Erro ao processar o arquivo.");
    }
  }

  useEffect(() => {
    if (!importModalOpen) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        setImportSource(null);
        setImportModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [importModalOpen]);

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
        {ctx?.user.role === "admin" ? (
          <>
            <input
              ref={importFileRef}
              type="file"
              accept=".csv,text/csv"
              className={styles.fileHidden}
              aria-hidden
              tabIndex={-1}
              onChange={(e) => void onImportFilePicked(e)}
            />
            <button
              type="button"
              className={`${tableStyles.listToolbarBtnGhost} ${listStyles.hideOnMobile}`}
              onClick={() => {
                setImportSource(null);
                setImportModalOpen(true);
              }}
              title="Importar planilha de clientes"
            >
              <span className={tableStyles.listToolbarBtnIcon} aria-hidden>
                <svg viewBox="0 0 24 24">
                  <path d="M12 3v12" />
                  <path d="m17 8-5-5-5 5" />
                  <path d="M5 21h14" />
                </svg>
              </span>
              Importar
            </button>
          </>
        ) : null}
      </div>
    </div>
  );

  const importModal =
    importModalOpen ? (
      <div
        className={listStyles.importModalOverlay}
        role="dialog"
        aria-modal="true"
        aria-labelledby="clients-import-title"
        onClick={() => {
          setImportSource(null);
          setImportModalOpen(false);
        }}
      >
        <div className={listStyles.importModal} onClick={(e) => e.stopPropagation()}>
          <header className={listStyles.importModalHeader}>
            <h3 id="clients-import-title" className={listStyles.importModalTitle}>
              Importar clientes
            </h3>
            <button
              type="button"
              className={listStyles.importModalClose}
              onClick={() => {
                setImportSource(null);
                setImportModalOpen(false);
              }}
            >
              Fechar
            </button>
          </header>
          <div className={listStyles.importModalBody}>
            <p className={listStyles.importModalIntro}>
              Escolha de qual sistema veio o arquivo. Em seguida, selecione o CSV no seu computador.
            </p>
            <ul className={listStyles.importSourceList}>
              <li>
                <button type="button" className={listStyles.importSourceCard} onClick={() => startImportPick("minha_agenda")}>
                  <span className={listStyles.importSourceName}>Minha Agenda</span>
                  <span className={listStyles.importSourceHint}>
                    Exportação em Clientes com colunas Nome, Telefone, Endereço, E-mail, CPF etc. O arquivo pode ser CSV
                    (UTF-8). Se estiver em Excel, use &quot;Salvar como&quot; CSV.
                  </span>
                </button>
              </li>
              <li>
                <button type="button" className={listStyles.importSourceCard} onClick={() => startImportPick("climaris")}>
                  <span className={listStyles.importSourceName}>Climaris (exportação deste sistema)</span>
                  <span className={listStyles.importSourceHint}>
                    Mesmo formato gerado pelo botão Exportar CSV desta tela — útil para mesclar ou atualizar em lote.
                  </span>
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    ) : null;

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
      </header>

      <ClientsListView
        clients={clients}
        isLoading={isLoading}
        error={error}
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
