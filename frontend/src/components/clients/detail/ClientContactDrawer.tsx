import { useEffect, useState } from "react";
import {
  createClientContact,
  updateClientContact,
  type ClientContactCategory,
  type ClientContactOut,
  type ClientContactPayload,
  type ClientSiteOut,
} from "../../../api/clients";
import { digitsOnly, formatPhoneBrInput } from "../../../lib/brMask";
import { FormSwitch } from "../../ui/form-switch";
import { toast } from "../../../lib/toast";
import styles from "../../../pages/clients/ClientDetail.module.css";
import {
  IconClipboardList,
  IconFileText,
  IconMail,
  IconMessageCircle,
  IconPhone,
  IconSave,
  IconShield,
  IconWallet,
  IconWhatsApp,
  IconX,
} from "./icons";

export const CONTACT_CATEGORY_OPTIONS: { value: ClientContactCategory; label: string }[] = [
  { value: "responsavel", label: "Responsável" },
  { value: "tecnico", label: "Técnico" },
  { value: "financeiro", label: "Financeiro" },
  { value: "administrativo", label: "Administrativo" },
  { value: "comercial", label: "Comercial" },
  { value: "outros", label: "Outros" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOTES_MAX = 500;

type FormState = {
  name: string;
  category: ClientContactCategory;
  role: string;
  department: string;
  client_site_id: number | "";
  whatsapp: string;
  phone: string;
  email: string;
  receives_service_orders: boolean;
  receives_pmoc: boolean;
  receives_financial: boolean;
  receives_contracts: boolean;
  receives_whatsapp_notifications: boolean;
  receives_automatic_emails: boolean;
  is_principal: boolean;
  is_active: boolean;
  notes: string;
};

const PREFERENCE_ITEMS: {
  key: keyof FormState & (
    | "receives_service_orders"
    | "receives_pmoc"
    | "receives_financial"
    | "receives_contracts"
    | "receives_whatsapp_notifications"
    | "receives_automatic_emails"
  );
  title: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "receives_service_orders",
    title: "Recebe ordens de serviço",
    description: "Receber OS por e-mail/WhatsApp",
    icon: <IconClipboardList />,
  },
  {
    key: "receives_pmoc",
    title: "Recebe PMOC",
    description: "Receber comunicados do PMOC",
    icon: <IconShield />,
  },
  {
    key: "receives_financial",
    title: "Recebe financeiro",
    description: "Receber cobranças e boletos",
    icon: <IconWallet />,
  },
  {
    key: "receives_contracts",
    title: "Recebe contratos",
    description: "Receber contratos e aditivos",
    icon: <IconFileText />,
  },
  {
    key: "receives_whatsapp_notifications",
    title: "Recebe notificações pelo WhatsApp",
    description: "Receber alertas via WhatsApp",
    icon: <IconMessageCircle />,
  },
  {
    key: "receives_automatic_emails",
    title: "Recebe e-mails automáticos",
    description: "Receber e-mails do sistema",
    icon: <IconMail />,
  },
];

function emptyForm(defaultSiteId?: number): FormState {
  return {
    name: "",
    category: "outros",
    role: "",
    department: "",
    client_site_id: defaultSiteId ?? "",
    whatsapp: "",
    phone: "",
    email: "",
    receives_service_orders: false,
    receives_pmoc: false,
    receives_financial: false,
    receives_contracts: false,
    receives_whatsapp_notifications: false,
    receives_automatic_emails: false,
    is_principal: false,
    is_active: true,
    notes: "",
  };
}

function contactToForm(c: ClientContactOut): FormState {
  return {
    name: c.name,
    category: c.category,
    role: c.role ?? "",
    department: c.department ?? "",
    client_site_id: c.client_site_id ?? "",
    whatsapp: c.whatsapp ? formatPhoneBrInput(c.whatsapp) : "",
    phone: c.phone ? formatPhoneBrInput(c.phone) : "",
    email: c.email ?? "",
    receives_service_orders: c.receives_service_orders,
    receives_pmoc: c.receives_pmoc,
    receives_financial: c.receives_financial,
    receives_contracts: c.receives_contracts,
    receives_whatsapp_notifications: c.receives_whatsapp_notifications,
    receives_automatic_emails: c.receives_automatic_emails,
    is_principal: c.is_principal,
    is_active: c.is_active,
    notes: c.notes ?? "",
  };
}

type Props = {
  open: boolean;
  clientId: number;
  editingContact: ClientContactOut | null;
  sites: ClientSiteOut[];
  onClose: () => void;
  onSaved: (contact: ClientContactOut) => void;
};

export function ClientContactDrawer({ open, clientId, editingContact, sites, onClose, onSaved }: Props) {
  const defaultSiteId = sites.find((s) => s.site_type === "matriz")?.id ?? sites[0]?.id;
  const [form, setForm] = useState<FormState>(emptyForm(defaultSiteId));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(editingContact ? contactToForm(editingContact) : emptyForm(defaultSiteId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingContact]);

  if (!open) return null;

  const isEditing = editingContact != null;
  const whatsappDigits = digitsOnly(form.whatsapp);

  async function onSave() {
    if (!form.name.trim()) {
      toast.error("Informe o nome completo do contato.");
      return;
    }
    if (form.client_site_id === "") {
      toast.error("Selecione a unidade / filial deste contato.");
      return;
    }
    if (whatsappDigits.length < 10) {
      toast.error("Informe um WhatsApp válido com DDD.");
      return;
    }
    if (!EMAIL_RE.test(form.email.trim())) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    setSaving(true);
    const payload: ClientContactPayload = {
      name: form.name.trim(),
      category: form.category,
      role: form.role.trim() || undefined,
      department: form.department.trim() || undefined,
      client_site_id: typeof form.client_site_id === "number" ? form.client_site_id : null,
      whatsapp: whatsappDigits,
      phone: digitsOnly(form.phone) || undefined,
      email: form.email.trim(),
      receives_service_orders: form.receives_service_orders,
      receives_pmoc: form.receives_pmoc,
      receives_financial: form.receives_financial,
      receives_contracts: form.receives_contracts,
      receives_whatsapp_notifications: form.receives_whatsapp_notifications,
      receives_automatic_emails: form.receives_automatic_emails,
      is_principal: form.is_principal,
      is_active: form.is_active,
      notes: form.notes.trim() || undefined,
    };
    try {
      const saved = isEditing
        ? await updateClientContact(clientId, editingContact!.id, payload)
        : await createClientContact(clientId, payload);
      toast.success(isEditing ? "Contato atualizado." : "Contato cadastrado.");
      onSaved(saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o contato.");
    } finally {
      setSaving(false);
    }
  }

  function togglePreference(key: (typeof PREFERENCE_ITEMS)[number]["key"]) {
    setForm((f) => ({ ...f, [key]: !f[key] }));
  }

  return (
    <div className={styles.modalRoot} role="presentation">
      <button type="button" className={styles.modalBackdrop} aria-label="Fechar" onClick={onClose} />
      <div className={styles.contactModalCard} role="dialog" aria-modal="true" aria-labelledby="contact-modal-title">
        <div className={styles.contactModalHeader}>
          <div>
            <h3 id="contact-modal-title" className={styles.contactModalHeaderTitle}>
              {isEditing ? "Editar contato" : "Adicionar contato"}
            </h3>
            <p className={styles.contactModalHeaderSubtitle}>
              Cadastre um contato vinculado ao cliente ou unidade/filial.
            </p>
          </div>
          <button type="button" className={styles.btnGhostIcon} onClick={onClose} aria-label="Fechar">
            <IconX />
          </button>
        </div>

        <div className={styles.contactModalBody}>
          <div className={styles.modalTopGrid}>
            <div className={styles.innerCard}>
              <h4 className={styles.innerCardTitle}>Dados do contato</h4>
              <div className={styles.fieldGrid2}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="contact-name">
                    Nome completo<span className={styles.fieldRequired}>*</span>
                  </label>
                  <input
                    id="contact-name"
                    className={styles.fieldInput}
                    placeholder="Ex.: Robson Pereira"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="contact-category">
                    Categoria<span className={styles.fieldRequired}>*</span>
                  </label>
                  <select
                    id="contact-category"
                    className={styles.fieldSelect}
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ClientContactCategory }))}
                  >
                    {CONTACT_CATEGORY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="contact-role">
                    Cargo / Função
                  </label>
                  <input
                    id="contact-role"
                    className={styles.fieldInput}
                    placeholder="Ex.: Sócio Administrador"
                    value={form.role}
                    onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="contact-department">
                    Departamento
                  </label>
                  <input
                    id="contact-department"
                    className={styles.fieldInput}
                    placeholder="Ex.: Administrativo"
                    value={form.department}
                    onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div className={styles.modalSideStack}>
              <div className={styles.innerCard}>
                <h4 className={styles.innerCardTitle}>Vínculo</h4>
                <div className={styles.field}>
                  <label className={styles.fieldLabel} htmlFor="contact-site">
                    Unidade / Filial<span className={styles.fieldRequired}>*</span>
                  </label>
                  <select
                    id="contact-site"
                    className={styles.fieldSelect}
                    value={form.client_site_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, client_site_id: e.target.value ? Number(e.target.value) : "" }))
                    }
                  >
                    <option value="">Selecione…</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.site_type === "matriz" ? "(Matriz)" : "(Filial)"}
                      </option>
                    ))}
                  </select>
                  {sites.length === 0 ? (
                    <p className={styles.innerCardSubtitle} style={{ margin: 0 }}>
                      Nenhuma unidade cadastrada. Crie uma em «Unidades / Filiais» antes de adicionar o contato.
                    </p>
                  ) : null}
                </div>
              </div>

              <div className={styles.innerCard}>
                <h4 className={styles.innerCardTitle}>Status</h4>
                <div className={styles.statusRow} style={{ alignItems: "flex-start" }}>
                  <span className={styles.statusRowLabel}>Status do contato</span>
                  <div className={styles.statusRowControl}>
                    <FormSwitch
                      id="contact-is-active"
                      checked={form.is_active}
                      onChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                      ariaLabel="Status do contato"
                    />
                    <span className={styles.statusRowLabel} style={{ color: "var(--color-text)" }}>
                      {form.is_active ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.innerCard}>
            <h4 className={styles.innerCardTitle}>Contato</h4>
            <div className={styles.fieldGrid3}>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="contact-whatsapp">
                  WhatsApp<span className={styles.fieldRequired}>*</span>
                </label>
                <div className={styles.fieldInputIconWrap}>
                  <IconWhatsApp className={`${styles.fieldInputIcon} ${styles.fieldInputIconWhatsapp}`} />
                  <input
                    id="contact-whatsapp"
                    className={styles.fieldInput}
                    placeholder="(16) 99999-9999"
                    value={form.whatsapp}
                    onChange={(e) => setForm((f) => ({ ...f, whatsapp: formatPhoneBrInput(e.target.value) }))}
                  />
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="contact-phone">
                  Telefone
                </label>
                <div className={styles.fieldInputIconWrap}>
                  <IconPhone className={styles.fieldInputIcon} />
                  <input
                    id="contact-phone"
                    className={styles.fieldInput}
                    placeholder="(16) 3333-4444"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: formatPhoneBrInput(e.target.value) }))}
                  />
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="contact-email">
                  E-mail<span className={styles.fieldRequired}>*</span>
                </label>
                <div className={styles.fieldInputIconWrap}>
                  <IconMail className={styles.fieldInputIcon} />
                  <input
                    id="contact-email"
                    type="email"
                    className={styles.fieldInput}
                    placeholder="exemplo@empresa.com.br"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div>
              <h4 className={styles.innerCardTitle} style={{ marginBottom: "0.75rem" }}>
                Preferências de recebimento
              </h4>
              <div className={styles.prefGrid}>
                {PREFERENCE_ITEMS.map((item) => (
                  <label
                    key={item.key}
                    className={`${styles.prefCard} ${form[item.key] ? styles.prefCardChecked : ""}`}
                  >
                    <input
                      type="checkbox"
                      className={styles.prefCardCheckbox}
                      checked={form[item.key]}
                      onChange={() => togglePreference(item.key)}
                    />
                    <span className={styles.prefCardIcon}>{item.icon}</span>
                    <span className={styles.prefCardText}>
                      <strong>{item.title}</strong>
                      <span>{item.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.modalTwoColGrid}>
            <div className={styles.innerCard}>
              <h4 className={styles.innerCardTitle}>Principal</h4>
              <div className={styles.statusRow} style={{ alignItems: "flex-start", width: "100%" }}>
                <div className={styles.statusRowControl} style={{ width: "100%", justifyContent: "space-between" }}>
                  <span className={styles.checkboxRowText}>
                    <strong>Definir como contato principal</strong>
                    <span>Este contato será o responsável principal</span>
                  </span>
                  <FormSwitch
                    id="contact-principal"
                    checked={form.is_principal}
                    onChange={(v) => setForm((f) => ({ ...f, is_principal: v }))}
                    ariaLabel="Definir como contato principal"
                  />
                </div>
              </div>
            </div>

            <div className={styles.innerCard}>
              <h4 className={styles.innerCardTitle}>Observações</h4>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="contact-notes">
                  Observações do contato
                </label>
                <textarea
                  id="contact-notes"
                  className={styles.fieldTextarea}
                  maxLength={NOTES_MAX}
                  placeholder="Ex.: Informações adicionais sobre o contato"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value.slice(0, NOTES_MAX) }))}
                />
                <span className={styles.textareaCounter}>
                  {form.notes.length}/{NOTES_MAX}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.contactModalFooter}>
          <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => void onSave()} disabled={saving}>
            <IconSave /> {saving ? "Salvando…" : "Salvar contato"}
          </button>
        </div>
      </div>
    </div>
  );
}
