import { useEffect, useState } from "react";
import {
  createClientAddress,
  updateClientAddress,
  type ClientAddressOut,
  type ClientAddressPayload,
  type ClientAddressType,
  type ClientSiteOut,
} from "../../../api/clients";
import { fetchCepLookup, cepLookupHasUsefulData, cepLookupSuccessMessage } from "../../../api/cep";
import { digitsOnly, formatCepInput } from "../../../lib/brMask";
import { FormSwitch } from "../../ui/form-switch";
import { toast } from "../../../lib/toast";
import styles from "../../../pages/clients/ClientDetail.module.css";
import { IconCheck, IconLoader, IconMail, IconSave, IconSearch, IconShield, IconTool, IconWallet, IconX } from "./icons";

const UF_OPTIONS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE",
  "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

export const ADDRESS_TYPE_OPTIONS: { value: ClientAddressType; label: string }[] = [
  { value: "principal", label: "Principal" },
  { value: "cobranca", label: "Cobrança" },
  { value: "instalacao", label: "Instalação" },
  { value: "correspondencia", label: "Correspondência" },
  { value: "outros", label: "Outros" },
];

const FINALITY_ITEMS: {
  key: "use_for_billing" | "use_for_pmoc" | "use_for_service_orders" | "use_for_correspondence";
  title: string;
  description: string;
  icon: React.ReactNode;
  iconClass: string;
}[] = [
  {
    key: "use_for_billing",
    title: "Usar como endereço de cobrança",
    description: "Utilizado para cobranças e contratos",
    icon: <IconWallet />,
    iconClass: styles.finalityIconOrange,
  },
  {
    key: "use_for_pmoc",
    title: "Usar no PMOC",
    description: "Utilizado em relatórios do PMOC",
    icon: <IconShield />,
    iconClass: styles.finalityIconGreen,
  },
  {
    key: "use_for_service_orders",
    title: "Usar em ordens de serviço",
    description: "Utilizado em OS e atendimentos",
    icon: <IconTool />,
    iconClass: styles.finalityIconBlue,
  },
  {
    key: "use_for_correspondence",
    title: "Usar para correspondências",
    description: "Utilizado para envio de documentos",
    icon: <IconMail />,
    iconClass: styles.finalityIconPurple,
  },
];

type FormState = {
  address_type: ClientAddressType | "";
  client_site_id: number | "";
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  reference_point: string;
  is_principal: boolean;
  use_for_billing: boolean;
  use_for_pmoc: boolean;
  use_for_service_orders: boolean;
  use_for_correspondence: boolean;
  is_active: boolean;
};

function emptyForm(defaultSiteId?: number): FormState {
  return {
    address_type: "",
    client_site_id: defaultSiteId ?? "",
    cep: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
    reference_point: "",
    is_principal: false,
    use_for_billing: false,
    use_for_pmoc: false,
    use_for_service_orders: false,
    use_for_correspondence: false,
    is_active: true,
  };
}

function addressToForm(a: ClientAddressOut): FormState {
  return {
    address_type: a.address_type,
    client_site_id: a.client_site_id ?? "",
    cep: a.cep ? formatCepInput(a.cep) : "",
    street: a.street ?? "",
    number: a.number ?? "",
    complement: a.complement ?? "",
    neighborhood: a.neighborhood ?? "",
    city: a.city ?? "",
    state: a.state ?? "",
    reference_point: a.reference_point ?? "",
    is_principal: a.is_principal,
    use_for_billing: a.use_for_billing,
    use_for_pmoc: a.use_for_pmoc,
    use_for_service_orders: a.use_for_service_orders,
    use_for_correspondence: a.use_for_correspondence,
    is_active: a.is_active,
  };
}

type Props = {
  open: boolean;
  clientId: number;
  editingAddress: ClientAddressOut | null;
  sites: ClientSiteOut[];
  onClose: () => void;
  onSaved: (address: ClientAddressOut) => void;
};

export function ClientAddressDrawer({ open, clientId, editingAddress, sites, onClose, onSaved }: Props) {
  const defaultSiteId = sites.find((s) => s.site_type === "matriz")?.id ?? sites[0]?.id;
  const [form, setForm] = useState<FormState>(emptyForm(defaultSiteId));
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(editingAddress ? addressToForm(editingAddress) : emptyForm(defaultSiteId));
      setFormError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingAddress]);

  if (!open) return null;

  const isEditing = editingAddress != null;
  const cepDigits = digitsOnly(form.cep ?? "");

  async function onBuscarCep() {
    if (cepDigits.length !== 8) {
      toast.error("Informe um CEP com 8 dígitos.");
      setFormError("Informe um CEP com 8 dígitos.");
      return;
    }
    setFormError(null);
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
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível buscar o CEP.";
      toast.error(msg);
      setFormError(msg);
    } finally {
      setCepLoading(false);
    }
  }

  async function onSave() {
    if (form.address_type === "") {
      const msg = "Selecione o tipo de endereço.";
      toast.error(msg);
      setFormError(msg);
      return;
    }
    if (cepDigits.length !== 8) {
      const msg = "Informe um CEP válido com 8 dígitos (ex.: 14805-210).";
      toast.error(msg);
      setFormError(msg);
      return;
    }
    if (!form.street.trim() || !form.number.trim() || !form.neighborhood.trim() || !form.city.trim() || !form.state.trim()) {
      const msg = "Preencha rua, número, bairro, cidade e UF.";
      toast.error(msg);
      setFormError(msg);
      return;
    }
    setFormError(null);
    setSaving(true);
    const payload: ClientAddressPayload = {
      address_type: form.address_type,
      client_site_id: typeof form.client_site_id === "number" ? form.client_site_id : null,
      cep: cepDigits,
      street: form.street.trim(),
      number: form.number.trim(),
      complement: form.complement.trim() || undefined,
      neighborhood: form.neighborhood.trim(),
      city: form.city.trim(),
      state: form.state.trim().toUpperCase(),
      reference_point: form.reference_point.trim() || undefined,
      is_principal: form.is_principal,
      use_for_billing: form.use_for_billing,
      use_for_pmoc: form.use_for_pmoc,
      use_for_service_orders: form.use_for_service_orders,
      use_for_correspondence: form.use_for_correspondence,
      is_active: form.is_active,
    };
    try {
      const saved = isEditing
        ? await updateClientAddress(clientId, editingAddress!.id, payload)
        : await createClientAddress(clientId, payload);
      toast.success(isEditing ? "Endereço atualizado." : "Endereço cadastrado.");
      onSaved(saved);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não foi possível salvar o endereço.";
      toast.error(msg);
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  }

  function toggleFinality(key: (typeof FINALITY_ITEMS)[number]["key"]) {
    setForm((f) => ({ ...f, [key]: !f[key] }));
  }

  return (
    <div className={styles.modalRoot} role="presentation">
      <button type="button" className={styles.modalBackdrop} aria-label="Fechar" onClick={onClose} />
      <div className={styles.contactModalCard} role="dialog" aria-modal="true" aria-labelledby="address-modal-title">
        <div className={styles.contactModalHeader}>
          <div>
            <h3 id="address-modal-title" className={styles.contactModalHeaderTitle}>
              {isEditing ? "Editar endereço" : "Adicionar endereço"}
            </h3>
            <p className={styles.contactModalHeaderSubtitle}>
              Cadastre um novo endereço para o cliente ou unidade/filial.
            </p>
          </div>
          <button type="button" className={styles.btnGhostIcon} onClick={onClose} aria-label="Fechar">
            <IconX />
          </button>
        </div>

        <div className={styles.contactModalBody}>
          <div className={styles.fieldGrid2}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="addr-type">
                Tipo de endereço<span className={styles.fieldRequired}>*</span>
              </label>
              <select
                id="addr-type"
                className={styles.fieldSelect}
                value={form.address_type}
                onChange={(e) => setForm((f) => ({ ...f, address_type: e.target.value as ClientAddressType }))}
              >
                <option value="" disabled>
                  Selecione o tipo de endereço
                </option>
                {ADDRESS_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="addr-site">
                Unidade / Filial
              </label>
              <select
                id="addr-site"
                className={styles.fieldSelect}
                value={form.client_site_id}
                onChange={(e) => setForm((f) => ({ ...f, client_site_id: e.target.value ? Number(e.target.value) : "" }))}
              >
                <option value="">Sem vínculo com unidade (opcional)</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.site_type === "matriz" ? "(Matriz)" : "(Filial)"}
                  </option>
                ))}
              </select>
              {sites.length === 0 ? (
                <p className={styles.innerCardSubtitle} style={{ margin: 0 }}>
                  Nenhuma unidade cadastrada. Você pode salvar o endereço sem vínculo ou criar uma em «Unidades / Filiais».
                </p>
              ) : null}
            </div>
          </div>

          <div className={styles.innerCard}>
            <h4 className={styles.innerCardTitle}>Endereço</h4>
            <div className={styles.addressGrid}>
              <div className={`${styles.field} ${styles.addressCep}`}>
                <label className={styles.fieldLabel} htmlFor="addr-cep">
                  CEP<span className={styles.fieldRequired}>*</span>
                </label>
                <div className={styles.fieldWithBtn}>
                  <input
                    id="addr-cep"
                    className={styles.fieldInput}
                    placeholder="00000-000"
                    value={form.cep}
                    onChange={(e) => setForm((f) => ({ ...f, cep: formatCepInput(e.target.value) }))}
                  />
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSecondary}`}
                    onClick={() => void onBuscarCep()}
                    disabled={cepLoading || cepDigits.length !== 8}
                  >
                    {cepLoading ? <IconLoader /> : <IconSearch />}
                    Buscar CEP
                  </button>
                </div>
              </div>

              <div className={`${styles.field} ${styles.addressStreet}`}>
                <label className={styles.fieldLabel} htmlFor="addr-street">
                  Rua<span className={styles.fieldRequired}>*</span>
                </label>
                <input
                  id="addr-street"
                  className={styles.fieldInput}
                  placeholder="Ex.: Rua das Flores"
                  value={form.street}
                  onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))}
                />
              </div>

              <div className={`${styles.field} ${styles.addressNumber}`}>
                <label className={styles.fieldLabel} htmlFor="addr-number">
                  Número<span className={styles.fieldRequired}>*</span>
                </label>
                <input
                  id="addr-number"
                  className={styles.fieldInput}
                  placeholder="Ex.: 123"
                  value={form.number}
                  onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                />
              </div>

              <div className={`${styles.field} ${styles.addressComplement}`}>
                <label className={styles.fieldLabel} htmlFor="addr-complement">
                  Complemento
                </label>
                <input
                  id="addr-complement"
                  className={styles.fieldInput}
                  placeholder="Ex.: Sala 101, Bloco A"
                  value={form.complement}
                  onChange={(e) => setForm((f) => ({ ...f, complement: e.target.value }))}
                />
              </div>

              <div className={`${styles.field} ${styles.addressNeighborhood}`}>
                <label className={styles.fieldLabel} htmlFor="addr-neighborhood">
                  Bairro<span className={styles.fieldRequired}>*</span>
                </label>
                <input
                  id="addr-neighborhood"
                  className={styles.fieldInput}
                  placeholder="Ex.: Centro"
                  value={form.neighborhood}
                  onChange={(e) => setForm((f) => ({ ...f, neighborhood: e.target.value }))}
                />
              </div>

              <div className={`${styles.field} ${styles.addressCity}`}>
                <label className={styles.fieldLabel} htmlFor="addr-city">
                  Cidade<span className={styles.fieldRequired}>*</span>
                </label>
                <input
                  id="addr-city"
                  className={styles.fieldInput}
                  placeholder="Ex.: Araraquara"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>

              <div className={`${styles.field} ${styles.addressUf}`}>
                <label className={styles.fieldLabel} htmlFor="addr-state">
                  Estado (UF)<span className={styles.fieldRequired}>*</span>
                </label>
                <select
                  id="addr-state"
                  className={styles.fieldSelect}
                  value={form.state.toUpperCase()}
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
                <label className={styles.fieldLabel} htmlFor="addr-reference">
                  Referência
                </label>
                <input
                  id="addr-reference"
                  className={styles.fieldInput}
                  placeholder="Ex.: Próximo à Praça Central"
                  value={form.reference_point}
                  onChange={(e) => setForm((f) => ({ ...f, reference_point: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <div className={styles.innerCard}>
            <h4 className={styles.innerCardTitle}>Finalidade</h4>
            <p className={styles.innerCardSubtitle}>Selecione as finalidades que este endereço será utilizado.</p>
            <div className={styles.finalityGrid}>
              {FINALITY_ITEMS.map((item) => (
                <label
                  key={item.key}
                  className={`${styles.prefCard} ${form[item.key] ? styles.prefCardChecked : ""}`}
                >
                  <input
                    type="checkbox"
                    className={styles.prefCardCheckbox}
                    checked={form[item.key]}
                    onChange={() => toggleFinality(item.key)}
                  />
                  <span className={`${styles.prefCardIcon} ${item.iconClass}`}>{item.icon}</span>
                  <span className={styles.prefCardText}>
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.innerCard}>
            <h4 className={styles.innerCardTitle}>Configurações</h4>
            <div className={styles.modalTwoColGrid}>
              <div className={styles.statusRowControl} style={{ justifyContent: "space-between", width: "100%" }}>
                <span className={styles.checkboxRowText}>
                  <strong>Definir como endereço principal</strong>
                  <span>Este será o endereço principal do cliente.</span>
                </span>
                <FormSwitch
                  id="addr-principal"
                  checked={form.is_principal}
                  onChange={(v) => setForm((f) => ({ ...f, is_principal: v }))}
                  ariaLabel="Definir como endereço principal"
                />
              </div>

              <div>
                <span className={styles.fieldLabel} style={{ display: "block", marginBottom: "0.6rem" }}>
                  Status do endereço
                </span>
                <div className={styles.statusRadioGroup}>
                  <button
                    type="button"
                    className={`${styles.statusRadioBtn} ${form.is_active ? styles.statusRadioBtnActiveGreen : ""}`}
                    onClick={() => setForm((f) => ({ ...f, is_active: true }))}
                  >
                    {form.is_active ? <IconCheck /> : null} Ativo
                  </button>
                  <button
                    type="button"
                    className={`${styles.statusRadioBtn} ${!form.is_active ? styles.statusRadioBtnActiveGray : ""}`}
                    onClick={() => setForm((f) => ({ ...f, is_active: false }))}
                  >
                    {!form.is_active ? <IconCheck /> : null} Inativo
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.contactModalFooter} style={{ flexWrap: "wrap" }}>
          {formError ? (
            <p className={styles.msgErr} role="alert" style={{ margin: 0, flex: "1 1 100%" }}>
              {formError}
            </p>
          ) : null}
          <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void onSave()} disabled={saving}>
            <IconSave /> {saving ? "Salvando…" : "Salvar endereço"}
          </button>
        </div>
      </div>
    </div>
  );
}
