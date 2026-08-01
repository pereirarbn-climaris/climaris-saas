import { useEffect, useMemo, useState } from "react";
import {
  deleteClientSite,
  updateClientSite,
  type ClientSiteOut,
  type ClientSiteType,
} from "../../../api/clients";
import { formatCnpjInput, formatPhoneBrInput } from "../../../lib/brMask";
import { toast } from "../../../lib/toast";
import { RowActionsMenu, RowActionsMenuItem } from "../../ui/RowActionsMenu";
import styles from "../../../pages/clients/ClientDetail.module.css";
import { ClientUnitDrawer } from "./ClientUnitDrawer";
import {
  IconBuilding,
  IconEdit,
  IconEye,
  IconMoreVertical,
  IconPlus,
  IconSearch,
  IconShield,
  IconTool,
  IconTrash,
  IconUpload,
} from "./icons";
import { EmptyState, StatusPill } from "./shared";

const SITE_TYPE_META: Record<ClientSiteType, { label: string; tone: "success" | "warning" | "danger" | "muted" | "primary" }> = {
  matriz: { label: "Matriz", tone: "primary" },
  filial: { label: "Filial", tone: "muted" },
  unidade_operacional: { label: "Unidade operacional", tone: "muted" },
  local_instalacao: { label: "Local de instalação", tone: "muted" },
  sem_cnpj: { label: "Sem CNPJ próprio", tone: "muted" },
};

const TYPE_FILTER_OPTIONS: { value: "all" | ClientSiteType; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "matriz", label: "Matriz" },
  { value: "filial", label: "Filial" },
  { value: "unidade_operacional", label: "Unidade operacional" },
  { value: "local_instalacao", label: "Local de instalação" },
];

type StatusFilter = "active" | "inactive" | "all";

type Props = {
  clientId: number;
  isNew: boolean;
  readOnly?: boolean;
  loading?: boolean;
  sites: ClientSiteOut[];
  equipmentCountBySiteId: Map<number, number>;
  mainClientDocument?: string | null;
  nearCity?: string;
  nearState?: string;
  onSitesChanged: () => void;
  onOpenEquipmentsForSite: (siteId: number) => void;
  onOpenPmocForSite: (siteId: number) => void;
  /** Permite que outras abas (ex.: Dados cadastrais) solicitem a abertura do drawer. */
  openRequest?: "new" | { site: ClientSiteOut } | null;
  onOpenRequestHandled?: () => void;
};

export function ClientUnitsTab({
  clientId,
  isNew,
  readOnly,
  loading,
  sites,
  equipmentCountBySiteId,
  mainClientDocument,
  nearCity,
  nearState,
  onSitesChanged,
  onOpenEquipmentsForSite,
  onOpenPmocForSite,
  openRequest,
  onOpenRequestHandled,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<ClientSiteOut | null>(null);

  useEffect(() => {
    if (!openRequest) return;
    if (openRequest === "new") {
      setEditingSite(null);
    } else {
      setEditingSite(openRequest.site);
    }
    setDrawerOpen(true);
    onOpenRequestHandled?.();
  }, [openRequest, onOpenRequestHandled]);
  const [busySiteId, setBusySiteId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ClientSiteType>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  const totalUnits = sites.length;
  const matrizSite = sites.find((s) => s.site_type === "matriz");
  const activeBranches = sites.filter((s) => s.site_type !== "matriz" && s.is_active).length;
  const totalEquipmentsLinked = useMemo(
    () => sites.reduce((sum, s) => sum + (equipmentCountBySiteId.get(s.id) ?? 0), 0),
    [sites, equipmentCountBySiteId],
  );

  const filteredSites = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sites.filter((s) => {
      if (statusFilter === "active" && !s.is_active) return false;
      if (statusFilter === "inactive" && s.is_active) return false;
      if (typeFilter !== "all" && s.site_type !== typeFilter) return false;
      if (!q) return true;
      const haystack = [s.name, s.nickname, s.document, s.city, s.contact_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [sites, search, typeFilter, statusFilter]);

  function openNewDrawer() {
    setEditingSite(null);
    setDrawerOpen(true);
  }

  function openEditDrawer(site: ClientSiteOut) {
    setEditingSite(site);
    setDrawerOpen(true);
  }

  function onSaved() {
    setDrawerOpen(false);
    setEditingSite(null);
    onSitesChanged();
  }

  async function onToggleActive(site: ClientSiteOut) {
    setBusySiteId(site.id);
    try {
      await updateClientSite(clientId, site.id, { is_active: !site.is_active });
      toast.success(site.is_active ? "Unidade inativada." : "Unidade ativada.");
      onSitesChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível atualizar o status da unidade.");
    } finally {
      setBusySiteId(null);
    }
  }

  async function onDeleteSite(site: ClientSiteOut) {
    if (!window.confirm(`Excluir a unidade "${site.name}"? Equipamentos vinculados ficarão sem unidade.`)) return;
    setBusySiteId(site.id);
    try {
      await deleteClientSite(clientId, site.id);
      toast.success("Unidade excluída.");
      onSitesChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir a unidade.");
    } finally {
      setBusySiteId(null);
    }
  }

  if (isNew) {
    return (
      <div className={styles.tabPanel}>
        <section className={styles.card}>
          <p className={styles.cardHint}>Salve o cliente para cadastrar unidades e filiais.</p>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.tabPanel}>
      <section className={styles.card}>
        <div className={styles.cardHeadRow}>
          <div>
            <h3 className={styles.cardTitle}>Unidades / Filiais</h3>
            <p className={styles.cardHint}>Cadastre matriz, filiais, unidades operacionais e locais de instalação do cliente.</p>
          </div>
          {!readOnly ? (
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={() => toast.error("Importação de unidades em breve.")}
              >
                <IconUpload /> Importar unidades
              </button>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={openNewDrawer}>
                <IconPlus /> Nova unidade / filial
              </button>
            </div>
          ) : null}
        </div>

        <div className={styles.miniGrid}>
          <div className={styles.miniCard}>
            <span className={styles.miniCardLabel}>Total de unidades</span>
            <span className={styles.miniCardValue}>{totalUnits}</span>
          </div>
          <div className={styles.miniCard}>
            <span className={styles.miniCardLabel}>Matriz</span>
            <span className={styles.miniCardValue} style={{ fontSize: "1rem" }}>
              {matrizSite?.name ?? "Não cadastrada"}
            </span>
          </div>
          <div className={styles.miniCard}>
            <span className={styles.miniCardLabel}>Filiais ativas</span>
            <span className={styles.miniCardValue}>{activeBranches}</span>
          </div>
          <div className={styles.miniCard}>
            <span className={styles.miniCardLabel}>Equipamentos vinculados</span>
            <span className={styles.miniCardValue}>{totalEquipmentsLinked}</span>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.filterBar}>
          <div className={styles.filterSearchWrap}>
            <IconSearch />
            <input
              className={`${styles.fieldInput} ${styles.filterSearchInput}`}
              placeholder="Buscar unidade, CNPJ, cidade ou responsável…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className={`${styles.fieldSelect} ${styles.filterSelect}`}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "all" | ClientSiteType)}
            aria-label="Filtrar por tipo"
          >
            {TYPE_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            className={`${styles.fieldSelect} ${styles.filterSelect}`}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Filtrar por status"
          >
            <option value="active">Ativas</option>
            <option value="inactive">Inativas</option>
            <option value="all">Todas</option>
          </select>
        </div>

        <div style={{ marginTop: "1.25rem" }}>
          {loading ? (
            <p className={styles.loading}>Carregando unidades…</p>
          ) : filteredSites.length === 0 ? (
            <EmptyState message={sites.length === 0 ? "Nenhuma unidade/filial cadastrada ainda." : "Nenhuma unidade encontrada para o filtro atual."} />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Unidade</th>
                    <th>Tipo</th>
                    <th>Documento</th>
                    <th>Responsável</th>
                    <th>Cidade / UF</th>
                    <th>Equipamentos</th>
                    <th>PMOC</th>
                    <th>Status</th>
                    {!readOnly ? <th>Ações</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filteredSites.map((s) => {
                    const meta = SITE_TYPE_META[s.site_type] ?? { label: s.site_type, tone: "muted" as const };
                    const equipCount = equipmentCountBySiteId.get(s.id) ?? 0;
                    return (
                      <tr key={s.id}>
                        <td>
                          <div className={styles.unitNameCell}>
                            <span className={styles.unitAvatar} aria-hidden>
                              <IconBuilding />
                            </span>
                            <span className={styles.unitNameText}>
                              <strong>{s.name}</strong>
                              {s.nickname ? <span>{s.nickname}</span> : null}
                            </span>
                          </div>
                        </td>
                        <td>
                          <StatusPill label={meta.label} tone={meta.tone} />
                        </td>
                        <td>{s.document ? formatCnpjInput(s.document) : "—"}</td>
                        <td>
                          {s.contact_name ?? "—"}
                          {s.phone ? (
                            <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                              {formatPhoneBrInput(s.phone)}
                            </div>
                          ) : null}
                        </td>
                        <td>{s.city ? `${s.city}${s.state ? ` - ${s.state}` : ""}` : "—"}</td>
                        <td>{equipCount}</td>
                        <td>{s.participates_pmoc ? <StatusPill label="Participa" tone="success" /> : <StatusPill label="Não participa" tone="muted" />}</td>
                        <td>
                          <StatusPill label={s.is_active ? "Ativa" : "Inativa"} tone={s.is_active ? "success" : "muted"} />
                        </td>
                        {!readOnly ? (
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.15rem" }}>
                              <button
                                type="button"
                                className={styles.btnGhostIcon}
                                onClick={() => openEditDrawer(s)}
                                disabled={busySiteId === s.id}
                                aria-label="Editar unidade"
                                title="Editar unidade"
                                style={{ color: "var(--color-primary)" }}
                              >
                                <IconEdit />
                              </button>
                              <button
                                type="button"
                                className={styles.btnGhostIcon}
                                onClick={() => void onDeleteSite(s)}
                                disabled={busySiteId === s.id}
                                aria-label="Excluir unidade"
                                title="Excluir unidade"
                              >
                                <IconTrash />
                              </button>
                              <RowActionsMenu
                                ariaLabel="Mais ações"
                                preferUp
                                disabled={busySiteId === s.id}
                                triggerClassName={styles.btnGhostIcon}
                                trigger={<IconMoreVertical />}
                              >
                                <RowActionsMenuItem onSelect={() => void onToggleActive(s)}>
                                  <IconShield /> {s.is_active ? "Inativar" : "Ativar"}
                                </RowActionsMenuItem>
                                <RowActionsMenuItem onSelect={() => onOpenEquipmentsForSite(s.id)}>
                                  <IconTool /> Ver equipamentos
                                </RowActionsMenuItem>
                                <RowActionsMenuItem onSelect={() => onOpenPmocForSite(s.id)}>
                                  <IconEye /> Ver PMOC
                                </RowActionsMenuItem>
                              </RowActionsMenu>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <ClientUnitDrawer
        open={drawerOpen}
        clientId={clientId}
        editingSite={editingSite}
        mainClientDocument={mainClientDocument}
        nearCity={nearCity}
        nearState={nearState}
        onClose={() => {
          setDrawerOpen(false);
          setEditingSite(null);
        }}
        onSaved={onSaved}
      />
    </div>
  );
}
