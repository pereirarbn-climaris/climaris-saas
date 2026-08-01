import { useState, type ReactNode } from "react";
import type { ClientData, ClientRegime, ClientType } from "../../v0-ui/clients";
import type { ClientSiteOut, ClientSiteType } from "../../../api/clients";
import { digitsOnly, formatCpfInput, formatCnpjInput, formatPhoneBrInput } from "../../../lib/brMask";
import { FormSwitch } from "../../ui/form-switch";
import styles from "../../../pages/clients/ClientDetail.module.css";
import {
  IconBuilding,
  IconUser,
  IconMapPin,
  IconUsers,
  IconTool,
  IconShield,
  IconFileText,
  IconClipboardList,
  IconWallet,
  IconHistory,
  IconChevronRight,
  IconSearch,
  IconLoader,
  IconPlus,
  IconX,
} from "./icons";
import { EmptyState, formatDateTimeBR, StatusPill } from "./shared";
import type { DetailTabId } from "./types";

const REGIME_OPTIONS: { value: ClientRegime; label: string }[] = [
  { value: "mei", label: "MEI" },
  { value: "simples", label: "Simples Nacional" },
  { value: "lucro_presumido", label: "Lucro Presumido" },
  { value: "lucro_real", label: "Lucro Real" },
  { value: "isento", label: "Isento" },
];

const SUGGESTED_TAGS = ["Contrato PMOC", "Cliente recorrente", "Cliente avulso", "Preferencial", "Inadimplente"];

const SITE_TYPE_LABEL: Record<ClientSiteType, string> = {
  matriz: "Matriz",
  filial: "Filial",
  unidade_operacional: "Unidade operacional",
  local_instalacao: "Local de instalação",
  sem_cnpj: "Sem CNPJ próprio",
};

export type RegistrationSummary = {
  addresses: number;
  contacts: number;
  equipments: number;
  pmocLabel: string;
  contracts: number;
  ordersCount: number;
  financeLabel: string;
  historyLabel: string;
  unitsCount: number;
  activeBranches: number;
  matrizName?: string;
};

type Props = {
  client: ClientData;
  onClientChange: (patch: Partial<ClientData>) => void;
  onDocumentoBlur?: () => void;
  onWhatsappBlur?: () => void;
  documentoDuplicateMessage?: string;
  whatsappDuplicateMessage?: string;
  onConsultCNPJ?: (cnpj: string) => void;
  onConsultCNPJCommercial?: (cnpj: string) => void;
  onRefreshCnpjCommercial?: () => void;
  loadingCNPJ?: boolean;
  loadingCNPJCommercial?: boolean;
  loadingCnpjCommercialRefresh?: boolean;
  cnpjCommercialCooldownDays?: number | null;
  fiscalFieldsLocked?: boolean;
  readOnly?: boolean;
  isNew: boolean;
  summary: RegistrationSummary;
  onNavigateTab: (tab: DetailTabId) => void;
  sites: ClientSiteOut[];
  onAddUnit: () => void;
  onEditUnit: (site: ClientSiteOut) => void;
};

function SummaryTile({
  icon,
  title,
  value,
  hint,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.itemCard} onClick={onClick} style={{ width: "100%", textAlign: "left", cursor: "pointer" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0 }}>
        <span className={styles.summaryTileIcon} aria-hidden>
          {icon}
        </span>
        <span className={styles.itemCardMain}>
          <span className={styles.itemCardTitle}>{title}</span>
          <span className={styles.itemCardMeta}>
            <span>{value}</span>
            {hint ? <span>· {hint}</span> : null}
          </span>
        </span>
      </div>
      <span className={styles.btnGhostIcon} aria-hidden>
        <IconChevronRight />
      </span>
    </button>
  );
}

export function ClientRegistrationTab({
  client,
  onClientChange,
  onDocumentoBlur,
  onWhatsappBlur,
  documentoDuplicateMessage,
  whatsappDuplicateMessage,
  onConsultCNPJ,
  onConsultCNPJCommercial,
  onRefreshCnpjCommercial,
  loadingCNPJ,
  loadingCNPJCommercial,
  loadingCnpjCommercialRefresh,
  cnpjCommercialCooldownDays,
  fiscalFieldsLocked,
  readOnly,
  isNew,
  summary,
  onNavigateTab,
  sites,
  onAddUnit,
  onEditUnit,
}: Props) {
  const coreLocked = Boolean(readOnly || fiscalFieldsLocked);
  const enrichmentLocked = Boolean(readOnly || (fiscalFieldsLocked && client.type === "pj"));
  const canConsultCnpj = client.type === "pj" && digitsOnly(client.documento ?? "").length === 14;
  const cnpjBusy = Boolean(loadingCNPJ || loadingCNPJCommercial);
  const cooldownActive = (cnpjCommercialCooldownDays ?? 0) > 0;
  const [tagInput, setTagInput] = useState("");
  const tags = client.tags ?? [];
  const notesLength = (client.notes ?? "").length;

  function addTag(tag: string) {
    const clean = tag.trim();
    if (!clean || readOnly) return;
    if (tags.some((t) => t.toLowerCase() === clean.toLowerCase())) return;
    onClientChange({ tags: [...tags, clean] });
  }

  function removeTag(tag: string) {
    if (readOnly) return;
    onClientChange({ tags: tags.filter((t) => t !== tag) });
  }

  function setType(next: ClientType) {
    if (coreLocked) return;
    onClientChange({ type: next });
  }

  function onDocumentoChange(v: string) {
    onClientChange({ documento: client.type === "pf" ? formatCpfInput(v) : formatCnpjInput(v) });
  }

  return (
    <div className={styles.tabPanel}>
      <section className={styles.card}>
        <div className={styles.cardHeadRow}>
          <div>
            <h3 className={styles.cardTitle}>Tipo de cliente</h3>
            <p className={styles.cardHint}>Selecione o tipo de cadastro e mantenha os dados fiscais atualizados.</p>
          </div>
          <div className={styles.statusRow}>
            <div className={styles.statusRowControl}>
              <span className={styles.statusRowLabel}>{client.isActive !== false ? "Ativo" : "Inativo"}</span>
              <FormSwitch
                id="client-status-switch"
                checked={client.isActive !== false}
                onChange={(v) => onClientChange({ isActive: v })}
                disabled={readOnly}
                ariaLabel="Status do cadastro"
              />
            </div>
            {!isNew && client.createdAt ? (
              <span className={styles.statusRowLabel} style={{ fontWeight: 500 }}>
                Cadastrado em {formatDateTimeBR(client.createdAt)} · Cliente desde {new Date(client.createdAt).getFullYear()}
              </span>
            ) : null}
          </div>
        </div>

        <div className={styles.segmented} role="radiogroup" aria-label="Tipo de cliente">
          <button
            type="button"
            role="radio"
            aria-checked={client.type === "pf"}
            className={`${styles.segmentedBtn} ${client.type === "pf" ? styles.segmentedBtnActive : ""}`}
            onClick={() => setType("pf")}
            disabled={coreLocked}
          >
            <IconUser /> Pessoa Física
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={client.type === "pj"}
            className={`${styles.segmentedBtn} ${client.type === "pj" ? styles.segmentedBtnActive : ""}`}
            onClick={() => setType("pj")}
            disabled={coreLocked}
          >
            <IconBuilding /> Pessoa Jurídica
          </button>
        </div>

        <div className={styles.divider} />

        {client.type === "pj" ? (
          <div className={styles.fieldGrid}>
            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel} htmlFor="f-cnpj">
                CNPJ<span className={styles.fieldRequired}>*</span>
              </label>
              <div className={styles.fieldWithBtn}>
                <input
                  id="f-cnpj"
                  className={styles.fieldInput}
                  placeholder="00.000.000/0000-00"
                  value={client.documento || ""}
                  onChange={(e) => onDocumentoChange(e.target.value)}
                  onBlur={onDocumentoBlur}
                  disabled={coreLocked}
                  style={{ flex: 1 }}
                />
                {!fiscalFieldsLocked && onConsultCNPJ ? (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSecondary}`}
                    onClick={() => canConsultCnpj && !cnpjBusy && onConsultCNPJ(client.documento!)}
                    disabled={!canConsultCnpj || cnpjBusy || coreLocked}
                    title="Buscar dados na Receita Federal"
                  >
                    {loadingCNPJ ? <IconLoader /> : <IconSearch />}
                    Buscar dados Receita Federal
                  </button>
                ) : null}
                {!fiscalFieldsLocked && onConsultCNPJCommercial ? (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSecondary}`}
                    onClick={() => canConsultCnpj && !cnpjBusy && onConsultCNPJCommercial(client.documento!)}
                    disabled={!canConsultCnpj || cnpjBusy || coreLocked}
                    title="Consulta comercial CNPJá: razão social, nome fantasia, endereço, regime, CNAE e natureza jurídica"
                  >
                    {loadingCNPJCommercial ? <IconLoader /> : <IconSearch />}
                    Consultar CNPJ na Receita
                  </button>
                ) : null}
              </div>
              {documentoDuplicateMessage ? <p className={styles.fieldError}>{documentoDuplicateMessage}</p> : null}
              {fiscalFieldsLocked && onRefreshCnpjCommercial ? (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                  style={{ marginTop: "0.5rem", alignSelf: "flex-start" }}
                  onClick={() => !cooldownActive && onRefreshCnpjCommercial()}
                  disabled={readOnly || loadingCnpjCommercialRefresh}
                  title={cooldownActive ? `Próxima consulta em ~${cnpjCommercialCooldownDays} dia(s).` : "Atualizar via Receita (Comercial)"}
                >
                  {loadingCnpjCommercialRefresh ? <IconLoader /> : <IconSearch />}
                  Atualizar via Receita (Comercial)
                </button>
              ) : null}
            </div>

            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label className={styles.fieldLabel} htmlFor="f-razao">
                Razão Social<span className={styles.fieldRequired}>*</span>
              </label>
              <input
                id="f-razao"
                className={styles.fieldInput}
                value={client.razaoSocial || ""}
                onChange={(e) => onClientChange({ razaoSocial: e.target.value })}
                disabled={coreLocked}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="f-fantasia">
                Nome Fantasia
              </label>
              <input
                id="f-fantasia"
                className={styles.fieldInput}
                value={client.nomeFantasia || ""}
                onChange={(e) => onClientChange({ nomeFantasia: e.target.value })}
                disabled={readOnly}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="f-ie">
                Inscrição Estadual
              </label>
              <input
                id="f-ie"
                className={styles.fieldInput}
                value={client.stateRegistration || ""}
                onChange={(e) => onClientChange({ stateRegistration: e.target.value })}
                disabled={readOnly}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="f-im">
                Inscrição Municipal
              </label>
              <input
                id="f-im"
                className={styles.fieldInput}
                value={client.municipalRegistration || ""}
                onChange={(e) => onClientChange({ municipalRegistration: e.target.value })}
                disabled={readOnly}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="f-regime">
                Regime Tributário
              </label>
              <select
                id="f-regime"
                className={styles.fieldSelect}
                value={client.regime || "simples"}
                onChange={(e) => onClientChange({ regime: e.target.value as ClientRegime })}
                disabled={enrichmentLocked}
              >
                {REGIME_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="f-responsavel">
                Responsável pela empresa
              </label>
              <input
                id="f-responsavel"
                className={styles.fieldInput}
                value={client.contactPersonName || ""}
                onChange={(e) => onClientChange({ contactPersonName: e.target.value })}
                disabled={readOnly}
              />
            </div>
          </div>
        ) : client.type === "pf" ? (
          <div className={styles.fieldGrid}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="f-nome">
                Nome completo<span className={styles.fieldRequired}>*</span>
              </label>
              <input
                id="f-nome"
                className={styles.fieldInput}
                value={client.razaoSocial || ""}
                onChange={(e) => onClientChange({ razaoSocial: e.target.value })}
                disabled={coreLocked}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="f-cpf">
                CPF<span className={styles.fieldRequired}>*</span>
              </label>
              <input
                id="f-cpf"
                className={styles.fieldInput}
                placeholder="000.000.000-00"
                value={client.documento || ""}
                onChange={(e) => onDocumentoChange(e.target.value)}
                onBlur={onDocumentoBlur}
                disabled={coreLocked}
              />
              {documentoDuplicateMessage ? <p className={styles.fieldError}>{documentoDuplicateMessage}</p> : null}
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="f-rg">
                RG
              </label>
              <input
                id="f-rg"
                className={styles.fieldInput}
                value={client.rg || ""}
                onChange={(e) => onClientChange({ rg: e.target.value })}
                disabled={readOnly}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="f-nasc">
                Data de nascimento
              </label>
              <input
                id="f-nasc"
                type="date"
                className={styles.fieldInput}
                value={client.birthDate || ""}
                onChange={(e) => onClientChange({ birthDate: e.target.value })}
                disabled={readOnly}
              />
            </div>
          </div>
        ) : (
          <p className={styles.cardHint}>Selecione Pessoa Física ou Pessoa Jurídica para continuar o cadastro.</p>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeadRow}>
          <div>
            <h3 className={styles.cardTitle}>Contato principal</h3>
            <p className={styles.cardHint}>
              Canal padrão de comunicação. Cadastre contatos adicionais (financeiro, PMOC, cargos) na aba «Contatos».
            </p>
          </div>
        </div>
        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="f-wa">
              WhatsApp principal<span className={styles.fieldRequired}>*</span>
            </label>
            <input
              id="f-wa"
              className={styles.fieldInput}
              placeholder="(00) 00000-0000"
              value={client.whatsapp || ""}
              onChange={(e) => onClientChange({ whatsapp: formatPhoneBrInput(e.target.value) })}
              onBlur={onWhatsappBlur}
              disabled={readOnly}
            />
            {whatsappDuplicateMessage ? <p className={styles.fieldError}>{whatsappDuplicateMessage}</p> : null}
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="f-tel">
              Telefone fixo
            </label>
            <input
              id="f-tel"
              className={styles.fieldInput}
              placeholder="(00) 0000-0000"
              value={client.telefone || ""}
              onChange={(e) => onClientChange({ telefone: formatPhoneBrInput(e.target.value) })}
              disabled={readOnly}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="f-email">
              E-mail principal
            </label>
            <input
              id="f-email"
              type="email"
              className={styles.fieldInput}
              value={client.email || ""}
              onChange={(e) => onClientChange({ email: e.target.value })}
              disabled={readOnly}
            />
          </div>
          {client.type === "pf" ? (
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="f-resp-contato">
                Responsável pelo contato
              </label>
              <input
                id="f-resp-contato"
                className={styles.fieldInput}
                value={client.contactPersonName || ""}
                onChange={(e) => onClientChange({ contactPersonName: e.target.value })}
                disabled={readOnly}
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeadRow}>
          <div>
            <h3 className={styles.cardTitle}>Observações e categorias</h3>
            <p className={styles.cardHint}>Notas internas e tags para segmentar este cliente.</p>
          </div>
        </div>
        <div className={styles.cardsGrid2}>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="f-notes">
              Observações
            </label>
            <textarea
              id="f-notes"
              className={styles.fieldTextarea}
              style={{ minHeight: "6rem" }}
              maxLength={500}
              value={client.notes ?? ""}
              onChange={(e) => onClientChange({ notes: e.target.value })}
              disabled={readOnly}
            />
            <p className={styles.charCount}>{notesLength}/500</p>
          </div>
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="f-tag-input">
              Tags / categorias
            </label>
            <div className={styles.fieldWithBtn}>
              <input
                id="f-tag-input"
                className={styles.fieldInput}
                style={{ flex: 1 }}
                placeholder="Digite e pressione Enter"
                value={tagInput}
                disabled={readOnly}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag(tagInput);
                    setTagInput("");
                  }
                }}
              />
            </div>
            <div className={styles.tagsWrap}>
              {tags.length === 0 ? <span className={styles.cardHint}>Nenhuma tag adicionada.</span> : null}
              {tags.map((tag) => (
                <span key={tag} className={styles.tagChip}>
                  {tag}
                  {!readOnly ? (
                    <button type="button" className={styles.tagChipRemove} onClick={() => removeTag(tag)} aria-label={`Remover ${tag}`}>
                      <IconX />
                    </button>
                  ) : null}
                </span>
              ))}
            </div>
            <div className={styles.tagSuggestRow}>
              {SUGGESTED_TAGS.filter((t) => !tags.includes(t)).map((t) => (
                <button key={t} type="button" className={styles.tagSuggestBtn} disabled={readOnly} onClick={() => addTag(t)}>
                  + {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {!isNew ? (
        <section className={styles.card}>
          <div className={styles.cardHeadRow}>
            <div>
              <h3 className={styles.cardTitle}>Unidades / Filiais cadastradas</h3>
              <p className={styles.cardHint}>Gerencie matriz, unidades, filiais e locais de instalação vinculados a este cliente.</p>
            </div>
            {!readOnly ? (
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onAddUnit}>
                <IconPlus /> Adicionar unidade / filial
              </button>
            ) : null}
          </div>
          {sites.length === 0 ? (
            <EmptyState message="Nenhuma unidade ou filial cadastrada ainda." />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Nome da unidade</th>
                    <th>Tipo</th>
                    <th>CNPJ / CPF</th>
                    <th>Cidade - UF</th>
                    <th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{SITE_TYPE_LABEL[s.site_type] ?? s.site_type}</td>
                      <td>{s.document ? formatCnpjInput(s.document) : "—"}</td>
                      <td>{s.city ? `${s.city}${s.state ? ` - ${s.state}` : ""}` : "—"}</td>
                      <td>
                        <StatusPill label={s.is_active ? "Ativa" : "Inativa"} tone={s.is_active ? "success" : "muted"} />
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          {!readOnly ? (
                            <button type="button" className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`} onClick={() => onEditUnit(s)}>
                              Editar
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSm}`}
                            onClick={() => onNavigateTab("unidades")}
                          >
                            Ver mais
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {!isNew ? (
        <section>
          <div className={styles.cardHeadRow} style={{ marginBottom: "0.75rem" }}>
            <h3 className={styles.cardTitle}>Visão geral do cliente</h3>
          </div>
          <div className={styles.cardsGrid2}>
            <SummaryTile
              icon={<IconBuilding />}
              title="Unidades / Filiais"
              value={`${summary.unitsCount} cadastrada(s)`}
              hint={`Matriz: ${summary.matrizName ?? "—"} · ${summary.activeBranches} filial(is) ativa(s)`}
              onClick={() => onNavigateTab("unidades")}
            />
            <SummaryTile
              icon={<IconMapPin />}
              title="Endereços"
              value={`${summary.addresses} cadastrado(s)`}
              onClick={() => onNavigateTab("enderecos")}
            />
            <SummaryTile
              icon={<IconUsers />}
              title="Contatos"
              value={`${summary.contacts} contato(s)`}
              onClick={() => onNavigateTab("contatos")}
            />
            <SummaryTile
              icon={<IconTool />}
              title="Equipamentos"
              value={`${summary.equipments} cadastrado(s)`}
              onClick={() => onNavigateTab("equipamentos")}
            />
            <SummaryTile icon={<IconShield />} title="PMOC" value={summary.pmocLabel} onClick={() => onNavigateTab("pmoc")} />
            <SummaryTile
              icon={<IconFileText />}
              title="Contratos"
              value={`${summary.contracts} contrato(s)`}
              onClick={() => onNavigateTab("contratos")}
            />
            <SummaryTile
              icon={<IconClipboardList />}
              title="Ordens de serviço"
              value={`${summary.ordersCount} no total`}
              onClick={() => onNavigateTab("ordens")}
            />
            <SummaryTile icon={<IconWallet />} title="Financeiro" value={summary.financeLabel} onClick={() => onNavigateTab("financeiro")} />
            <SummaryTile
              icon={<IconHistory />}
              title="Histórico"
              value={summary.historyLabel}
              onClick={() => onNavigateTab("historico")}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
