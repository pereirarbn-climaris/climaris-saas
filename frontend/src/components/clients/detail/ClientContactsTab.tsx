import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteClientContact,
  duplicateClientContact,
  listClientContacts,
  updateClientContact,
  type ClientContactCategory,
  type ClientContactOut,
  type ClientSiteOut,
} from "../../../api/clients";
import { formatPhoneBrDisplay, whatsappMeUrl } from "../../../lib/brMask";
import { toast } from "../../../lib/toast";
import { ListPaginationBar } from "../../ui/list-pagination";
import { RowActionsMenu, RowActionsMenuItem, RowActionsMenuLink } from "../../ui/RowActionsMenu";
import styles from "../../../pages/clients/ClientDetail.module.css";
import { CONTACT_CATEGORY_OPTIONS, ClientContactDrawer } from "./ClientContactDrawer";
import {
  IconCopy,
  IconEdit,
  IconLoader,
  IconMail,
  IconMessageCircle,
  IconMoreVertical,
  IconPhone,
  IconPlus,
  IconStar,
  IconTrash,
  IconWhatsApp,
} from "./icons";
import { EmptyState, StatusPill } from "./shared";

const CATEGORY_META: Record<
  ClientContactCategory,
  { label: string; chipLabel: string; pillClass: string; avatarBg: string; avatarColor: string }
> = {
  responsavel: {
    label: "Responsável",
    chipLabel: "Responsáveis",
    pillClass: styles.pillPrimary,
    avatarBg: "#e0f2fe",
    avatarColor: "#0c4a6e",
  },
  tecnico: {
    label: "Técnico",
    chipLabel: "Técnicos",
    pillClass: styles.pillSuccess,
    avatarBg: "#dcfce7",
    avatarColor: "#166534",
  },
  financeiro: {
    label: "Financeiro",
    chipLabel: "Financeiro",
    pillClass: styles.pillPurple,
    avatarBg: "#f3e8ff",
    avatarColor: "#6b21a8",
  },
  administrativo: {
    label: "Administrativo",
    chipLabel: "Administrativo",
    pillClass: styles.pillSky,
    avatarBg: "#f0f9ff",
    avatarColor: "#0284c7",
  },
  comercial: {
    label: "Comercial",
    chipLabel: "Comercial",
    pillClass: styles.pillOrange,
    avatarBg: "#ffedd5",
    avatarColor: "#c2410c",
  },
  outros: {
    label: "Outros",
    chipLabel: "Outros",
    pillClass: styles.pillMuted,
    avatarBg: "#e2e8f0",
    avatarColor: "#475569",
  },
};

const FILTER_CHIPS: { value: "all" | ClientContactCategory; label: string }[] = [
  { value: "all", label: "Todos" },
  ...CONTACT_CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: CATEGORY_META[o.value].chipLabel })),
];

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function initials(name: string): string {
  const chunks = name.trim().split(/\s+/).filter(Boolean);
  if (chunks.length === 0) return "?";
  if (chunks.length === 1) return chunks[0]!.slice(0, 2).toUpperCase();
  return `${chunks[0]![0] ?? ""}${chunks[1]![0] ?? ""}`.toUpperCase();
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
  onContactsChanged?: (count: number) => void;
};

export function ClientContactsTab({ clientId, isNew, readOnly, sites, onContactsChanged }: Props) {
  const [contacts, setContacts] = useState<ClientContactOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<"all" | ClientContactCategory>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<ClientContactOut | null>(null);

  const sitesById = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);

  const reload = useCallback(async () => {
    if (isNew) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await listClientContacts(clientId);
      setContacts(rows);
      onContactsChanged?.(rows.length);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar os contatos.");
    } finally {
      setLoading(false);
    }
  }, [clientId, isNew, onContactsChanged]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filteredContacts = useMemo(() => {
    if (categoryFilter === "all") return contacts;
    return contacts.filter((c) => c.category === categoryFilter);
  }, [contacts, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredContacts.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageContacts = useMemo(
    () => filteredContacts.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredContacts, currentPage, pageSize],
  );

  function changeCategoryFilter(value: "all" | ClientContactCategory) {
    setCategoryFilter(value);
    setPage(1);
  }

  function openNewDrawer() {
    setEditingContact(null);
    setDrawerOpen(true);
  }

  function openEditDrawer(contact: ClientContactOut) {
    setEditingContact(contact);
    setDrawerOpen(true);
  }

  function onSaved() {
    setDrawerOpen(false);
    setEditingContact(null);
    void reload();
  }

  async function onSetPrincipal(contact: ClientContactOut) {
    setBusyId(contact.id);
    try {
      await updateClientContact(clientId, contact.id, { is_principal: true });
      toast.success("Contato definido como principal.");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível definir o contato como principal.");
    } finally {
      setBusyId(null);
    }
  }

  async function onDuplicate(contact: ClientContactOut) {
    setBusyId(contact.id);
    try {
      await duplicateClientContact(clientId, contact.id);
      toast.success("Contato duplicado.");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível duplicar o contato.");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(contact: ClientContactOut) {
    if (!window.confirm(`Excluir o contato "${contact.name}"?`)) return;
    setBusyId(contact.id);
    try {
      await deleteClientContact(clientId, contact.id);
      toast.success("Contato excluído.");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir o contato.");
    } finally {
      setBusyId(null);
    }
  }

  function contactLines(c: ClientContactOut) {
    const wa = whatsappMeUrl(c.whatsapp);
    return (
      <div className={styles.contactLines}>
        <span className={`${styles.contactLine} ${styles.contactLineWhatsapp}`}>
          <IconWhatsApp />
          {wa ? (
            <a href={wa} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              {formatPhoneBrDisplay(c.whatsapp)}
            </a>
          ) : (
            "—"
          )}
        </span>
        <span className={`${styles.contactLine} ${styles.contactLinePhone}`}>
          <IconPhone />
          {c.phone ? formatPhoneBrDisplay(c.phone) : "—"}
        </span>
      </div>
    );
  }

  if (isNew) {
    return (
      <div className={styles.tabPanel}>
        <section className={styles.card}>
          <p className={styles.cardHint}>Salve o cliente para cadastrar contatos.</p>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.tabPanel}>
      <section className={styles.card}>
        <div className={styles.cardHeadRow}>
          <div>
            <h3 className={styles.cardTitle}>Contatos cadastrados</h3>
            <p className={styles.cardHint}>Gerencie os contatos do cliente e de suas unidades/filiais.</p>
          </div>
          {!readOnly ? (
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={openNewDrawer}>
              <IconPlus /> Adicionar contato
            </button>
          ) : null}
        </div>

        <div className={styles.chipRow}>
          {FILTER_CHIPS.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`${styles.chip} ${categoryFilter === c.value ? styles.chipActive : ""}`}
              onClick={() => changeCategoryFilter(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className={styles.loading}>
            <IconLoader /> Carregando contatos…
          </p>
        ) : filteredContacts.length === 0 ? (
          <EmptyState
            message={contacts.length === 0 ? "Nenhum contato cadastrado ainda." : "Nenhum contato encontrado para o filtro atual."}
          />
        ) : (
          <>
            <div className={`${styles.tableWrap} ${styles.contactsDesktopTable}`} style={{ marginTop: "1.25rem" }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Contato</th>
                    <th>Cargo / Função</th>
                    <th>Unidade / Filial</th>
                    <th>Telefone / WhatsApp</th>
                    <th>E-mail</th>
                    <th>Principal</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pageContacts.map((c) => {
                    const meta = CATEGORY_META[c.category];
                    const site = c.client_site_id != null ? sitesById.get(c.client_site_id) : undefined;
                    const mailHref = c.email ? `mailto:${c.email}` : null;
                    const wa = whatsappMeUrl(c.whatsapp);
                    return (
                      <tr key={c.id} style={{ height: "88px" }}>
                        <td>
                          <div className={styles.contactCell}>
                            <span
                              className={styles.avatarCircle}
                              style={{ background: meta.avatarBg, color: meta.avatarColor }}
                              aria-hidden
                            >
                              {initials(c.name)}
                            </span>
                            <span className={styles.contactCellText}>
                              <span className={styles.contactCellName}>{c.name}</span>
                              <span className={`${styles.pill} ${meta.pillClass}`}>{meta.label}</span>
                            </span>
                          </div>
                        </td>
                        <td>{c.role?.trim() || "—"}</td>
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
                        <td>{contactLines(c)}</td>
                        <td>{c.email ?? "—"}</td>
                        <td>
                          <StatusPill label={c.is_principal ? "Sim" : "Não"} tone={c.is_principal ? "success" : "muted"} />
                          {c.is_principal ? <div className={styles.principalHint}>Responsável principal</div> : null}
                        </td>
                        <td>
                          {!readOnly ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "0.15rem" }}>
                              <button
                                type="button"
                                className={styles.btnGhostIcon}
                                onClick={() => openEditDrawer(c)}
                                disabled={busyId === c.id}
                                aria-label="Editar contato"
                                title="Editar contato"
                                style={{ color: "var(--color-primary)" }}
                              >
                                <IconEdit />
                              </button>
                              <button
                                type="button"
                                className={styles.btnGhostIcon}
                                onClick={() => void onDelete(c)}
                                disabled={busyId === c.id}
                                aria-label="Excluir contato"
                                title="Excluir contato"
                              >
                                {busyId === c.id ? <IconLoader /> : <IconTrash />}
                              </button>
                              <RowActionsMenu
                                ariaLabel="Mais ações"
                                preferUp
                                disabled={busyId === c.id}
                                triggerClassName={styles.btnGhostIcon}
                                trigger={<IconMoreVertical />}
                              >
                                <RowActionsMenuItem
                                  onSelect={() => void onSetPrincipal(c)}
                                  disabled={c.is_principal}
                                >
                                  <IconStar /> Definir como principal
                                </RowActionsMenuItem>
                                <RowActionsMenuItem onSelect={() => void onDuplicate(c)}>
                                  <IconCopy /> Duplicar contato
                                </RowActionsMenuItem>
                                {wa ? (
                                  <RowActionsMenuLink href={wa} target="_blank" rel="noopener noreferrer">
                                    <IconMessageCircle /> Enviar WhatsApp
                                  </RowActionsMenuLink>
                                ) : null}
                                {mailHref ? (
                                  <RowActionsMenuLink href={mailHref}>
                                    <IconMail /> Enviar e-mail
                                  </RowActionsMenuLink>
                                ) : null}
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

            <div className={styles.contactMobileList}>
              {pageContacts.map((c) => {
                const meta = CATEGORY_META[c.category];
                const site = c.client_site_id != null ? sitesById.get(c.client_site_id) : undefined;
                const wa = whatsappMeUrl(c.whatsapp);
                return (
                  <div key={c.id} className={styles.contactMobileCard}>
                    <div className={styles.contactMobileCardHead}>
                      <div className={styles.contactCell}>
                        <span
                          className={styles.avatarCircle}
                          style={{ background: meta.avatarBg, color: meta.avatarColor }}
                          aria-hidden
                        >
                          {initials(c.name)}
                        </span>
                        <span className={styles.contactCellText}>
                          <span className={styles.contactCellName}>{c.name}</span>
                          <span className={`${styles.pill} ${meta.pillClass}`}>{meta.label}</span>
                        </span>
                      </div>
                      <StatusPill label={c.is_principal ? "Sim" : "Não"} tone={c.is_principal ? "success" : "muted"} />
                    </div>
                    <div className={styles.contactMobileCardMeta}>
                      {c.role ? <span><strong>{c.role}</strong></span> : null}
                      {site ? (
                        <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          {site.name} {siteBadge(site)}
                        </span>
                      ) : null}
                      <span>{contactLines(c)}</span>
                      <span>{c.email ?? "—"}</span>
                    </div>
                    {!readOnly ? (
                      <div className={styles.contactMobileCardFooter}>
                        <button type="button" className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`} onClick={() => openEditDrawer(c)}>
                          <IconEdit /> Editar
                        </button>
                        <div style={{ display: "flex", gap: "0.4rem" }}>
                          {wa ? (
                            <a href={wa} target="_blank" rel="noopener noreferrer" className={styles.btnGhostIcon} aria-label="Enviar WhatsApp">
                              <IconMessageCircle />
                            </a>
                          ) : null}
                          <button
                            type="button"
                            className={styles.btnGhostIcon}
                            onClick={() => void onDuplicate(c)}
                            aria-label="Duplicar contato"
                          >
                            <IconCopy />
                          </button>
                          <button
                            type="button"
                            className={styles.btnGhostIcon}
                            onClick={() => void onDelete(c)}
                            aria-label="Excluir contato"
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
                totalItems={filteredContacts.length}
                itemsPerPage={pageSize}
                onPageChange={setPage}
                itemLabel="contato"
                itemLabelPlural="contatos"
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

      <ClientContactDrawer
        open={drawerOpen}
        clientId={clientId}
        editingContact={editingContact}
        sites={sites}
        onClose={() => {
          setDrawerOpen(false);
          setEditingContact(null);
        }}
        onSaved={onSaved}
      />
    </div>
  );
}
