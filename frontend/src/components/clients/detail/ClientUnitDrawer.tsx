import { useEffect, useState } from "react";
import {
  createClientSite,
  updateClientSite,
  type ClientSiteOut,
  type ClientSitePayload,
  type ClientSiteType,
} from "../../../api/clients";
import { fetchCepLookup, cepLookupHasUsefulData, cepLookupSuccessMessage } from "../../../api/cep";
import { fetchCnpjCommercial, fetchCnpjOpen } from "../../../api/cnpj";
import { digitsOnly, formatCepInput, formatCnpjInput, formatPhoneBrInput, isValidCnpjDigits } from "../../../lib/brMask";
import { StreetAddressLookupInput } from "../../v0-ui/clients/StreetAddressLookupInput";
import { FormSwitch } from "../../ui/form-switch";
import { toast } from "../../../lib/toast";
import styles from "../../../pages/clients/ClientDetail.module.css";
import { IconCheck, IconInfo, IconLoader, IconMail, IconSave, IconSearch, IconWhatsApp, IconX } from "./icons";

const UF_OPTIONS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE",
  "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

const SITE_TYPE_OPTIONS: { value: ClientSiteType; label: string }[] = [
  { value: "matriz", label: "Matriz" },
  { value: "filial", label: "Filial" },
  { value: "unidade_operacional", label: "Unidade operacional" },
  { value: "local_instalacao", label: "Local de instalação" },
];

type FormState = Omit<ClientSitePayload, "site_type"> & { site_type: ClientSiteType | "" };

function emptyForm(): FormState {
  return {
    name: "",
    site_type: "",
    nickname: "",
    contact_name: "",
    responsible_role: "",
    phone: "",
    email: "",
    has_own_document: false,
    document: "",
    legal_name: "",
    trade_name: "",
    state_registration: "",
    municipal_registration: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    cep: "",
    reference_point: "",
    has_equipment: true,
    participates_pmoc: false,
    use_main_contacts: true,
    use_main_billing_address: true,
    is_active: true,
    notes: "",
  };
}

function siteToForm(s: ClientSiteOut): FormState {
  return {
    name: s.name,
    site_type: s.site_type,
    nickname: s.nickname ?? "",
    contact_name: s.contact_name ?? "",
    responsible_role: s.responsible_role ?? "",
    phone: s.phone ? formatPhoneBrInput(s.phone) : "",
    email: s.email ?? "",
    has_own_document: s.has_own_document,
    document: s.document ? formatCnpjInput(s.document) : "",
    legal_name: s.legal_name ?? "",
    trade_name: s.trade_name ?? "",
    state_registration: s.state_registration ?? "",
    municipal_registration: s.municipal_registration ?? "",
    street: s.street ?? "",
    number: s.number ?? "",
    complement: s.complement ?? "",
    neighborhood: s.neighborhood ?? "",
    city: s.city ?? "",
    state: s.state ?? "",
    cep: s.cep ? formatCepInput(s.cep) : "",
    reference_point: s.reference_point ?? "",
    has_equipment: s.has_equipment,
    participates_pmoc: s.participates_pmoc,
    use_main_contacts: s.use_main_contacts,
    use_main_billing_address: s.use_main_billing_address,
    is_active: s.is_active,
    notes: s.notes ?? "",
  };
}

type Props = {
  open: boolean;
  clientId: number;
  editingSite: ClientSiteOut | null;
  mainClientDocument?: string | null;
  nearCity?: string;
  nearState?: string;
  onClose: () => void;
  onSaved: (site: ClientSiteOut) => void;
};

export function ClientUnitDrawer({
  open,
  clientId,
  editingSite,
  nearCity,
  nearState,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(editingSite ? siteToForm(editingSite) : emptyForm());
    }
  }, [open, editingSite]);

  if (!open) return null;

  const isEditing = editingSite != null;
  const cepDigits = digitsOnly(form.cep ?? "");
  const docDigits = digitsOnly(form.document ?? "");
  const useMainData = Boolean(form.use_main_contacts && form.use_main_billing_address);
  const siteTypeOptions =
    form.site_type === "sem_cnpj"
      ? [...SITE_TYPE_OPTIONS, { value: "sem_cnpj" as ClientSiteType, label: "Cliente sem CNPJ próprio" }]
      : SITE_TYPE_OPTIONS;

  async function onBuscarCep() {
    if (cepDigits.length !== 8) {
      toast.error("Informe um CEP com 8 dígitos.");
      return;
    }
    setCepLoading(true);
    try {
      const data = await fetchCepLookup(cepDigits);
      setForm((f) => ({
        ...f,
        street: data.address_street ?? f.street,
        neighborhood: data.address_district ?? f.neighborhood,
        complement: data.address_complement ?? f.complement,
        city: data.address_city ?? f.city,
        state: data.address_state ?? f.state,
        cep: data.address_postal_code ? formatCepInput(data.address_postal_code) : f.cep,
      }));
      if (cepLookupHasUsefulData(data)) {
        toast.success(cepLookupSuccessMessage(data));
      } else {
        toast.error("CEP encontrado, mas sem dados de endereço. Preencha manualmente.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível buscar o CEP.");
    } finally {
      setCepLoading(false);
    }
  }

  async function onBuscarCnpj() {
    if (docDigits.length !== 14) {
      toast.error("Informe o CNPJ completo com 14 dígitos (incluindo os 2 verificadores).");
      return;
    }
    if (!isValidCnpjDigits(docDigits)) {
      toast.error("CNPJ inválido. Confira os dígitos verificadores (ex.: 00.000.000/0000-00).");
      return;
    }
    setCnpjLoading(true);
    try {
      let lu;
      try {
        lu = await fetchCnpjCommercial(docDigits);
      } catch {
        lu = await fetchCnpjOpen(docDigits);
      }
      setForm((f) => ({
        ...f,
        legal_name: lu.company_name?.trim() || f.legal_name,
        trade_name: lu.trade_name?.trim() || f.trade_name,
        state_registration: lu.state_registration ?? f.state_registration,
        street: lu.address?.street ?? f.street,
        number: lu.address?.number ?? f.number,
        complement: lu.address?.details ?? f.complement,
        neighborhood: lu.address?.district ?? f.neighborhood,
        city: lu.address?.city ?? f.city,
        state: lu.address?.state ? lu.address.state.toUpperCase().slice(0, 2) : f.state,
        cep: lu.address?.zip ? formatCepInput(digitsOnly(lu.address.zip)) : f.cep,
        nickname: f.nickname?.trim() || lu.trade_name?.trim() || f.nickname,
      }));
      toast.success("Dados aplicados via Receita Federal.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível consultar o CNPJ.");
    } finally {
      setCnpjLoading(false);
    }
  }

  async function onSave() {
    if (form.site_type === "") {
      toast.error("Selecione o tipo de unidade.");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Informe o nome da unidade / filial.");
      return;
    }
    if (!(form.contact_name ?? "").trim()) {
      toast.error("Informe o nome do responsável da unidade.");
      return;
    }
    if (digitsOnly(form.phone ?? "").length < 10) {
      toast.error("Informe um WhatsApp válido com DDD.");
      return;
    }
    if (cepDigits.length !== 8) {
      toast.error("Informe um CEP válido com 8 dígitos.");
      return;
    }
    if (
      !(form.street ?? "").trim() ||
      !(form.number ?? "").trim() ||
      !(form.neighborhood ?? "").trim() ||
      !(form.city ?? "").trim() ||
      !(form.state ?? "").trim()
    ) {
      toast.error("Preencha rua, número, bairro, cidade e UF.");
      return;
    }
    if (form.has_own_document && docDigits.length !== 14) {
      toast.error("Informe um CNPJ válido para a unidade (ou desative “Tem CNPJ próprio?”).");
      return;
    }
    if (form.has_own_document && !(form.legal_name ?? "").trim()) {
      toast.error("Informe a razão social da unidade.");
      return;
    }
    setSaving(true);
    const payload: ClientSitePayload = {
      ...form,
      site_type: form.site_type as ClientSiteType,
      name: form.name.trim(),
      nickname: form.nickname?.trim() || undefined,
      contact_name: form.contact_name?.trim() || undefined,
      responsible_role: form.responsible_role?.trim() || undefined,
      phone: digitsOnly(form.phone ?? "") || undefined,
      email: form.email?.trim() || undefined,
      document: form.has_own_document ? docDigits : undefined,
      legal_name: form.legal_name?.trim() || undefined,
      trade_name: form.trade_name?.trim() || undefined,
      state_registration: form.state_registration?.trim() || undefined,
      municipal_registration: form.municipal_registration?.trim() || undefined,
      street: form.street?.trim() || undefined,
      complement: form.complement?.trim() || undefined,
      neighborhood: form.neighborhood?.trim() || undefined,
      city: form.city?.trim() || undefined,
      reference_point: form.reference_point?.trim() || undefined,
      notes: form.notes?.trim() || undefined,
    };
    try {
      const saved = isEditing
        ? await updateClientSite(clientId, editingSite!.id, payload)
        : await createClientSite(clientId, payload);
      toast.success(isEditing ? "Unidade atualizada." : "Unidade cadastrada.");
      onSaved(saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a unidade/filial.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.modalRoot} role="presentation">
      <button type="button" className={styles.modalBackdrop} aria-label="Fechar" onClick={onClose} />
      <div className={styles.contactModalCard} role="dialog" aria-modal="true" aria-labelledby="unit-modal-title">
        <div className={styles.contactModalHeader}>
          <div>
            <h3 id="unit-modal-title" className={styles.contactModalHeaderTitle}>
              {isEditing ? "Editar unidade / filial" : "Nova unidade / filial"}
            </h3>
            <p className={styles.contactModalHeaderSubtitle}>
              Cadastre uma nova unidade, filial ou local operacional do cliente.
            </p>
          </div>
          <button type="button" className={styles.btnGhostIcon} onClick={onClose} aria-label="Fechar">
            <IconX />
          </button>
        </div>

        <div className={styles.contactModalBody}>
          <div className={styles.innerCard}>
            <h4 className={styles.innerCardTitle}>Dados da unidade</h4>
            <div className={styles.fieldGrid3}>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="unit-type">
                  Tipo de unidade<span className={styles.fieldRequired}>*</span>
                </label>
                <select
                  id="unit-type"
                  className={styles.fieldSelect}
                  value={form.site_type}
                  onChange={(e) => setForm((f) => ({ ...f, site_type: e.target.value as ClientSiteType }))}
                >
                  <option value="" disabled>
                    Selecione o tipo
                  </option>
                  {siteTypeOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="unit-name">
                  Nome da unidade / filial<span className={styles.fieldRequired}>*</span>
                </label>
                <input
                  id="unit-name"
                  className={styles.fieldInput}
                  placeholder="Ex.: Filial São Paulo"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="unit-nickname">
                  Apelido / Nome fantasia
                </label>
                <input
                  id="unit-nickname"
                  className={styles.fieldInput}
                  placeholder="Ex.: Filial SP"
                  value={form.nickname ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
                />
              </div>
            </div>

            <div className={styles.switchInlineRow}>
              <FormSwitch
                id="unit-has-doc"
                checked={Boolean(form.has_own_document)}
                onChange={(v) => setForm((f) => ({ ...f, has_own_document: v }))}
                ariaLabel="Tem CNPJ próprio?"
              />
              <span className={styles.switchInlineLabel}>Tem CNPJ próprio?</span>
              <span className={styles.checkboxRowText}>
                <span>Sim, esta unidade possui CNPJ próprio</span>
              </span>
            </div>

            <div className={styles.infoBanner}>
              <IconInfo />
              <span>Se a unidade não possuir CNPJ próprio, ela será vinculada ao CNPJ da matriz do cliente.</span>
            </div>
          </div>

          <div className={`${styles.innerCard} ${form.has_own_document ? "" : styles.innerCardDisabled}`}>
            <h4 className={styles.innerCardTitle}>Dados da empresa (CNPJ próprio)</h4>
            <div className={styles.fieldGrid3}>
              <div className={`${styles.field} ${styles.cnpjLookupField}`}>
                <label className={styles.fieldLabel} htmlFor="unit-cnpj">
                  CNPJ{form.has_own_document ? <span className={styles.fieldRequired}>*</span> : null}
                </label>
                <div className={styles.fieldWithBtn}>
                  <input
                    id="unit-cnpj"
                    className={styles.fieldInput}
                    placeholder="00.000.000/0000-00"
                    disabled={!form.has_own_document}
                    value={form.document ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, document: formatCnpjInput(e.target.value) }))}
                    onBlur={() => {
                      if (form.has_own_document && digitsOnly(form.document ?? "").length === 14) {
                        void onBuscarCnpj();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSecondary}`}
                    onClick={() => void onBuscarCnpj()}
                    disabled={!form.has_own_document || cnpjLoading}
                  >
                    {cnpjLoading ? <IconLoader /> : <IconSearch />}
                    Buscar Receita
                  </button>
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="unit-legal-name">
                  Razão social{form.has_own_document ? <span className={styles.fieldRequired}>*</span> : null}
                </label>
                <input
                  id="unit-legal-name"
                  className={styles.fieldInput}
                  placeholder="Ex.: Ar Ideal Climatizadora LTDA - Filial SP"
                  disabled={!form.has_own_document}
                  value={form.legal_name ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, legal_name: e.target.value }))}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="unit-trade-name">
                  Nome fantasia
                </label>
                <input
                  id="unit-trade-name"
                  className={styles.fieldInput}
                  placeholder="Ex.: Ar Ideal SP"
                  disabled={!form.has_own_document}
                  value={form.trade_name ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, trade_name: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className={styles.innerCard}>
            <h4 className={styles.innerCardTitle}>Responsável da unidade</h4>
            <div className={styles.fieldGrid4}>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="unit-resp-name">
                  Nome do responsável<span className={styles.fieldRequired}>*</span>
                </label>
                <input
                  id="unit-resp-name"
                  className={styles.fieldInput}
                  placeholder="Ex.: Robson Pereira"
                  value={form.contact_name ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="unit-resp-role">
                  Cargo / Função
                </label>
                <input
                  id="unit-resp-role"
                  className={styles.fieldInput}
                  placeholder="Ex.: Gerente de Operações"
                  value={form.responsible_role ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, responsible_role: e.target.value }))}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="unit-resp-wa">
                  WhatsApp<span className={styles.fieldRequired}>*</span>
                </label>
                <div className={styles.fieldInputIconWrap}>
                  <IconWhatsApp className={`${styles.fieldInputIcon} ${styles.fieldInputIconWhatsapp}`} />
                  <input
                    id="unit-resp-wa"
                    className={styles.fieldInput}
                    placeholder="(11) 99999-9999"
                    value={form.phone ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, phone: formatPhoneBrInput(e.target.value) }))}
                  />
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="unit-resp-email">
                  E-mail
                </label>
                <div className={styles.fieldInputIconWrap}>
                  <IconMail className={styles.fieldInputIcon} />
                  <input
                    id="unit-resp-email"
                    type="email"
                    className={styles.fieldInput}
                    placeholder="exemplo@empresa.com.br"
                    value={form.email ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className={styles.innerCard}>
            <h4 className={styles.innerCardTitle}>Endereço da unidade</h4>
            <div className={styles.addressGrid}>
              <div className={`${styles.field} ${styles.addressCep}`}>
                <label className={styles.fieldLabel} htmlFor="unit-cep">
                  CEP<span className={styles.fieldRequired}>*</span>
                </label>
                <div className={styles.fieldWithBtn}>
                  <input
                    id="unit-cep"
                    className={styles.fieldInput}
                    placeholder="00000-000"
                    value={form.cep ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, cep: formatCepInput(e.target.value) }))}
                    onBlur={() => {
                      if (digitsOnly(form.cep ?? "").length === 8) {
                        void onBuscarCep();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSecondary}`}
                    onClick={() => void onBuscarCep()}
                    disabled={cepLoading}
                  >
                    {cepLoading ? <IconLoader /> : <IconSearch />}
                    Buscar CEP
                  </button>
                </div>
              </div>
              <div className={`${styles.field} ${styles.addressStreet}`}>
                <label className={styles.fieldLabel} htmlFor="unit-street">
                  Rua<span className={styles.fieldRequired}>*</span>
                </label>
                <StreetAddressLookupInput
                  value={form.street ?? ""}
                  onChange={(street) => setForm((f) => ({ ...f, street }))}
                  city={form.city ?? ""}
                  state={form.state ?? ""}
                  nearCity={nearCity}
                  nearState={nearState}
                  className={styles.fieldInput}
                  placeholder="Ex.: Avenida Paulista"
                  onSelect={(sel) =>
                    setForm((f) => ({
                      ...f,
                      street: sel.street || f.street,
                      neighborhood: sel.district || f.neighborhood,
                      complement: sel.complement || f.complement,
                      city: sel.city || f.city,
                      state: sel.state || f.state,
                      cep: sel.cep ? formatCepInput(sel.cep) : f.cep,
                    }))
                  }
                />
              </div>
              <div className={`${styles.field} ${styles.addressNumber}`}>
                <label className={styles.fieldLabel} htmlFor="unit-number">
                  Número<span className={styles.fieldRequired}>*</span>
                </label>
                <input
                  id="unit-number"
                  className={styles.fieldInput}
                  placeholder="Ex.: 1000"
                  value={form.number ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                />
              </div>
              <div className={`${styles.field} ${styles.addressComplement}`}>
                <label className={styles.fieldLabel} htmlFor="unit-complement">
                  Complemento
                </label>
                <input
                  id="unit-complement"
                  className={styles.fieldInput}
                  placeholder="Ex.: Sala 101, Bloco A"
                  value={form.complement ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, complement: e.target.value }))}
                />
              </div>

              <div className={`${styles.field} ${styles.addressNeighborhood}`}>
                <label className={styles.fieldLabel} htmlFor="unit-neighborhood">
                  Bairro<span className={styles.fieldRequired}>*</span>
                </label>
                <input
                  id="unit-neighborhood"
                  className={styles.fieldInput}
                  placeholder="Ex.: Bela Vista"
                  value={form.neighborhood ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, neighborhood: e.target.value }))}
                />
              </div>
              <div className={`${styles.field} ${styles.addressCity}`}>
                <label className={styles.fieldLabel} htmlFor="unit-city">
                  Cidade<span className={styles.fieldRequired}>*</span>
                </label>
                <input
                  id="unit-city"
                  className={styles.fieldInput}
                  placeholder="Ex.: São Paulo"
                  value={form.city ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div className={`${styles.field} ${styles.addressUf}`}>
                <label className={styles.fieldLabel} htmlFor="unit-state">
                  Estado (UF)<span className={styles.fieldRequired}>*</span>
                </label>
                <select
                  id="unit-state"
                  className={styles.fieldSelect}
                  value={(form.state ?? "").toUpperCase()}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                >
                  <option value="">Selecione</option>
                  {UF_OPTIONS.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </div>
              <div className={`${styles.field} ${styles.addressReference}`}>
                <label className={styles.fieldLabel} htmlFor="unit-reference">
                  Referência
                </label>
                <input
                  id="unit-reference"
                  className={styles.fieldInput}
                  placeholder="Ex.: Próximo ao metrô Trianon"
                  value={form.reference_point ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, reference_point: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className={styles.innerCard}>
            <h4 className={styles.innerCardTitle}>Configurações da unidade</h4>
            <div className={styles.configGrid4}>
              <div className={styles.configBlock}>
                <div className={styles.configBlockHead}>
                  <span className={styles.configBlockTitle}>Possui equipamentos?</span>
                  <FormSwitch
                    id="unit-has-equipment"
                    checked={Boolean(form.has_equipment)}
                    onChange={(v) => setForm((f) => ({ ...f, has_equipment: v }))}
                    ariaLabel="Possui equipamentos?"
                  />
                </div>
                <p className={styles.configBlockDesc}>Esta unidade possui equipamentos</p>
              </div>

              <div className={styles.configBlock}>
                <div className={styles.configBlockHead}>
                  <span className={styles.configBlockTitle}>Participa do PMOC?</span>
                  <FormSwitch
                    id="unit-participates-pmoc"
                    checked={Boolean(form.participates_pmoc)}
                    onChange={(v) => setForm((f) => ({ ...f, participates_pmoc: v }))}
                    ariaLabel="Participa do PMOC?"
                  />
                </div>
                <p className={styles.configBlockDesc}>Esta unidade participa do PMOC</p>
              </div>

              <div className={styles.configBlock}>
                <div className={styles.configBlockHead}>
                  <span className={styles.configBlockTitle}>Usar dados da matriz?</span>
                  <FormSwitch
                    id="unit-use-main-data"
                    checked={useMainData}
                    onChange={(v) =>
                      setForm((f) => ({ ...f, use_main_contacts: v, use_main_billing_address: v }))
                    }
                    ariaLabel="Usar dados da matriz?"
                  />
                </div>
                <p className={styles.configBlockDesc}>Copiar serviços e configurações da matriz</p>
              </div>

              <div className={styles.configBlock}>
                <span className={styles.configBlockTitle}>
                  Status da unidade<span className={styles.fieldRequired}>*</span>
                </span>
                <div className={styles.statusRadioGroup}>
                  <button
                    type="button"
                    className={`${styles.statusRadioBtn} ${form.is_active !== false ? styles.statusRadioBtnActiveGreen : ""}`}
                    onClick={() => setForm((f) => ({ ...f, is_active: true }))}
                  >
                    {form.is_active !== false ? <IconCheck /> : null} Ativa
                  </button>
                  <button
                    type="button"
                    className={`${styles.statusRadioBtn} ${form.is_active === false ? styles.statusRadioBtnActiveGray : ""}`}
                    onClick={() => setForm((f) => ({ ...f, is_active: false }))}
                  >
                    {form.is_active === false ? <IconCheck /> : null} Inativa
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.contactModalFooter}>
          <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void onSave()} disabled={saving}>
            <IconSave /> {saving ? "Salvando…" : "Salvar unidade"}
          </button>
        </div>
      </div>
    </div>
  );
}
