import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteClientAddress,
  duplicateClientAddress,
  listClientAddresses,
  updateClientAddress,
  type ClientAddressOut,
  type ClientAddressType,
  type ClientSiteOut,
} from "../../../api/clients";
import { toast } from "../../../lib/toast";
import { ListPaginationBar } from "../../ui/list-pagination";
import { RowActionsMenu, RowActionsMenuItem } from "../../ui/RowActionsMenu";
import styles from "../../../pages/clients/ClientDetail.module.css";
import { ADDRESS_TYPE_OPTIONS, ClientAddressDrawer } from "./ClientAddressDrawer";
import {
  IconCopy,
  IconDotsHorizontal,
  IconEdit,
  IconFileText,
  IconLoader,
  IconMail,
  IconMapPin,
  IconMoreVertical,
  IconPlus,
  IconStar,
  IconTool,
  IconTrash,
} from "./icons";
import { EmptyState, StatusPill } from "./shared";

const TYPE_META: Record<
  ClientAddressType,
  { label: string; description: string; icon: (props: { className?: string }) => JSX.Element; iconClass: string; textClass?: string }
> = {
  principal: {
    label: "Principal",
    description: "Endereço principal",
    icon: IconMapPin,
    iconClass: styles.typeIconBlue,
  },
  cobranca: {
    label: "Cobrança",
    description: "Endereço de cobrança",
    icon: IconFileText,
    iconClass: styles.typeIconOrange,
  },
  instalacao: {
    label: "Instalação",
    description: "Endereço de instalação",
    icon: IconTool,
    iconClass: styles.typeIconGreen,
  },
  correspondencia: {
    label: "Correspondência",
    description: "Endereço para correspondências",
    icon: IconMail,
    iconClass: styles.typeIconPurple,
  },
  outros: {
    label: "Outros",
    description: "Outros endereços",
    icon: IconDotsHorizontal,
    iconClass: styles.typeIconGray,
  },
};

const TYPE_TEXT_COLOR: Record<ClientAddressType, string> = {
  principal: "#0369a1",
  cobranca: "#c2410c",
  instalacao: "#15803d",
  correspondencia: "#7e22ce",
  outros: "#475569",
};

const FILTER_CHIPS: { value: "all" | ClientAddressType; label: string }[] = [
  { value: "all", label: "Todos" },
  ...ADDRESS_TYPE_OPTIONS,
];

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function formatCepDisplay(cep: string | null): string {
  if (!cep) return "";
  const digits = cep.replace(/\D/g, "");
  if (digits.length !== 8) return cep;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function siteBadge(site: ClientSiteOut | undefined) {
  if (!site) return null;
  return site.site_type === "matriz" ? (
    <span className={`${styles.pill} ${styles.pillPrimary}`}>Matriz</span>
  ) : (
    <span className={`${styles.pill} ${styles.pillPurple}`}>Filial</span>
  );
}

type Props = {
  clientId: number;
  isNew: boolean;
  readOnly?: boolean;
  sites: ClientSiteOut[];
  onAddressesChanged?: (count: number) => void;
};

export function ClientAddressesTab({ clientId, isNew, readOnly, sites, onAddressesChanged }: Props) {
  const [addresses, setAddresses] = useState<ClientAddressOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<"all" | ClientAddressType>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<ClientAddressOut | null>(null);

  const sitesById = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);

  const reload = useCallback(async () => {
    if (isNew) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await listClientAddresses(clientId);
      setAddresses(rows);
      onAddressesChanged?.(rows.length);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar os endereços.");
    } finally {
      setLoading(false);
    }
  }, [clientId, isNew, onAddressesChanged]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filteredAddresses = useMemo(() => {
    if (typeFilter === "all") return addresses;
    return addresses.filter((a) => a.address_type === typeFilter);
  }, [addresses, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredAddresses.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageAddresses = useMemo(
    () => filteredAddresses.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredAddresses, currentPage, pageSize],
  );

  function changeTypeFilter(value: "all" | ClientAddressType) {
    setTypeFilter(value);
    setPage(1);
  }

  function openNewDrawer() {
    setEditingAddress(null);
    setDrawerOpen(true);
  }

  function openEditDrawer(address: ClientAddressOut) {
    setEditingAddress(address);
    setDrawerOpen(true);
  }

  function onSaved() {
    setDrawerOpen(false);
    setEditingAddress(null);
    void reload();
  }

  async function onSetPrincipal(address: ClientAddressOut) {
    setBusyId(address.id);
    try {
      await updateClientAddress(clientId, address.id, { is_principal: true });
      toast.success("Endereço definido como principal.");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível definir o endereço como principal.");
    } finally {
      setBusyId(null);
    }
  }

  async function onDuplicate(address: ClientAddressOut) {
    setBusyId(address.id);
    try {
      await duplicateClientAddress(clientId, address.id);
      toast.success("Endereço duplicado.");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível duplicar o endereço.");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(address: ClientAddressOut) {
    if (!window.confirm("Excluir este endereço?")) return;
    setBusyId(address.id);
    try {
      await deleteClientAddress(clientId, address.id);
      toast.success("Endereço excluído.");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir o endereço.");
    } finally {
      setBusyId(null);
    }
  }

  if (isNew) {
    return (
      <div className={styles.tabPanel}>
        <section className={styles.card}>
          <p className={styles.cardHint}>Salve o cliente para cadastrar endereços.</p>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.tabPanel}>
      <section className={styles.card}>
        <div className={styles.cardHeadRow}>
          <div>
            <h3 className={styles.cardTitle}>Endereços cadastrados</h3>
            <p className={styles.cardHint}>Gerencie os endereços do cliente e suas unidades/filiais.</p>
          </div>
          {!readOnly ? (
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={openNewDrawer}>
              <IconPlus /> Adicionar endereço
            </button>
          ) : null}
        </div>

        <div className={styles.chipRow}>
          {FILTER_CHIPS.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`${styles.chip} ${typeFilter === c.value ? styles.chipActive : ""}`}
              onClick={() => changeTypeFilter(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className={styles.loading}>
            <IconLoader /> Carregando endereços…
          </p>
        ) : filteredAddresses.length === 0 ? (
          <EmptyState
            message={addresses.length === 0 ? "Nenhum endereço cadastrado ainda." : "Nenhum endereço encontrado para o filtro atual."}
          />
        ) : (
          <>
            <div className={`${styles.tableWrap} ${styles.addressesDesktopTable}`} style={{ marginTop: "1.25rem" }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Endereço</th>
                    <th>Referência</th>
                    <th>Unidade / Filial</th>
                    <th>Principal</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pageAddresses.map((a) => {
                    const meta = TYPE_META[a.address_type];
                    const Icon = meta.icon;
                    const site = a.client_site_id != null ? sitesById.get(a.client_site_id) : undefined;
                    return (
                      <tr key={a.id} style={{ height: "88px" }}>
                        <td>
                          <div className={styles.typeCell}>
                            <span className={`${styles.typeIconBadge} ${meta.iconClass}`} aria-hidden>
                              <Icon />
                            </span>
                            <span className={styles.typeCellText}>
                              <span className={styles.typeCellName} style={{ color: TYPE_TEXT_COLOR[a.address_type] }}>
                                {meta.label}
                              </span>
                              <span className={styles.typeCellDesc}>{meta.description}</span>
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.addressLines}>
                            <span>
                              {a.street ?? "—"}
                              {a.number ? `, ${a.number}` : ""}
                            </span>
                            <span>
                              {a.neighborhood ?? "—"}
                              {a.cep ? ` - CEP: ${formatCepDisplay(a.cep)}` : ""}
                            </span>
                            <span>
                              {a.city ?? "—"}
                              {a.state ? ` - ${a.state}` : ""}
                            </span>
                          </div>
                        </td>
                        <td>{a.reference_point?.trim() || "—"}</td>
                        <td>
                          {site ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                              <span>{site.name}</span>
                              {siteBadge(site)}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <StatusPill label={a.is_principal ? "Sim" : "Não"} tone={a.is_principal ? "success" : "muted"} />
                        </td>
                        <td>
                          {!readOnly ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "0.15rem" }}>
                              <button
                                type="button"
                                className={styles.btnGhostIcon}
                                onClick={() => openEditDrawer(a)}
                                disabled={busyId === a.id}
                                aria-label="Editar endereço"
                                title="Editar endereço"
                                style={{ color: "var(--color-primary)" }}
                              >
                                <IconEdit />
                              </button>
                              <button
                                type="button"
                                className={styles.btnGhostIcon}
                                onClick={() => void onDelete(a)}
                                disabled={busyId === a.id}
                                aria-label="Excluir endereço"
                                title="Excluir endereço"
                              >
                                {busyId === a.id ? <IconLoader /> : <IconTrash />}
                              </button>
                              <RowActionsMenu
                                ariaLabel="Mais ações"
                                preferUp
                                disabled={busyId === a.id}
                                triggerClassName={styles.btnGhostIcon}
                                trigger={<IconMoreVertical />}
                              >
                                <RowActionsMenuItem
                                  onSelect={() => void onSetPrincipal(a)}
                                  disabled={a.is_principal}
                                >
                                  <IconStar /> Definir como principal
                                </RowActionsMenuItem>
                                <RowActionsMenuItem onSelect={() => void onDuplicate(a)}>
                                  <IconCopy /> Duplicar endereço
                                </RowActionsMenuItem>
                              </RowActionsMenu>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className={styles.addressMobileList}>
              {pageAddresses.map((a) => {
                const meta = TYPE_META[a.address_type];
                const Icon = meta.icon;
                const site = a.client_site_id != null ? sitesById.get(a.client_site_id) : undefined;
                return (
                  <div key={a.id} className={styles.addressMobileCard}>
                    <div className={styles.addressMobileCardHead}>
                      <div className={styles.typeCell}>
                        <span className={`${styles.typeIconBadge} ${meta.iconClass}`} aria-hidden>
                          <Icon />
                        </span>
                        <span className={styles.typeCellText}>
                          <span className={styles.typeCellName} style={{ color: TYPE_TEXT_COLOR[a.address_type] }}>
                            {meta.label}
                          </span>
                          <span className={styles.typeCellDesc}>{meta.description}</span>
                        </span>
                      </div>
                      <StatusPill label={a.is_principal ? "Sim" : "Não"} tone={a.is_principal ? "success" : "muted"} />
                    </div>
                    <div className={styles.addressMobileCardMeta}>
                      <span>
                        <strong>
                          {a.street ?? "—"}
                          {a.number ? `, ${a.number}` : ""}
                        </strong>
                      </span>
                      <span>
                        {a.neighborhood ?? "—"}
                        {a.cep ? ` - CEP: ${formatCepDisplay(a.cep)}` : ""}
                      </span>
                      <span>
                        {a.city ?? "—"}
                        {a.state ? ` - ${a.state}` : ""}
                      </span>
                      {a.reference_point ? <span>Referência: {a.reference_point}</span> : null}
                      {site ? (
                        <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          {site.name} {siteBadge(site)}
                        </span>
                      ) : null}
                    </div>
                    {!readOnly ? (
                      <div className={styles.addressMobileCardFooter}>
                        <button type="button" className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`} onClick={() => openEditDrawer(a)}>
                          <IconEdit /> Editar
                        </button>
                        <div style={{ display: "flex", gap: "0.4rem" }}>
                          <button
                            type="button"
                            className={styles.btnGhostIcon}
                            onClick={() => void onDuplicate(a)}
                            aria-label="Duplicar endereço"
                          >
                            <IconCopy />
                          </button>
                          <button
                            type="button"
                            className={styles.btnGhostIcon}
                            onClick={() => void onDelete(a)}
                            aria-label="Excluir endereço"
                          >
                            <IconTrash />
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className={styles.paginationFooterRow}>
              <ListPaginationBar
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredAddresses.length}
                itemsPerPage={pageSize}
                onPageChange={setPage}
                itemLabel="endereço"
                itemLabelPlural="endereços"
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
      </section>

      <ClientAddressDrawer
        open={drawerOpen}
        clientId={clientId}
        editingAddress={editingAddress}
        sites={sites}
        onClose={() => {
          setDrawerOpen(false);
          setEditingAddress(null);
        }}
        onSaved={onSaved}
      />
    </div>
  );
}
