import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import {
  countClients,
  exportClientsCsv,
  importClientsCsv,
  listClientsAll,
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

function compareText(a: string, b: string, dir: ClientListSortDir): number {
  const c = a.localeCompare(b, "pt-BR", { sensitivity: "base" });
  return dir === "asc" ? c : -c;
}

function compareDigits(a: string | null | undefined, b: string | null | undefined, dir: ClientListSortDir): number {
  const da = (a ?? "").replace(/\D/g, "");
  const db = (b ?? "").replace(/\D/g, "");
  if (da === db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  const maxLen = Math.max(da.length, db.length);
  const na = da.padStart(maxLen, "0");
  const nb = db.padStart(maxLen, "0");
  const cmp = na < nb ? -1 : na > nb ? 1 : 0;
  return dir === "asc" ? cmp : -cmp;
}

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
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importSource, setImportSource] = useState<"climaris" | "minha_agenda" | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const canEdit = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";

  useEffect(() => {
    const t = window.setTimeout(() => setQ(input.trim()), 400);
    return () => window.clearTimeout(t);
  }, [input]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [list, total] = await Promise.all([
        listClientsAll({ q: q || undefined, status: statusFilter }),
        countClients({ q: q || undefined, status: statusFilter }),
      ]);
      setClients(list);
      setTotalCount(total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar clientes.");
      setClients([]);
      setTotalCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [q, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedClients = useMemo(() => {
    const list = [...clients];
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
  }, [clients, sortKey, sortDir]);

  const stats = useMemo(() => {
    const total = totalCount;
    const empresas = clients.filter((c) => (c.tax_id_kind || "").toLowerCase() === "cnpj").length;
    const pessoas = clients.filter((c) => (c.tax_id_kind || "").toLowerCase() === "cpf").length;
    const ativos = clients.filter((c) => c.is_active).length;
    return { total, empresas, pessoas, ativos };
  }, [clients, totalCount]);

  function onSortHeader(key: ClientListSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
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

  async function onImportCsv(file: File) {
    setError(null);
    try {
      const r = await importClientsCsv(file);
      const extra = r.errors.length ? `\nAvisos: ${r.errors.slice(0, 5).join("; ")}` : "";
      window.alert(`Importação concluída.\nCriados: ${r.created}\nAtualizados: ${r.updated}\nIgnorados: ${r.skipped}${extra}`);
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
              className={tableStyles.listToolbarBtnGhost}
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

  return (
    <div className={listStyles.wrap}>
      <ClientsListView
        clients={sortedClients}
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
      />
    </div>
  );
}
