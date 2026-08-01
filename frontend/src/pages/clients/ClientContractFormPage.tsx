import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  CalendarDays,
  CloudUpload,
  FileText,
  Paperclip,
  Save,
  Settings2,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import {
  createClientContract,
  fetchClientContractNextNumber,
  getClient,
  listClientSites,
  uploadClientContractAttachment,
  type ClientContractPayload,
  type ClientContractStatus,
  type ClientOut,
  type ClientSiteOut,
} from "../../api/clients";
import { listTenantUsers, type UserOut } from "../../api/auth";
import { listClientCatalogEquipments, type ClientEquipmentOut } from "../../api/equipmentCatalog";
import { formatCurrencyBrlInput, parseCurrencyBrlInput } from "../../lib/brMask";
import { toast } from "../../lib/toast";
import styles from "./ClientContractFormPage.module.css";

const CONTRACT_TYPES = [
  "PMOC",
  "Manutenção Preventiva",
  "Manutenção Corretiva",
  "Instalação",
  "Locação de Equipamentos",
  "Fornecimento de Peças",
  "Outros",
] as const;

const CATEGORY_OPTIONS = [
  { value: "recorrente", label: "Recorrente" },
  { value: "avulso", label: "Avulso" },
  { value: "sob_demanda", label: "Sob demanda" },
] as const;

const RECURRENCE_OPTIONS = [
  { value: "monthly", label: "Mensal" },
  { value: "quarterly", label: "Trimestral" },
  { value: "semiannual", label: "Semestral" },
  { value: "annual", label: "Anual" },
  { value: "one_time", label: "Único" },
] as const;

const PAYMENT_OPTIONS = ["PIX", "Boleto", "Cartão", "Transferência", "Dinheiro"] as const;

const SERVICE_OPTIONS = [
  "Limpeza de filtros",
  "Higienização",
  "Verificação elétrica",
  "Medição de corrente",
  "Pressão do gás",
  "Preventiva completa",
] as const;

const NOTICE_OPTIONS = [15, 30, 60, 90] as const;
const MAX_NOTES = 500;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

type AttachmentDraft = {
  id: string;
  name: string;
  size: number;
  type: string;
  file: File;
};

type FormState = {
  contractType: string;
  category: string;
  siteId: string;
  title: string;
  startDate: string;
  endDate: string;
  valueInput: string;
  recurrence: string;
  nextDueDate: string;
  adjustmentIndex: string;
  adjustmentPeriod: string;
  coverageLocation: string;
  paymentMethod: string;
  dueDay: string;
  lateFee: string;
  interest: string;
  billingNotes: string;
  notes: string;
  status: ClientContractStatus;
  autoRenewal: boolean;
  expiryNoticeDays: string;
  responsibleUserId: string;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm(): FormState {
  const today = todayIso();
  return {
    contractType: "",
    category: "",
    siteId: "",
    title: "",
    startDate: today,
    endDate: today,
    valueInput: "",
    recurrence: "",
    nextDueDate: "",
    adjustmentIndex: "",
    adjustmentPeriod: "",
    coverageLocation: "",
    paymentMethod: "",
    dueDay: "",
    lateFee: "",
    interest: "",
    billingNotes: "",
    notes: "",
    status: "active",
    autoRenewal: false,
    expiryNoticeDays: "30",
    responsibleUserId: "",
  };
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function siteLabel(site: ClientSiteOut): string {
  const badge = site.site_type === "matriz" ? "Matriz" : "Filial";
  return `${site.name} (${badge})`;
}

function FormCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.cardIcon} aria-hidden>
          {icon}
        </span>
        <h2 className={styles.cardTitle}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function ClientContractFormPage() {
  const navigate = useNavigate();
  const { clientId: clientIdParam } = useParams();
  const clientId = Number(clientIdParam);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [client, setClient] = useState<ClientOut | null>(null);
  const [sites, setSites] = useState<ClientSiteOut[]>([]);
  const [users, setUsers] = useState<UserOut[]>([]);
  const [equipments, setEquipments] = useState<ClientEquipmentOut[]>([]);
  const [numberPreview, setNumberPreview] = useState("CTR-····-···");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [equipModalOpen, setEquipModalOpen] = useState(false);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [equipDraft, setEquipDraft] = useState<string[]>([]);
  const [serviceDraft, setServiceDraft] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!Number.isFinite(clientId) || clientId < 1) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const year = new Date().getFullYear();
        const [c, siteRows, userRows, equipRows, nextNumber] = await Promise.all([
          getClient(clientId),
          listClientSites(clientId),
          listTenantUsers({ limit: 200 }),
          listClientCatalogEquipments(clientId, { only_active: true }),
          fetchClientContractNextNumber(clientId, year),
        ]);
        if (cancelled) return;
        setClient(c);
        setSites(siteRows);
        setUsers(userRows.filter((u) => u.is_active));
        setEquipments(equipRows);
        setNumberPreview(nextNumber.contract_number);
        const matriz = siteRows.find((s) => s.site_type === "matriz") ?? siteRows[0];
        setForm((prev) => ({
          ...prev,
          siteId: matriz ? String(matriz.id) : "",
          responsibleUserId: userRows.find((u) => u.is_active)?.id
            ? String(userRows.find((u) => u.is_active)!.id)
            : "",
        }));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível carregar o cliente.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  useEffect(() => {
    if (!Number.isFinite(clientId) || clientId < 1 || !form.startDate) return;
    const year = Number(form.startDate.slice(0, 4));
    if (!Number.isFinite(year)) return;
    let cancelled = false;
    void fetchClientContractNextNumber(clientId, year)
      .then((next) => {
        if (!cancelled) setNumberPreview(next.contract_number);
      })
      .catch(() => {
        /* prévia opcional */
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, form.startDate]);

  const clientName = client?.trade_name || client?.name || "Cliente";
  const backHref = `/app/clients/${clientId}?tab=contratos`;

  const selectedEquipmentLabels = useMemo(() => {
    return selectedEquipmentIds
      .map((id) => {
        const eq = equipments.find((e) => e.id === id);
        if (!eq) return null;
        const brand = eq.components[0]?.catalog.brand;
        const model = eq.components[0]?.catalog.model;
        return `${eq.tag}${brand || model ? ` · ${[brand, model].filter(Boolean).join(" ")}` : ""}`;
      })
      .filter(Boolean) as string[];
  }, [equipments, selectedEquipmentIds]);

  function patchForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openEquipModal() {
    setEquipDraft(selectedEquipmentIds);
    setEquipModalOpen(true);
  }

  function openServiceModal() {
    setServiceDraft(selectedServices);
    setServiceModalOpen(true);
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const next: AttachmentDraft[] = [];
    for (const file of Array.from(fileList)) {
      const okType = ["application/pdf", "image/jpeg", "image/png"].includes(file.type);
      if (!okType) {
        toast.error(`Formato não aceito: ${file.name}`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name} excede 10MB.`);
        continue;
      }
      next.push({
        id: `${file.name}-${file.size}-${file.lastModified}`,
        name: file.name,
        size: file.size,
        type: file.type,
        file,
      });
    }
    if (next.length) {
      setAttachments((prev) => {
        const ids = new Set(prev.map((p) => p.id));
        return [...prev, ...next.filter((n) => !ids.has(n.id))];
      });
    }
  }

  function validate(): string | null {
    if (!form.contractType) return "Selecione o tipo de contrato.";
    if (!form.category) return "Selecione a categoria.";
    if (!form.siteId) return "Selecione a unidade / filial.";
    if (!form.title.trim()) return "Informe o título / descrição do contrato.";
    if (!form.startDate || !form.endDate) return "Informe as datas de vigência.";
    if (form.endDate < form.startDate) return "A data de término não pode ser anterior à data de início.";
    const value = parseCurrencyBrlInput(form.valueInput);
    if (!(value > 0)) return "O valor do contrato precisa ser maior que zero.";
    if (!form.recurrence) return "Selecione a recorrência.";
    if (!form.paymentMethod) return "Selecione a forma de pagamento.";
    if (!form.dueDay) return "Selecione o dia do vencimento.";
    if (!form.status) return "Selecione o status do contrato.";
    if (!form.responsibleUserId) return "Selecione o responsável pelo contrato.";
    if (form.status === "active" && form.endDate < todayIso()) {
      return "Contrato ativo precisa ter vigência válida (término no futuro ou hoje).";
    }
    return null;
  }

  async function onSave() {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSaving(true);
    try {
      const categoryLabel = CATEGORY_OPTIONS.find((c) => c.value === form.category)?.label ?? form.category;
      const payload: ClientContractPayload = {
        contract_type: form.contractType,
        title: form.title.trim(),
        status: form.status,
        recurrence: form.recurrence,
        start_date: form.startDate,
        end_date: form.endDate,
        value: parseCurrencyBrlInput(form.valueInput),
        payment_method: form.paymentMethod,
        due_day: Number(form.dueDay),
        notes: form.notes.trim().slice(0, MAX_NOTES) || undefined,
        client_site_id: Number(form.siteId),
        responsible_user_id: Number(form.responsibleUserId),
        category: form.category,
        form_category_label: categoryLabel,
        next_due_date: form.nextDueDate || null,
        adjustment_index: form.adjustmentIndex || null,
        adjustment_period: form.adjustmentPeriod || null,
        late_fee_percent: form.lateFee ? Number(form.lateFee.replace(",", ".")) : null,
        interest_percent: form.interest ? Number(form.interest.replace(",", ".")) : null,
        auto_renewal: form.autoRenewal,
        expiry_notice_days: form.expiryNoticeDays ? Number(form.expiryNoticeDays) : 30,
        coverage_location: form.coverageLocation.trim() || null,
        billing_notes: form.billingNotes.trim() || null,
        contract_year: Number(form.startDate.slice(0, 4)) || new Date().getFullYear(),
        equipment_ids: selectedEquipmentIds,
        services: selectedServices,
      };
      const created = await createClientContract(clientId, payload);
      if (attachments.length) {
        const results = await Promise.allSettled(
          attachments.map((draft) => uploadClientContractAttachment(clientId, created.id, draft.file)),
        );
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
          toast.error(
            `Contrato ${created.contract_number} salvo, mas ${failed} anexo(s) não foram enviados ao S3.`,
          );
        } else {
          toast.success(`Contrato ${created.contract_number} cadastrado com sucesso.`);
        }
      } else {
        toast.success(`Contrato ${created.contract_number} cadastrado com sucesso.`);
      }
      navigate(backHref);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o contrato.");
    } finally {
      setSaving(false);
    }
  }

  if (!Number.isFinite(clientId) || clientId < 1) {
    return <Navigate to="/app/clients" replace />;
  }

  if (loading) {
    return (
      <div className={styles.pageShell}>
        <p className={styles.loading}>Carregando formulário de contrato…</p>
      </div>
    );
  }

  return (
    <div className={styles.pageShell}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderInner}>
          <nav className={styles.breadcrumb} aria-label="Breadcrumb">
            <Link to="/app/clients">Clientes</Link>
            <span className={styles.breadcrumbSep}>›</span>
            <Link to={`/app/clients/${clientId}`}>{clientName}</Link>
            <span className={styles.breadcrumbSep}>›</span>
            <Link to={backHref}>Editar cliente</Link>
            <span className={styles.breadcrumbSep}>›</span>
            <span className={styles.breadcrumbCurrent}>Novo contrato</span>
          </nav>
          <h1 className={styles.title}>Novo contrato</h1>
          <p className={styles.lead}>Cadastre um novo contrato ou acordo comercial para este cliente.</p>
        </div>
      </header>

      <div className={styles.content}>
        <FormCard icon={<FileText />} title="Informações gerais">
          <div className={styles.grid4}>
            <div className={styles.field}>
              <label className={styles.label}>Nº do contrato</label>
              <input
                className={`${styles.input} ${styles.inputReadonly}`}
                readOnly
                value={numberPreview}
                aria-describedby="contract-number-hint"
              />
              <span id="contract-number-hint" className={styles.fieldHint}>
                Prévia — o número definitivo é gerado automaticamente ao salvar.
              </span>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>
                Tipo de contrato<span className={styles.required}>*</span>
              </label>
              <select
                className={styles.select}
                value={form.contractType}
                onChange={(e) => patchForm("contractType", e.target.value)}
              >
                <option value="">Selecione o tipo</option>
                {CONTRACT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>
                Categoria<span className={styles.required}>*</span>
              </label>
              <select
                className={styles.select}
                value={form.category}
                onChange={(e) => patchForm("category", e.target.value)}
              >
                <option value="">Selecione a categoria</option>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>
                Unidade / Filial<span className={styles.required}>*</span>
              </label>
              <select
                className={styles.select}
                value={form.siteId}
                onChange={(e) => patchForm("siteId", e.target.value)}
              >
                <option value="">Selecione a unidade / filial</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {siteLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className={`${styles.field} ${styles.fieldFull}`}>
              <label className={styles.label}>
                Título / Descrição do contrato<span className={styles.required}>*</span>
              </label>
              <input
                className={styles.input}
                placeholder="Ex.: Contrato de manutenção preventiva dos sistemas de climatização"
                value={form.title}
                onChange={(e) => patchForm("title", e.target.value)}
              />
            </div>
          </div>
          {form.contractType === "PMOC" || form.category === "recorrente" ? (
            <p className={styles.automationNote}>
              {form.contractType === "PMOC"
                ? "Contrato PMOC: ao salvar, o sistema fica preparado para criar plano PMOC, vincular equipamentos e gerar preventivas conforme a periodicidade."
                : null}
              {form.contractType === "PMOC" && form.category === "recorrente" ? " " : null}
              {form.category === "recorrente"
                ? "Contrato recorrente: preparado para gerar próximas cobranças e vencimentos."
                : null}
            </p>
          ) : null}
        </FormCard>

        <div className={styles.twoCol}>
          <FormCard icon={<CalendarDays />} title="Vigência e valores">
            <div className={styles.grid4} style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className={styles.field}>
                <label className={styles.label}>
                  Data de início<span className={styles.required}>*</span>
                </label>
                <input
                  type="date"
                  className={styles.input}
                  value={form.startDate}
                  onChange={(e) => patchForm("startDate", e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>
                  Data de término<span className={styles.required}>*</span>
                </label>
                <input
                  type="date"
                  className={styles.input}
                  value={form.endDate}
                  onChange={(e) => patchForm("endDate", e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>
                  Valor do contrato<span className={styles.required}>*</span>
                </label>
                <input
                  className={styles.input}
                  placeholder="R$ 0,00"
                  value={form.valueInput}
                  onChange={(e) => patchForm("valueInput", formatCurrencyBrlInput(e.target.value))}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>
                  Recorrência<span className={styles.required}>*</span>
                </label>
                <select
                  className={styles.select}
                  value={form.recurrence}
                  onChange={(e) => patchForm("recurrence", e.target.value)}
                >
                  <option value="">Selecione a recorrência</option>
                  {RECURRENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Próximo vencimento</label>
                <input
                  type="date"
                  className={styles.input}
                  value={form.nextDueDate}
                  onChange={(e) => patchForm("nextDueDate", e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Índice de reajuste</label>
                <select
                  className={styles.select}
                  value={form.adjustmentIndex}
                  onChange={(e) => patchForm("adjustmentIndex", e.target.value)}
                >
                  <option value="">Selecione o índice</option>
                  <option value="none">Sem reajuste</option>
                  <option value="IPCA">IPCA</option>
                  <option value="IGPM">IGPM</option>
                  <option value="fixo">Fixo</option>
                </select>
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label}>Periodicidade do reajuste</label>
                <select
                  className={styles.select}
                  value={form.adjustmentPeriod}
                  onChange={(e) => patchForm("adjustmentPeriod", e.target.value)}
                >
                  <option value="">Selecione a periodicidade</option>
                  <option value="monthly">Mensal</option>
                  <option value="annual">Anual</option>
                </select>
              </div>
            </div>
          </FormCard>

          <FormCard icon={<Wrench />} title="Cobertura e escopo">
            <div className={styles.field} style={{ marginBottom: "1rem" }}>
              <label className={styles.label}>Equipamentos inclusos</label>
              <div className={styles.selectRow}>
                <input
                  className={styles.input}
                  readOnly
                  placeholder="Selecione os equipamentos"
                  value={
                    selectedEquipmentLabels.length
                      ? `${selectedEquipmentLabels.length} equipamento(s) selecionado(s)`
                      : ""
                  }
                />
                <button type="button" className={styles.btnSelect} onClick={openEquipModal}>
                  Selecionar
                </button>
              </div>
              {selectedEquipmentLabels.length ? (
                <div className={styles.chips}>
                  {selectedEquipmentLabels.map((label, idx) => (
                    <span key={`${label}-${idx}`} className={styles.chip}>
                      {label}
                      <button
                        type="button"
                        aria-label="Remover"
                        onClick={() =>
                          setSelectedEquipmentIds((prev) => prev.filter((_, i) => i !== idx))
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className={styles.field} style={{ marginBottom: "1rem" }}>
              <label className={styles.label}>Serviços inclusos</label>
              <div className={styles.selectRow}>
                <input
                  className={styles.input}
                  readOnly
                  placeholder="Selecione os serviços"
                  value={
                    selectedServices.length ? `${selectedServices.length} serviço(s) selecionado(s)` : ""
                  }
                />
                <button type="button" className={styles.btnSelect} onClick={openServiceModal}>
                  Selecionar
                </button>
              </div>
              {selectedServices.length ? (
                <div className={styles.chips}>
                  {selectedServices.map((svc) => (
                    <span key={svc} className={styles.chip}>
                      {svc}
                      <button
                        type="button"
                        aria-label="Remover"
                        onClick={() => setSelectedServices((prev) => prev.filter((s) => s !== svc))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Abrangência / Local</label>
              <input
                className={styles.input}
                placeholder="Ex.: Todas as salas e áreas administrativas"
                value={form.coverageLocation}
                onChange={(e) => patchForm("coverageLocation", e.target.value)}
              />
            </div>
          </FormCard>

          <FormCard icon={<Wallet />} title="Condições comerciais">
            <div className={styles.grid4} style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className={styles.field}>
                <label className={styles.label}>
                  Forma de pagamento<span className={styles.required}>*</span>
                </label>
                <select
                  className={styles.select}
                  value={form.paymentMethod}
                  onChange={(e) => patchForm("paymentMethod", e.target.value)}
                >
                  <option value="">Selecione</option>
                  {PAYMENT_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>
                  Dia do vencimento<span className={styles.required}>*</span>
                </label>
                <select
                  className={styles.select}
                  value={form.dueDay}
                  onChange={(e) => patchForm("dueDay", e.target.value)}
                >
                  <option value="">Selecione</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Multa por atraso (%)</label>
                <input
                  className={styles.input}
                  placeholder="Ex.: 2,00"
                  value={form.lateFee}
                  onChange={(e) => patchForm("lateFee", e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Juros por atraso (% a.m.)</label>
                <input
                  className={styles.input}
                  placeholder="Ex.: 1,00"
                  value={form.interest}
                  onChange={(e) => patchForm("interest", e.target.value)}
                />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label className={styles.label}>Observações de cobrança</label>
                <input
                  className={styles.input}
                  placeholder="Enviar boleto por e-mail com 5 dias de antecedência"
                  value={form.billingNotes}
                  onChange={(e) => patchForm("billingNotes", e.target.value)}
                />
              </div>
            </div>
          </FormCard>

          <FormCard icon={<FileText />} title="Observações">
            <div className={styles.field}>
              <textarea
                className={styles.textarea}
                placeholder="Informações complementares sobre este contrato..."
                maxLength={MAX_NOTES}
                value={form.notes}
                onChange={(e) => patchForm("notes", e.target.value.slice(0, MAX_NOTES))}
              />
              <span className={styles.charCount}>
                {form.notes.length}/{MAX_NOTES}
              </span>
            </div>
          </FormCard>

          <FormCard icon={<Settings2 />} title="Status e configurações">
            <div className={styles.grid4} style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className={styles.field}>
                <label className={styles.label}>
                  Status do contrato<span className={styles.required}>*</span>
                </label>
                <select
                  className={styles.select}
                  value={form.status}
                  onChange={(e) => patchForm("status", e.target.value as ClientContractStatus)}
                >
                  <option value="active">Ativo</option>
                  <option value="draft">Rascunho</option>
                  <option value="suspended">Suspenso</option>
                  <option value="cancelled">Encerrado</option>
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Renovação automática</label>
                <div className={styles.radioRow}>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="auto-renewal"
                      checked={form.autoRenewal}
                      onChange={() => patchForm("autoRenewal", true)}
                    />
                    Sim
                  </label>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="auto-renewal"
                      checked={!form.autoRenewal}
                      onChange={() => patchForm("autoRenewal", false)}
                    />
                    Não
                  </label>
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Avisar vencimento com</label>
                <select
                  className={styles.select}
                  value={form.expiryNoticeDays}
                  onChange={(e) => patchForm("expiryNoticeDays", e.target.value)}
                >
                  {NOTICE_OPTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d} dias
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>
                  Responsável pelo contrato<span className={styles.required}>*</span>
                </label>
                <select
                  className={styles.select}
                  value={form.responsibleUserId}
                  onChange={(e) => patchForm("responsibleUserId", e.target.value)}
                >
                  <option value="">Selecione o responsável</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </FormCard>

          <FormCard icon={<Paperclip />} title="Documentos anexos">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />
            <div
              className={`${styles.uploadZone}${dragOver ? ` ${styles.uploadZoneActive}` : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                addFiles(e.dataTransfer.files);
              }}
            >
              <div className={styles.uploadIcon} aria-hidden>
                <CloudUpload size={22} />
              </div>
              <p className={styles.uploadTitle}>Arraste e solte os arquivos aqui ou clique para selecionar</p>
              <p className={styles.uploadHint}>Formatos aceitos: PDF, JPG, PNG | Tamanho máximo: 10MB por arquivo</p>
            </div>
            {attachments.length ? (
              <div className={styles.fileList}>
                {attachments.map((file) => (
                  <div key={file.id} className={styles.fileRow}>
                    <div className={styles.fileMeta}>
                      <span className={styles.fileName}>{file.name}</span>
                      <span className={styles.fileSize}>{formatBytes(file.size)}</span>
                    </div>
                    <button
                      type="button"
                      className={styles.btnGhostIcon}
                      aria-label={`Excluir ${file.name}`}
                      onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== file.id))}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </FormCard>
        </div>
      </div>

      <footer className={styles.footerBar}>
        <div className={styles.footerInner}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSecondary}`}
            disabled={saving}
            onClick={() => navigate(backHref)}
          >
            <X size={16} />
            Cancelar
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={saving}
            onClick={() => void onSave()}
          >
            <Save size={16} />
            {saving ? "Salvando…" : "Salvar contrato"}
          </button>
        </div>
      </footer>

      {equipModalOpen ? (
        <div className={styles.modalBackdrop} role="presentation" onClick={() => setEquipModalOpen(false)}>
          <div
            className={styles.modalCard}
            role="dialog"
            aria-modal
            aria-labelledby="equip-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h3 id="equip-modal-title" className={styles.modalTitle}>
                Selecionar equipamentos
              </h3>
              <button type="button" className={styles.btnGhostIcon} onClick={() => setEquipModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className={styles.modalBody}>
              {equipments.length === 0 ? (
                <p className={styles.loading}>Nenhum equipamento ativo neste cliente.</p>
              ) : (
                equipments.map((eq) => {
                  const brand = eq.components[0]?.catalog.brand ?? "—";
                  const model = eq.components[0]?.catalog.model ?? "—";
                  const site = sites.find((s) => s.id === eq.client_site_id);
                  const checked = equipDraft.includes(eq.id);
                  return (
                    <label key={eq.id} className={styles.checkRow}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setEquipDraft((prev) =>
                            checked ? prev.filter((id) => id !== eq.id) : [...prev, eq.id],
                          )
                        }
                      />
                      <span className={styles.checkMeta}>
                        <span className={styles.checkTitle}>
                          {eq.tag} · {eq.components[0]?.catalog.category.name ?? "Equipamento"}
                        </span>
                        <span className={styles.checkSub}>
                          {brand} {model} · {site?.name ?? "Sem unidade"}
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={`${styles.btn} ${styles.btnSecondary}`} onClick={() => setEquipModalOpen(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => {
                  setSelectedEquipmentIds(equipDraft);
                  setEquipModalOpen(false);
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {serviceModalOpen ? (
        <div className={styles.modalBackdrop} role="presentation" onClick={() => setServiceModalOpen(false)}>
          <div
            className={styles.modalCard}
            role="dialog"
            aria-modal
            aria-labelledby="service-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h3 id="service-modal-title" className={styles.modalTitle}>
                Selecionar serviços
              </h3>
              <button type="button" className={styles.btnGhostIcon} onClick={() => setServiceModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className={styles.modalBody}>
              {SERVICE_OPTIONS.map((svc) => {
                const checked = serviceDraft.includes(svc);
                return (
                  <label key={svc} className={styles.checkRow}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setServiceDraft((prev) =>
                          checked ? prev.filter((s) => s !== svc) : [...prev, svc],
                        )
                      }
                    />
                    <span className={styles.checkMeta}>
                      <span className={styles.checkTitle}>{svc}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={() => setServiceModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => {
                  setSelectedServices(serviceDraft);
                  setServiceModalOpen(false);
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
