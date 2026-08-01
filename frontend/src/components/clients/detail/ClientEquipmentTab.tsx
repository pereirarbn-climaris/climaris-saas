import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ClientSiteOut } from "../../../api/clients";
import type { PmocPlanOut } from "../../../api/pmoc";
import { EquipmentSheetModal } from "../../equipment/EquipmentSheetModal";
import {
  AddEquipmentModal,
  type CatalogBrand,
  type CatalogModel,
  type EquipmentCatalog,
  type EquipmentCategoryPickerOption,
  type EquipmentItem,
  type NewEquipmentData,
} from "../../v0-ui/clients";
import { identifyClientCatalogEquipment } from "../../../api/equipmentCatalog";
import { toast } from "../../../lib/toast";
import styles from "../../../pages/clients/ClientDetail.module.css";
import { ListPaginationBar } from "../../ui/list-pagination";
import { RowActionsMenu, RowActionsMenuItem } from "../../ui/RowActionsMenu";
import {
  IconAlertTriangle,
  IconCheck,
  IconClipboardList,
  IconEdit,
  IconEye,
  IconMoreVertical,
  IconPlus,
  IconSearch,
  IconShield,
  IconTool,
  IconTrash,
  IconX,
} from "./icons";
import { EmptyState } from "./shared";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

type RowStatus = "ativo" | "manutencao" | "inativo";
type PmocStatus = "em_dia" | "vencido" | "sem_pmoc";

type EquipmentRow = {
  id: string;
  tag: string;
  serialNumber: string;
  typeName: string;
  capacityLabel: string | null;
  brandName: string;
  modelName: string;
  siteName: string;
  siteBadge: "Matriz" | "Filial";
  location: string;
  pmocStatus: PmocStatus;
  pmocDueDateLabel: string | null;
  status: RowStatus;
  pendingIdentification: boolean;
  source: EquipmentItem;
};

function formatBtu(value: number | undefined): string | null {
  if (!value || !Number.isFinite(value)) return null;
  return `${new Intl.NumberFormat("pt-BR").format(value)} BTUs`;
}

function siteInfoFor(
  clientSiteId: number | null | undefined,
  sites: ClientSiteOut[],
): { name: string; badge: "Matriz" | "Filial" } {
  if (clientSiteId == null) return { name: "Matriz / Endereço principal", badge: "Matriz" };
  const site = sites.find((s) => s.id === clientSiteId);
  if (!site) return { name: "Unidade removida", badge: "Filial" };
  return { name: site.name, badge: site.site_type === "matriz" ? "Matriz" : "Filial" };
}

function pmocStatusFor(clientSiteId: number | null | undefined, pmocPlans: PmocPlanOut[]): PmocStatus {
  const hasActivePlan = pmocPlans.some(
    (p) => p.status === "active" && (p.client_site_id ?? null) === (clientSiteId ?? null),
  );
  return hasActivePlan ? "em_dia" : "sem_pmoc";
}

function mapEquipmentToRow(e: EquipmentItem, sites: ClientSiteOut[], pmocPlans: PmocPlanOut[]): EquipmentRow {
  const site = siteInfoFor(e.clientSiteId, sites);
  return {
    id: e.id,
    tag: e.tag || "—",
    serialNumber: e.serialNumber || "—",
    typeName: e.categoryName?.trim() || "Equipamento",
    capacityLabel: formatBtu(e.specs?.capacityBTU),
    brandName: e.brandName || "—",
    modelName: e.modelName || "—",
    siteName: site.name,
    siteBadge: site.badge,
    location: e.installationReference?.trim() || "—",
    pmocStatus: pmocStatusFor(e.clientSiteId, pmocPlans),
    pmocDueDateLabel: null,
    status: e.status === "ativo" ? "ativo" : "inativo",
    pendingIdentification: Boolean(e.pendingIdentification),
    source: e,
  };
}

type StatusFilter = "all" | RowStatus;

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Todos os status" },
  { value: "ativo", label: "Ativo" },
  { value: "manutencao", label: "Em manutenção" },
  { value: "inativo", label: "Inativo" },
];

function StatusBadge({ status }: { status: RowStatus }) {
  if (status === "ativo") return <span className={`${styles.pill} ${styles.pillSuccess}`}>Ativo</span>;
  if (status === "manutencao") return <span className={`${styles.pill} ${styles.pillOrange}`}>Em manutenção</span>;
  return <span className={`${styles.pill} ${styles.pillMuted}`}>Inativo</span>;
}

function SiteBadge({ badge }: { badge: "Matriz" | "Filial" }) {
  return badge === "Matriz" ? (
    <span className={`${styles.pill} ${styles.pillPrimary}`}>Matriz</span>
  ) : (
    <span className={`${styles.pill} ${styles.pillPurple}`}>Filial</span>
  );
}

function PmocCell({ row, onCadastrar }: { row: EquipmentRow; onCadastrar: () => void }) {
  if (row.pmocStatus === "em_dia") {
    return (
      <div>
        <span className={`${styles.pmocCell} ${styles.pmocGreen}`}>
          <IconCheck /> Em dia
        </span>
        {row.pmocDueDateLabel ? <div className={styles.pmocCellSub}>Venc.: {row.pmocDueDateLabel}</div> : null}
      </div>
    );
  }
  if (row.pmocStatus === "vencido") {
    return (
      <div>
        <span className={`${styles.pmocCell} ${styles.pmocOrange}`}>
          <IconAlertTriangle /> Vencido
        </span>
        {row.pmocDueDateLabel ? <div className={styles.pmocCellSub}>Venc.: {row.pmocDueDateLabel}</div> : null}
      </div>
    );
  }
  return (
    <div>
      <span className={`${styles.pmocCell} ${styles.pmocGray}`}>
        <IconShield /> Sem PMOC
      </span>
      <div className={styles.pmocCellSub}>
        <button type="button" onClick={onCadastrar}>
          Cadastrar
        </button>
      </div>
    </div>
  );
}

type Props = {
  isNew: boolean;
  readOnly?: boolean;
  clientId: number;
  clientSites: ClientSiteOut[];
  equipments: EquipmentItem[];
  catalog: EquipmentCatalog;
  categoryOptions?: EquipmentCategoryPickerOption[];
  isLoading?: boolean;
  pmocPlans: PmocPlanOut[];
  modalOpenRequest?: { clientSiteId: number | null } | null;
  onModalOpenRequestHandled?: () => void;
  onAddEquipment?: (data: NewEquipmentData) => void | Promise<void>;
  onDeactivate?: (equipmentId: string) => void;
  onDelete?: (equipmentId: string) => void;
  onEquipmentsChanged?: () => void;
  onGoToPmoc?: (siteId: number | null) => void;
};

export function ClientEquipmentTab({
  isNew,
  readOnly,
  clientId,
  clientSites,
  equipments,
  catalog,
  categoryOptions,
  isLoading,
  pmocPlans,
  modalOpenRequest,
  onModalOpenRequestHandled,
  onAddEquipment,
  onDeactivate,
  onDelete,
  onEquipmentsChanged,
  onGoToPmoc,
}: Props) {
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [siteFilter, setSiteFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalSiteId, setAddModalSiteId] = useState<number | null>(null);
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);
  const [sheetTarget, setSheetTarget] = useState<{ item: EquipmentItem; editing: boolean } | null>(null);
  const [identifyTarget, setIdentifyTarget] = useState<EquipmentItem | null>(null);

  useEffect(() => {
    if (!modalOpenRequest) return;
    setAddModalSiteId(modalOpenRequest.clientSiteId);
    setAddModalOpen(true);
    onModalOpenRequestHandled?.();
  }, [modalOpenRequest, onModalOpenRequestHandled]);

  const rows = useMemo<EquipmentRow[]>(
    () => equipments.map((e) => mapEquipmentToRow(e, clientSites, pmocPlans)),
    [equipments, clientSites, pmocPlans],
  );

  const siteOptions = useMemo(() => {
    const names = Array.from(new Set(rows.map((r) => r.siteName)));
    return names.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [rows]);

  const typeOptions = useMemo(() => {
    const names = Array.from(new Set(rows.map((r) => r.typeName)));
    return names.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (siteFilter !== "all" && r.siteName !== siteFilter) return false;
      if (typeFilter !== "all" && r.typeName !== typeFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [r.tag, r.brandName, r.modelName, r.serialNumber].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, search, siteFilter, typeFilter, statusFilter]);

  const totals = {
    total: rows.length,
    ativos: rows.filter((r) => r.status === "ativo").length,
    manutencao: rows.filter((r) => r.status === "manutencao").length,
    inativos: rows.filter((r) => r.status === "inativo").length,
    semPmoc: rows.filter((r) => r.pmocStatus === "sem_pmoc").length,
  };

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredRows, currentPage, pageSize],
  );

  function resetFilters() {
    setSearch("");
    setSiteFilter("all");
    setTypeFilter("all");
    setStatusFilter("all");
    setPage(1);
  }

  function onSearchChange(v: string) {
    setSearch(v);
    setPage(1);
  }

  function openAddModal() {
    setAddModalSiteId(null);
    setAddModalOpen(true);
  }

  async function handleAddSubmit(data: NewEquipmentData) {
    if (!onAddEquipment) return;
    setIsSubmittingAdd(true);
    try {
      await onAddEquipment(data);
      setAddModalOpen(false);
      setAddModalSiteId(null);
    } finally {
      setIsSubmittingAdd(false);
    }
  }

  function onEditRow(row: EquipmentRow) {
    setSheetTarget({ item: row.source, editing: true });
  }

  function onViewRow(row: EquipmentRow) {
    setSheetTarget({ item: row.source, editing: false });
  }

  function onIdentifyRow(row: EquipmentRow) {
    setIdentifyTarget(row.source);
  }

  function onLinkPmoc(row: EquipmentRow) {
    onGoToPmoc?.(row.source.clientSiteId ?? null);
  }

  function onGenerateOs(row: EquipmentRow) {
    const params = new URLSearchParams({ client_id: String(clientId) });
    if (row.source.legacyEquipmentId) {
      params.set("equipment_id", String(row.source.legacyEquipmentId));
    }
    navigate(`/app/service-orders/new?${params.toString()}`);
  }

  function onInativarRow(row: EquipmentRow) {
    onDeactivate?.(row.source.id);
  }

  function onExcluirRow(row: EquipmentRow) {
    onDelete?.(row.source.id);
  }

  if (isNew) {
    return (
      <div className={styles.tabPanel}>
        <section className={styles.card}>
          <p className={styles.cardHint}>Salve o cliente para cadastrar equipamentos.</p>
        </section>
      </div>
    );
  }

  const hasEquipment = rows.length > 0;

  return (
    <div className={styles.tabPanel}>
      <section className={styles.card}>
        <div className={styles.cardHeadRow}>
          <div>
            <h3 className={styles.cardTitle}>Equipamentos cadastrados</h3>
            <p className={styles.cardHint}>Gerencie os equipamentos do cliente em suas unidades/filiais.</p>
          </div>
          {!readOnly ? (
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={openAddModal}>
              <IconPlus /> Adicionar equipamento
            </button>
          ) : null}
        </div>

        {isLoading ? (
          <p className={styles.loading}>Carregando equipamentos…</p>
        ) : !hasEquipment ? (
          <EmptyState message="Nenhum equipamento cadastrado ainda." />
        ) : (
          <>
            <div className={styles.filterBar} style={{ marginTop: "1.25rem" }}>
              <div className={styles.filterSearchWrap}>
                <IconSearch />
                <input
                  className={`${styles.fieldInput} ${styles.filterSearchInput}`}
                  placeholder="Buscar equipamento, marca, modelo, série…"
                  value={search}
                  onChange={(e) => onSearchChange(e.target.value)}
                />
              </div>
              <select
                className={`${styles.fieldSelect} ${styles.filterSelect}`}
                value={siteFilter}
                onChange={(e) => {
                  setSiteFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filtrar por unidade"
              >
                <option value="all">Todas as unidades</option>
                {siteOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                className={`${styles.fieldSelect} ${styles.filterSelect}`}
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filtrar por tipo"
              >
                <option value="all">Todos os tipos</option>
                {typeOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                className={`${styles.fieldSelect} ${styles.filterSelect}`}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as StatusFilter);
                  setPage(1);
                }}
                aria-label="Filtrar por status"
              >
                {STATUS_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button type="button" className={styles.btnLinkMuted} onClick={resetFilters}>
                Limpar filtros
              </button>
            </div>

            <div className={styles.equipStatsGrid}>
              <div className={styles.equipStatCard}>
                <span className={`${styles.equipStatIcon} ${styles.equipStatIconBlue}`}>
                  <IconTool />
                </span>
                <span className={styles.equipStatBody}>
                  <span className={styles.equipStatValue}>{totals.total}</span>
                  <span className={styles.equipStatLabel}>Total de equipamentos</span>
                </span>
              </div>
              <div className={styles.equipStatCard}>
                <span className={`${styles.equipStatIcon} ${styles.equipStatIconGreen}`}>
                  <IconCheck />
                </span>
                <span className={styles.equipStatBody}>
                  <span className={styles.equipStatValue}>{totals.ativos}</span>
                  <span className={styles.equipStatLabel}>Equipamentos ativos</span>
                </span>
              </div>
              <div className={styles.equipStatCard}>
                <span className={`${styles.equipStatIcon} ${styles.equipStatIconOrange}`}>
                  <IconAlertTriangle />
                </span>
                <span className={styles.equipStatBody}>
                  <span className={styles.equipStatValue}>{totals.manutencao}</span>
                  <span className={styles.equipStatLabel}>Em manutenção</span>
                </span>
              </div>
              <div className={styles.equipStatCard}>
                <span className={`${styles.equipStatIcon} ${styles.equipStatIconGray}`}>
                  <IconX />
                </span>
                <span className={styles.equipStatBody}>
                  <span className={styles.equipStatValue}>{totals.inativos}</span>
                  <span className={styles.equipStatLabel}>Inativos</span>
                </span>
              </div>
              <div className={styles.equipStatCard}>
                <span className={`${styles.equipStatIcon} ${styles.equipStatIconRed}`}>
                  <IconShield />
                </span>
                <span className={styles.equipStatBody}>
                  <span className={styles.equipStatValue}>{totals.semPmoc}</span>
                  <span className={styles.equipStatLabel}>Sem PMOC</span>
                </span>
              </div>
            </div>

            {filteredRows.length === 0 ? (
              <EmptyState message="Nenhum equipamento encontrado para o filtro atual." />
            ) : (
          <>
            <div className={`${styles.tableWrap} ${styles.equipDesktopTable}`} style={{ marginTop: "1rem" }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Equipamento</th>
                    <th>Tipo</th>
                    <th>Marca / Modelo</th>
                    <th>Unidade / Filial</th>
                    <th>Local</th>
                    <th>PMOC</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className={styles.equipCell}>
                          <span className={styles.equipThumb} aria-hidden>
                            <IconTool />
                          </span>
                          <span className={styles.equipCellText}>
                            <span className={styles.equipTag}>{row.tag}</span>
                            <span className={styles.equipSerial}>Nº de série: {row.serialNumber}</span>
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className={styles.equipTypeCell}>
                          <span className={styles.equipTypeName}>{row.typeName}</span>
                          {row.capacityLabel ? (
                            <span className={`${styles.pill} ${styles.pillSky}`}>{row.capacityLabel}</span>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        {row.pendingIdentification ? (
                          <div className={styles.equipBrandModel}>
                            <span className={`${styles.pill} ${styles.pillOrange}`}>
                              <IconAlertTriangle /> A identificar
                            </span>
                            {!readOnly ? (
                              <button
                                type="button"
                                className={styles.btnLinkMuted}
                                style={{ marginTop: "0.35rem" }}
                                onClick={() => onIdentifyRow(row)}
                              >
                                Identificar equipamento
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          <div className={styles.equipBrandModel}>
                            <span className={styles.equipBrand}>{row.brandName}</span>
                            <span className={styles.equipModel}>{row.modelName}</span>
                          </div>
                        )}
                      </td>
                      <td>
                        <div className={styles.equipSiteCell}>
                          <span>{row.siteName}</span>
                          <SiteBadge badge={row.siteBadge} />
                        </div>
                      </td>
                      <td>
                        <span className={styles.equipLocation}>{row.location}</span>
                      </td>
                      <td>
                        <PmocCell row={row} onCadastrar={() => onLinkPmoc(row)} />
                      </td>
                      <td>
                        <StatusBadge status={row.status} />
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.15rem" }}>
                          {!readOnly ? (
                            <button
                              type="button"
                              className={styles.btnGhostIcon}
                              onClick={() => onEditRow(row)}
                              aria-label="Editar equipamento"
                              title="Editar equipamento"
                              style={{ color: "var(--color-primary)" }}
                            >
                              <IconEdit />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className={styles.btnGhostIcon}
                            onClick={() => onViewRow(row)}
                            aria-label="Ver detalhes"
                            title="Ver detalhes"
                          >
                            <IconEye />
                          </button>
                          <button
                            type="button"
                            className={styles.btnGhostIcon}
                            onClick={() => onGenerateOs(row)}
                            aria-label="Gerar OS"
                            title="Gerar OS"
                          >
                            <IconClipboardList />
                          </button>
                          {!readOnly ? (
                            <button
                              type="button"
                              className={styles.btnGhostIcon}
                              onClick={() => onExcluirRow(row)}
                              aria-label="Excluir equipamento"
                              title="Excluir equipamento"
                            >
                              <IconTrash />
                            </button>
                          ) : null}
                          <RowActionsMenu
                            ariaLabel="Mais ações"
                            preferUp
                            triggerClassName={styles.btnGhostIcon}
                            trigger={<IconMoreVertical />}
                          >
                            {!readOnly && row.pendingIdentification ? (
                              <RowActionsMenuItem onSelect={() => onIdentifyRow(row)}>
                                <IconAlertTriangle /> Identificar equipamento
                              </RowActionsMenuItem>
                            ) : null}
                            <RowActionsMenuItem onSelect={() => onLinkPmoc(row)}>
                              <IconShield /> Vincular PMOC
                            </RowActionsMenuItem>
                            {!readOnly && row.status !== "inativo" ? (
                              <RowActionsMenuItem onSelect={() => onInativarRow(row)}>
                                <IconX /> Inativar
                              </RowActionsMenuItem>
                            ) : null}
                          </RowActionsMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.equipMobileList}>
              {pageRows.map((row) => (
                <div key={row.id} className={styles.equipMobileCard}>
                  <div className={styles.equipMobileCardHead}>
                    <div className={styles.equipCell}>
                      <span className={styles.equipThumb} aria-hidden>
                        <IconTool />
                      </span>
                      <span className={styles.equipCellText}>
                        <span className={styles.equipTag}>{row.tag}</span>
                        <span className={styles.equipSerial}>Nº de série: {row.serialNumber}</span>
                      </span>
                    </div>
                    <StatusBadge status={row.status} />
                  </div>
                  <div className={styles.equipMobileCardMeta}>
                    <span>
                      <strong>{row.typeName}</strong>
                      {row.capacityLabel ? ` · ${row.capacityLabel}` : ""}
                    </span>
                    {row.pendingIdentification ? (
                      <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <span className={`${styles.pill} ${styles.pillOrange}`}>
                          <IconAlertTriangle /> A identificar
                        </span>
                        {!readOnly ? (
                          <button type="button" className={styles.btnLinkMuted} onClick={() => onIdentifyRow(row)}>
                            Identificar
                          </button>
                        ) : null}
                      </span>
                    ) : (
                      <span>
                        {row.brandName} · {row.modelName}
                      </span>
                    )}
                    <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      {row.siteName} <SiteBadge badge={row.siteBadge} />
                    </span>
                    <span>{row.location}</span>
                    <PmocCell row={row} onCadastrar={() => onLinkPmoc(row)} />
                  </div>
                  <div className={styles.equipMobileCardFooter}>
                    {!readOnly ? (
                      <button type="button" className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`} onClick={() => onEditRow(row)}>
                        <IconEdit /> Editar
                      </button>
                    ) : null}
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      <button type="button" className={styles.btnGhostIcon} onClick={() => onViewRow(row)} aria-label="Ver detalhes">
                        <IconEye />
                      </button>
                      <button type="button" className={styles.btnGhostIcon} onClick={() => onGenerateOs(row)} aria-label="Gerar OS">
                        <IconClipboardList />
                      </button>
                      {!readOnly ? (
                        <button type="button" className={styles.btnGhostIcon} onClick={() => onExcluirRow(row)} aria-label="Excluir">
                          <IconTrash />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.paginationFooterRow}>
              <ListPaginationBar
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredRows.length}
                itemsPerPage={pageSize}
                onPageChange={setPage}
                itemLabel="equipamento"
                itemLabelPlural="equipamentos"
              />
              <label className={styles.pageSizeField}>
                Itens por página:
                <select
                  className={styles.pageSizeSelect}
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  aria-label="Itens por página"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
            )}
          </>
        )}
      </section>

      <AddEquipmentModal
        isOpen={addModalOpen}
        onClose={() => {
          setAddModalOpen(false);
          setAddModalSiteId(null);
        }}
        clientId={clientId}
        clientSites={clientSites}
        initialClientSiteId={addModalSiteId}
        catalog={catalog}
        categoryOptions={categoryOptions}
        onSubmit={handleAddSubmit}
        isSubmitting={isSubmittingAdd}
      />

      {sheetTarget ? (
        <EquipmentSheetModal
          equipment={sheetTarget.item}
          clientId={clientId}
          clientSites={clientSites}
          readOnly={readOnly}
          initialEditing={sheetTarget.editing}
          onClose={() => setSheetTarget(null)}
          onUpdated={() => void onEquipmentsChanged?.()}
        />
      ) : null}

      {identifyTarget ? (
        <IdentifyEquipmentModal
          equipment={identifyTarget}
          catalog={catalog}
          onClose={() => setIdentifyTarget(null)}
          onIdentified={() => {
            setIdentifyTarget(null);
            void onEquipmentsChanged?.();
          }}
        />
      ) : null}
    </div>
  );
}

function IdentifyEquipmentModal({
  equipment,
  catalog,
  onClose,
  onIdentified,
}: {
  equipment: EquipmentItem;
  catalog: EquipmentCatalog;
  onClose: () => void;
  onIdentified: () => void;
}) {
  const models = useMemo(
    () => catalog.models.filter((m) => m.category === equipment.category),
    [catalog.models, equipment.category],
  );
  const brands = useMemo(() => {
    const brandIds = new Set(models.map((m) => m.brandId));
    return catalog.brands.filter((b) => brandIds.has(b.id));
  }, [catalog.brands, models]);

  const [brandId, setBrandId] = useState("");
  const [modelId, setModelId] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const modelsForBrand = useMemo(() => models.filter((m) => m.brandId === brandId), [models, brandId]);
  const selectedBrand: CatalogBrand | undefined = brands.find((b) => b.id === brandId);
  const selectedModel: CatalogModel | undefined = modelsForBrand.find((m) => m.id === modelId);
  const canSubmit = Boolean(selectedBrand && selectedModel) && !saving;

  async function handleSubmit() {
    if (!selectedModel) return;
    setSaving(true);
    setError("");
    try {
      await identifyClientCatalogEquipment(equipment.id, {
        catalog_id: selectedModel.id,
        serial_number: serialNumber.trim() || null,
      });
      toast.success("Equipamento identificado com sucesso.");
      onIdentified();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível identificar o equipamento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.modalRoot} role="dialog" aria-modal="true">
      <button type="button" className={styles.modalBackdrop} aria-label="Fechar" onClick={onClose} />
      <div className={styles.modalCard}>
        <h3 className={styles.modalTitle}>Identificar equipamento</h3>
        <p className={styles.cardHint} style={{ marginTop: "-0.5rem", marginBottom: "1rem" }}>
          Informe a marca, o modelo e a série reais do equipamento &quot;{equipment.tag}&quot;.
        </p>

        <div className={styles.fieldGrid2}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Marca *</label>
            <select
              className={styles.fieldSelect}
              value={brandId}
              onChange={(e) => {
                setBrandId(e.target.value);
                setModelId("");
              }}
            >
              <option value="">Selecione a marca...</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Modelo *</label>
            <select
              className={styles.fieldSelect}
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              disabled={!brandId}
            >
              <option value="">{brandId ? "Selecione o modelo..." : "Selecione a marca primeiro"}</option>
              {modelsForBrand.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className={styles.field} style={{ marginTop: "1rem" }}>
          <label className={styles.fieldLabel}>Número de série</label>
          <input
            className={styles.fieldInput}
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            placeholder="Ex: SN123456789"
          />
        </div>
        {error ? <p style={{ margin: "0.75rem 0 0", color: "var(--color-danger)", fontSize: "var(--font-size-sm)" }}>{error}</p> : null}

        <div className={styles.modalActions}>
          <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={!canSubmit} onClick={() => void handleSubmit()}>
            {saving ? "Salvando..." : "Salvar identificação"}
          </button>
        </div>
      </div>
    </div>
  );
}
