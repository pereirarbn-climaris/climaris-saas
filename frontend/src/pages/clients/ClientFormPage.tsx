import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useMatch, useNavigate, useOutletContext, useParams } from "react-router-dom";
import {
  createClientEquipment,
  createEquipmentDocument,
  createClient,
  deactivateClientEquipment,
  deleteClient,
  getClient,
  listClientServiceItemsLinks,
  listClientEquipmentDocuments,
  listClientEquipments,
  listEquipmentHistory,
  updateClientEquipment,
  type ClientServiceItemLinkRowOut,
  type EquipmentDocumentCreatePayload,
  type EquipmentDocumentWithEquipmentOut,
  updateClient,
  type ClientCreatePayload,
  type EquipmentHistoryRowOut,
  type ClientTaxIdKind,
  type EquipmentOut,
} from "../../api/clients";
import { fetchCepLookup } from "../../api/cep";
import { fetchCnpjOpen } from "../../api/cnpj";
import { listBudgets, type BudgetOut, type BudgetStatus } from "../../api/budgets";
import {
  listServiceOrders,
  updateServiceOrderItemEquipment,
  type OrderStatus,
  type ServiceOrderOut,
} from "../../api/serviceOrders";
import {
  digitsOnly,
  digitsOnlyPhoneForApi,
  formatCepInput,
  formatPhoneBrInput,
  formatTaxDocumentInput,
  taxDocumentOnKindChange,
} from "../../lib/brMask";
import type { DashboardOutletContext } from "../dashboardContext";
import loginStyles from "../LoginPage.module.css";
import styles from "./ClientFormPage.module.css";
import {
  budgetStatusLabel,
  buildUpdatePayload,
  clientHasPersistedAddress,
  emptyEquipmentDocumentFilters,
  emptyEquipmentDocumentForm,
  emptyEquipmentForm,
  emptyForm,
  formatDateTime,
  formatEquipmentHistorySource,
  fromClient,
  mergeCnpjLookup,
  serviceOrderStatusLabel,
  type EquipmentDocumentFilters,
  type EquipmentDocumentFormState,
  type EquipmentFormState,
  type FormState,
} from "./clientFormHelpers";

function budgetStatusClass(status: BudgetStatus): string {
  const map: Record<BudgetStatus, string> = {
    draft: styles.badgeDraft,
    sent: styles.badgeSent,
    approved: styles.badgeApproved,
    rejected: styles.badgeRejected,
    expired: styles.badgeExpired,
  };
  return map[status] ?? styles.badgeDraft;
}

function serviceOrderStatusClass(status: OrderStatus): string {
  const map: Record<OrderStatus, string> = {
    open: styles.badgeOpen,
    approved: styles.badgeApproved,
    scheduled: styles.badgeScheduled,
    in_progress: styles.badgeInProgress,
    done: styles.badgeDone,
    cancelled: styles.badgeRejected,
  };
  return map[status] ?? styles.badgeOpen;
}

export function ClientFormPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const isNew = useMatch({ path: "/app/clients/new", end: true }) != null;
  const { clientId } = useParams<{ clientId: string }>();
  const idNum = clientId ? Number(clientId) : NaN;

  const canEdit = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";
  const canDelete = ctx?.user.role === "admin";
  const readOnly = !canEdit;

  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadErr, setLoadErr] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepErr, setCepErr] = useState("");
  const [cnpjLookupLoading, setCnpjLookupLoading] = useState(false);
  const [cnpjLookupErr, setCnpjLookupErr] = useState("");
  /** Só usado quando já há endereço salvo: se true, o botão “Consultar CNPJ” também aplica endereço da Receita. */
  const [cnpjIncludeAddress, setCnpjIncludeAddress] = useState(true);
  const [activeTab, setActiveTab] = useState<"form" | "equipments" | "budgets" | "orders">("form");
  const [clientBudgets, setClientBudgets] = useState<BudgetOut[]>([]);
  const [clientOrders, setClientOrders] = useState<ServiceOrderOut[]>([]);
  const [clientEquipments, setClientEquipments] = useState<EquipmentOut[]>([]);
  const [equipmentForm, setEquipmentForm] = useState<EquipmentFormState>(emptyEquipmentForm);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null);
  const [showEquipmentEditor, setShowEquipmentEditor] = useState(false);
  const [editingEquipmentId, setEditingEquipmentId] = useState<number | null>(null);
  const [equipmentHistory, setEquipmentHistory] = useState<EquipmentHistoryRowOut[]>([]);
  const [clientPmocDocuments, setClientPmocDocuments] = useState<EquipmentDocumentWithEquipmentOut[]>([]);
  const [showClientPmocEditor, setShowClientPmocEditor] = useState(false);
  const [documentSaving, setDocumentSaving] = useState(false);
  const [equipmentDocumentForm, setEquipmentDocumentForm] = useState<EquipmentDocumentFormState>(
    emptyEquipmentDocumentForm,
  );
  const [pmocDocumentFilters, setPmocDocumentFilters] = useState<EquipmentDocumentFilters>(
    emptyEquipmentDocumentFilters,
  );
  const [clientServiceLinks, setClientServiceLinks] = useState<ClientServiceItemLinkRowOut[]>([]);
  const [linkSavingServiceItemId, setLinkSavingServiceItemId] = useState<number | null>(null);
  const [equipmentSaving, setEquipmentSaving] = useState(false);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedErr, setRelatedErr] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  /** Endereço já existe no banco (afeta padrão do CNPJ: só nomes, salvo se marcar “incluir endereço”). */
  const [addressPersisted, setAddressPersisted] = useState(false);

  const docDigits = useMemo(() => digitsOnly(form.document).slice(0, 14), [form.document]);

  const cepDigits = useMemo(
    () => form.address_postal_code.replace(/\D/g, "").slice(0, 8),
    [form.address_postal_code],
  );

  const setField = useCallback((key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    if (isNew) {
      setAddressPersisted(false);
      return;
    }
    if (!clientId || !Number.isFinite(idNum) || idNum < 1) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setLoadErr("");
      try {
        const c = await getClient(idNum);
        if (!cancelled) {
          setAddressPersisted(clientHasPersistedAddress(c));
          setForm(fromClient(c));
        }
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : "Erro ao carregar.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, clientId, idNum]);

  useEffect(() => {
    setCnpjIncludeAddress(!addressPersisted);
  }, [addressPersisted]);

  useEffect(() => {
    setCepErr("");
  }, [clientId, isNew]);

  useEffect(() => {
    if (docDigits.length < 14) setCnpjLookupErr("");
  }, [docDigits.length]);

  async function onBuscarCep() {
    if (readOnly) return;
    if (cepDigits.length !== 8) {
      setCepErr("Informe um CEP com 8 dígitos.");
      return;
    }
    setCepLoading(true);
    setCepErr("");
    setMsg(null);
    try {
      const data = await fetchCepLookup(cepDigits);
      setForm((prev) => {
        const cur = prev.address_postal_code.replace(/\D/g, "").slice(0, 8);
        if (cur !== cepDigits) return prev;
        // Substitui pelo retorno da API: se o novo CEP não tem complemento no ViaCEP, o campo zera (não mantém o do endereço antigo).
        const uf = (data.address_state ?? "").trim();
        return {
          ...prev,
          address_street: (data.address_street ?? "").trim(),
          address_complement: (data.address_complement ?? "").trim(),
          address_district: (data.address_district ?? "").trim(),
          address_city: (data.address_city ?? "").trim(),
          address_state: uf ? uf.toUpperCase().slice(0, 2) : "",
          address_postal_code: data.address_postal_code
            ? formatCepInput(data.address_postal_code)
            : formatCepInput(cepDigits),
        };
      });
      setMsg({
        kind: "ok",
        text: "Endereço preenchido pela consulta de CEP. Clique em Salvar alterações para gravar no banco.",
      });
    } catch (e) {
      setCepErr(e instanceof Error ? e.message : "Não foi possível buscar o CEP.");
    } finally {
      setCepLoading(false);
    }
  }

  async function onConsultarCnpj() {
    if (readOnly) return;
    if (form.tax_id_kind !== "cnpj" || docDigits.length !== 14) {
      setCnpjLookupErr("Informe um CNPJ válido com 14 dígitos.");
      return;
    }
    setCnpjLookupLoading(true);
    setCnpjLookupErr("");
    setMsg(null);
    try {
      const lu = await fetchCnpjOpen(docDigits);
      setForm((prev) => {
        const cur = digitsOnly(prev.document).slice(0, 14);
        if (cur !== docDigits) return prev;
        return mergeCnpjLookup(prev, lu, cnpjIncludeAddress);
      });
      setMsg({
        kind: "ok",
        text: cnpjIncludeAddress
          ? "Dados da Receita aplicados. Clique em Salvar alterações para gravar no banco."
          : "Razão social e nome fantasia atualizados. Clique em Salvar alterações para gravar no banco.",
      });
    } catch (e) {
      setCnpjLookupErr(e instanceof Error ? e.message : "Não foi possível consultar o CNPJ.");
    } finally {
      setCnpjLookupLoading(false);
    }
  }

  useEffect(() => {
    if (isNew || !Number.isFinite(idNum) || idNum < 1) return;
    let cancelled = false;
    void (async () => {
      setRelatedLoading(true);
      setRelatedErr("");
      try {
        const tasks: Promise<unknown>[] = [listClientEquipments(idNum)];
        if (activeTab !== "equipments") {
          tasks.push(listBudgets({ limit: 100 }), listServiceOrders({ limit: 100 }));
        } else {
          tasks.push(listClientServiceItemsLinks(idNum, { only_without_equipment: true }));
        }
        const [equipments, budgets, orders] = await Promise.all(tasks);
        if (cancelled) return;
        setClientEquipments((equipments as EquipmentOut[]) ?? []);
        if (activeTab === "equipments") {
          setClientServiceLinks((budgets as ClientServiceItemLinkRowOut[]) ?? []);
        }
        if (activeTab !== "equipments") {
          setClientBudgets((budgets as BudgetOut[]).filter((row) => row.client_id === idNum));
          setClientOrders((orders as ServiceOrderOut[]).filter((row) => row.client_id === idNum));
        }
      } catch (e) {
        if (!cancelled) {
          setRelatedErr(e instanceof Error ? e.message : "Não foi possível carregar dados relacionados do cliente.");
        }
      } finally {
        if (!cancelled) setRelatedLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, idNum, isNew]);

  const closeEquipmentPanel = useCallback(() => {
    setShowEquipmentEditor(false);
    setSelectedEquipmentId(null);
    setEditingEquipmentId(null);
    setEquipmentHistory([]);
    setEquipmentForm(emptyEquipmentForm());
  }, []);

  useEffect(() => {
    if (activeTab === "equipments") return;
    closeEquipmentPanel();
    setShowClientPmocEditor(false);
    setEquipmentDocumentForm(emptyEquipmentDocumentForm());
  }, [activeTab, closeEquipmentPanel]);

  function startEditEquipment(row: EquipmentOut) {
    setEditingEquipmentId(row.id);
    setSelectedEquipmentId(row.id);
    setShowEquipmentEditor(true);
    const nomeAmbiente = row.ambiente_nome ?? row.local_instalacao ?? "";
    setEquipmentForm({
      tipo: row.tipo,
      identificacao: row.identificacao,
      categoria_instalacao: row.categoria_instalacao ?? "",
      fabricante: row.fabricante ?? "",
      modelo: row.modelo ?? "",
      modelo_evaporadora: row.modelo_evaporadora ?? "",
      modelo_condensadora: row.modelo_condensadora ?? "",
      serial: row.serial ?? "",
      capacidade_btu: row.capacidade_btu ? String(row.capacidade_btu) : "",
      capacidade_tr: row.capacidade_tr != null && row.capacidade_tr !== undefined ? String(row.capacidade_tr) : "",
      tipo_gas: row.tipo_gas ?? "",
      voltagem: row.voltagem ?? "",
      tecnologia_ciclo: (row.tecnologia_ciclo as "" | "on_off" | "inverter" | null) ?? "",
      local_instalacao: row.local_instalacao ?? "",
      ambiente_nome: nomeAmbiente,
      ambiente_tipo: row.ambiente_tipo ?? "",
      area_m2: row.area_m2 != null && row.area_m2 !== undefined ? String(row.area_m2) : "",
      ocupacao_fixa: row.ocupacao_fixa != null ? String(row.ocupacao_fixa) : "",
      ocupacao_flutuante: row.ocupacao_flutuante != null ? String(row.ocupacao_flutuante) : "",
      carga_termica_total: row.carga_termica_total ?? "",
      massa_gas_kg: row.massa_gas_kg != null && row.massa_gas_kg !== undefined ? String(row.massa_gas_kg) : "",
      corrente_nominal_a:
        row.corrente_nominal_a != null && row.corrente_nominal_a !== undefined ? String(row.corrente_nominal_a) : "",
      filtro_tipo: row.filtro_tipo ?? "",
      filtro_quantidade: row.filtro_quantidade != null ? String(row.filtro_quantidade) : "",
      filtro_dimensoes: row.filtro_dimensoes ?? "",
      filtro_periodicidade_limpeza: row.filtro_periodicidade_limpeza ?? "",
      ativo: row.ativo,
    });
  }

  function optNumFromInput(s: string): number | undefined {
    const t = s.trim().replace(",", ".");
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  }

  function optIntFromInput(s: string): number | undefined {
    const t = s.trim();
    if (!t) return undefined;
    const n = parseInt(t, 10);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }

  async function onSubmitEquipment(e: FormEvent) {
    e.preventDefault();
    if (isNew || !canEdit || !Number.isFinite(idNum) || idNum < 1) return;
    if (!equipmentForm.identificacao.trim()) {
      setMsg({ kind: "err", text: "Informe a identificação do equipamento." });
      return;
    }
    setEquipmentSaving(true);
    setMsg(null);
    try {
      const payload = {
        tipo: equipmentForm.tipo,
        identificacao: equipmentForm.identificacao.trim(),
        fabricante: equipmentForm.fabricante.trim() || undefined,
        modelo: equipmentForm.modelo.trim() || undefined,
        serial: equipmentForm.serial.trim() || undefined,
        capacidade_btu: equipmentForm.capacidade_btu.trim() ? Number(equipmentForm.capacidade_btu) : undefined,
        capacidade_tr: optNumFromInput(equipmentForm.capacidade_tr),
        categoria_instalacao: equipmentForm.categoria_instalacao.trim() || undefined,
        modelo_evaporadora: equipmentForm.modelo_evaporadora.trim() || undefined,
        modelo_condensadora: equipmentForm.modelo_condensadora.trim() || undefined,
        tipo_gas: equipmentForm.tipo_gas.trim() || undefined,
        voltagem: equipmentForm.voltagem.trim() || undefined,
        tecnologia_ciclo: equipmentForm.tecnologia_ciclo || undefined,
        local_instalacao: equipmentForm.local_instalacao.trim() || undefined,
        ambiente_nome: equipmentForm.ambiente_nome.trim() || undefined,
        ambiente_tipo: equipmentForm.ambiente_tipo.trim() || undefined,
        area_m2: optNumFromInput(equipmentForm.area_m2),
        ocupacao_fixa: optIntFromInput(equipmentForm.ocupacao_fixa),
        ocupacao_flutuante: optIntFromInput(equipmentForm.ocupacao_flutuante),
        carga_termica_total: equipmentForm.carga_termica_total.trim() || undefined,
        massa_gas_kg: optNumFromInput(equipmentForm.massa_gas_kg),
        corrente_nominal_a: optNumFromInput(equipmentForm.corrente_nominal_a),
        filtro_tipo: equipmentForm.filtro_tipo.trim() || undefined,
        filtro_quantidade: optIntFromInput(equipmentForm.filtro_quantidade),
        filtro_dimensoes: equipmentForm.filtro_dimensoes.trim() || undefined,
        filtro_periodicidade_limpeza: equipmentForm.filtro_periodicidade_limpeza.trim() || undefined,
        ativo: equipmentForm.ativo,
      };
      if (editingEquipmentId) {
        await updateClientEquipment(idNum, editingEquipmentId, payload);
        setMsg({ kind: "ok", text: "Equipamento atualizado." });
      } else {
        await createClientEquipment(idNum, payload);
        setMsg({ kind: "ok", text: "Equipamento cadastrado." });
      }
      const rows = await listClientEquipments(idNum);
      setClientEquipments(rows);
      setClientServiceLinks(await listClientServiceItemsLinks(idNum, { only_without_equipment: true }));
      closeEquipmentPanel();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Erro ao salvar equipamento." });
    } finally {
      setEquipmentSaving(false);
    }
  }

  async function onDeactivateEquipment(equipmentId: number) {
    if (!canEdit || isNew || !Number.isFinite(idNum) || idNum < 1) return;
    setEquipmentSaving(true);
    setMsg(null);
    try {
      await deactivateClientEquipment(idNum, equipmentId);
      setClientEquipments(await listClientEquipments(idNum));
      setClientServiceLinks(await listClientServiceItemsLinks(idNum, { only_without_equipment: true }));
      if (editingEquipmentId === equipmentId) {
        closeEquipmentPanel();
      }
      setMsg({ kind: "ok", text: "Equipamento inativado." });
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Erro ao inativar equipamento." });
    } finally {
      setEquipmentSaving(false);
    }
  }

  async function onLinkServiceItemToEquipment(serviceItemId: number, equipmentId: number | null) {
    if (!canEdit || isNew || !Number.isFinite(idNum) || idNum < 1) return;
    const row = clientServiceLinks.find((item) => item.service_item_id === serviceItemId);
    if (!row) return;
    setLinkSavingServiceItemId(serviceItemId);
    setMsg(null);
    try {
      await updateServiceOrderItemEquipment(row.service_order_id, row.service_item_id, equipmentId);
      setClientServiceLinks(await listClientServiceItemsLinks(idNum, { only_without_equipment: true }));
      if (selectedEquipmentId) {
        setEquipmentHistory(await listEquipmentHistory(idNum, selectedEquipmentId));
      }
      setMsg({ kind: "ok", text: "Vínculo do serviço atualizado." });
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Erro ao vincular serviço ao equipamento." });
    } finally {
      setLinkSavingServiceItemId(null);
    }
  }

  async function onSubmitClientPmocDocument(e: FormEvent) {
    e.preventDefault();
    if (isNew || !canEdit || !Number.isFinite(idNum) || idNum < 1) return;
    const targetEq = equipmentDocumentForm.target_equipment_id;
    if (targetEq === "" || typeof targetEq !== "number") {
      setMsg({ kind: "err", text: "Selecione o equipamento ao qual o documento se refere." });
      return;
    }
    if (!equipmentDocumentForm.title.trim()) {
      setMsg({ kind: "err", text: "Informe o título do documento." });
      return;
    }
    setDocumentSaving(true);
    setMsg(null);
    try {
      const payload: EquipmentDocumentCreatePayload = {
        document_type: equipmentDocumentForm.document_type,
        title: equipmentDocumentForm.title.trim(),
        status: equipmentDocumentForm.status,
        issued_at: equipmentDocumentForm.issued_at || undefined,
        valid_until: equipmentDocumentForm.valid_until || undefined,
        next_due_at: equipmentDocumentForm.next_due_at || undefined,
        notes: equipmentDocumentForm.notes.trim() || undefined,
        schema_version: "v1",
        payload: {},
      };
      await createEquipmentDocument(targetEq, payload);
      setClientPmocDocuments(
        await listClientEquipmentDocuments(idNum, {
          limit: 100,
          q: pmocDocumentFilters.q.trim() || undefined,
          document_type: pmocDocumentFilters.document_type || undefined,
          status: pmocDocumentFilters.status || undefined,
          only_overdue: pmocDocumentFilters.only_overdue || undefined,
        }),
      );
      setEquipmentDocumentForm(emptyEquipmentDocumentForm());
      setShowClientPmocEditor(false);
      setMsg({ kind: "ok", text: "Documento registrado." });
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Erro ao criar documento." });
    } finally {
      setDocumentSaving(false);
    }
  }

  useEffect(() => {
    if (activeTab !== "equipments" || isNew || !selectedEquipmentId || !Number.isFinite(idNum) || idNum < 1) {
      setEquipmentHistory([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const historyRows = await listEquipmentHistory(idNum, selectedEquipmentId);
        if (!cancelled) setEquipmentHistory(historyRows);
      } catch {
        if (!cancelled) setEquipmentHistory([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, idNum, isNew, selectedEquipmentId]);

  useEffect(() => {
    if (activeTab !== "form" || isNew || !Number.isFinite(idNum) || idNum < 1) {
      setClientPmocDocuments([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const documentsRows = await listClientEquipmentDocuments(idNum, {
          limit: 100,
          q: pmocDocumentFilters.q.trim() || undefined,
          document_type: pmocDocumentFilters.document_type || undefined,
          status: pmocDocumentFilters.status || undefined,
          only_overdue: pmocDocumentFilters.only_overdue || undefined,
        });
        if (!cancelled) setClientPmocDocuments(documentsRows);
      } catch {
        if (!cancelled) setClientPmocDocuments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, pmocDocumentFilters, idNum, isNew]);

  if (!ctx) {
    return <Navigate to="/login" replace />;
  }

  if (isNew && !canEdit) {
    return <Navigate to="/app/clients" replace />;
  }

  if (!isNew && (!clientId || !Number.isFinite(idNum) || idNum < 1)) {
    return <Navigate to="/app/clients" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (readOnly) return;

    const digits = digitsOnly(form.document);
    if (digits && digits.length !== 11 && digits.length !== 14) {
      setMsg({ kind: "err", text: "Quando informado, o documento deve ser CPF (11 dígitos) ou CNPJ (14 dígitos)." });
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const payload: ClientCreatePayload = {
          name: form.name.trim(),
          tax_id_kind: form.tax_id_kind,
          phone: digitsOnlyPhoneForApi(form.phone) || undefined,
          whatsapp: digitsOnlyPhoneForApi(form.whatsapp) || undefined,
          email: form.email.trim() || undefined,
          trade_name: form.trade_name.trim() || undefined,
          state_registration: form.state_registration.trim() || undefined,
          ie_indicator: form.ie_indicator || undefined,
          municipal_registration: form.municipal_registration.trim() || undefined,
          address_street: form.address_street.trim() || undefined,
          address_number: form.address_number.trim() || undefined,
          address_complement: form.address_complement.trim() || undefined,
          address_district: form.address_district.trim() || undefined,
          address_city: form.address_city.trim() || undefined,
          address_state: form.address_state.trim() ? form.address_state.trim().toUpperCase().slice(0, 2) : undefined,
          address_postal_code: digitsOnly(form.address_postal_code).slice(0, 8) || undefined,
          address_country: "Brasil",
        };
        if (digits) {
          payload.document = digits;
        }
        const created = await createClient(payload);
        navigate(`/app/clients/${created.id}`, { replace: true });
      } else {
        const updated = await updateClient(idNum, buildUpdatePayload(form));
        setAddressPersisted(clientHasPersistedAddress(updated));
        setForm(fromClient(updated));
        setMsg({ kind: "ok", text: "Cliente atualizado." });
      }
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Erro ao salvar." });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!canDelete || isNew) return;
    setDeleting(true);
    setMsg(null);
    try {
      await deleteClient(idNum);
      navigate("/app/clients", { replace: true });
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Erro ao excluir." });
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  }

  if (!isNew && loading) {
    return (
      <div className={styles.wrap}>
        <p className={styles.loading}>Carregando cliente…</p>
      </div>
    );
  }

  if (!isNew && loadErr) {
    return (
      <div className={styles.wrap}>
        <Link className={styles.btnBackLink} to="/app/clients">
          ← Voltar à lista
        </Link>
        <p className={styles.msgErr}>{loadErr}</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.hero}>
        <div className={styles.heroLeft}>
          <span className={styles.heroIcon} aria-hidden>
            <svg viewBox="0 0 24 24">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            </svg>
          </span>
          <div>
            <h1 className={styles.title}>{isNew ? "Novo cliente" : "Editar cliente"}</h1>
            <p className={styles.lead}>
              Cadastro completo para faturamento e operacao (CPF/CNPJ, fiscal, endereco e historico comercial).
            </p>
          </div>
        </div>
      </header>
      {!isNew ? (
        <div className={styles.tabs} role="tablist" aria-label="Seções do cliente">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "form"}
            className={`${styles.tabBtn} ${activeTab === "form" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("form")}
          >
            Cadastro
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "equipments"}
            className={`${styles.tabBtn} ${activeTab === "equipments" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("equipments")}
          >
            Equipamentos ({clientEquipments.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "budgets"}
            className={`${styles.tabBtn} ${activeTab === "budgets" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("budgets")}
          >
            Orcamentos ({clientBudgets.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "orders"}
            className={`${styles.tabBtn} ${activeTab === "orders" ? styles.tabBtnActive : ""}`}
            onClick={() => setActiveTab("orders")}
          >
            OS ({clientOrders.length})
          </button>
        </div>
      ) : null}

      {activeTab === "form" ? (
      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Identificação</h2>
          <label className={loginStyles.label} htmlFor="c-name">
            Razão social / nome
          </label>
          <input
            id="c-name"
            className={loginStyles.input}
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            required
            disabled={readOnly}
          />
          <div className={styles.grid2}>
            <div>
              <label className={loginStyles.label} htmlFor="c-kind">
                Tipo
              </label>
              <select
                id="c-kind"
                className={loginStyles.select}
                value={form.tax_id_kind}
                onChange={(e) => {
                  setCnpjLookupErr("");
                  const k = e.target.value as ClientTaxIdKind;
                  setForm((prev) => ({
                    ...prev,
                    tax_id_kind: k,
                    document: taxDocumentOnKindChange(prev.document, k),
                  }));
                }}
                disabled={readOnly}
              >
                <option value="cnpj">CNPJ</option>
                <option value="cpf">CPF</option>
              </select>
            </div>
            <div>
              <label className={loginStyles.label} htmlFor="c-doc">
                CPF / CNPJ
              </label>
              <input
                id="c-doc"
                className={loginStyles.input}
                value={form.document}
                onChange={(e) =>
                  setField("document", formatTaxDocumentInput(e.target.value, form.tax_id_kind))
                }
                inputMode="numeric"
                maxLength={form.tax_id_kind === "cpf" ? 14 : 18}
                disabled={readOnly}
                aria-busy={form.tax_id_kind === "cnpj" && cnpjLookupLoading}
              />
            </div>
          </div>
          {form.tax_id_kind === "cnpj" && !readOnly ? (
            <div className={styles.externalLookupBlock}>
              <div className={styles.externalLookupActions}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  disabled={cnpjLookupLoading || docDigits.length !== 14}
                  onClick={() => void onConsultarCnpj()}
                >
                  {cnpjLookupLoading ? "Consultando…" : "Consultar CNPJ na Receita"}
                </button>
                {addressPersisted ? (
                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={cnpjIncludeAddress}
                      onChange={(e) => setCnpjIncludeAddress(e.target.checked)}
                      disabled={cnpjLookupLoading}
                    />
                    Incluir endereço retornado pela Receita (substitui logradouro, complemento, CEP etc.)
                  </label>
                ) : null}
              </div>
              <p className={styles.cepHint}>
                {cnpjLookupLoading
                  ? "Consultando CNPJ…"
                  : "A consulta não roda sozinha: use o botão acima. O que vier da API só entra no formulário; para gravar no banco, clique em Salvar alterações."}
              </p>
            </div>
          ) : null}
          {cnpjLookupErr && !cnpjLookupLoading ? <p className={styles.msgErr}>{cnpjLookupErr}</p> : null}
          <label className={loginStyles.label} htmlFor="c-trade">
            Nome fantasia
          </label>
          <input
            id="c-trade"
            className={loginStyles.input}
            value={form.trade_name}
            onChange={(e) => setField("trade_name", e.target.value)}
            disabled={readOnly}
          />
          <div className={styles.grid2}>
            <div>
              <label className={loginStyles.label} htmlFor="c-phone">
                Telefone
              </label>
              <input
                id="c-phone"
                className={loginStyles.input}
                type="tel"
                value={form.phone}
                onChange={(e) => setField("phone", formatPhoneBrInput(e.target.value))}
                placeholder="(11) 3456-7890 — fixo ou ramal"
                autoComplete="tel-national"
                maxLength={15}
                disabled={readOnly}
              />
            </div>
            <div>
              <label className={loginStyles.label} htmlFor="c-wa">
                WhatsApp
              </label>
              <input
                id="c-wa"
                className={loginStyles.input}
                type="tel"
                value={form.whatsapp}
                onChange={(e) => setField("whatsapp", formatPhoneBrInput(e.target.value))}
                placeholder="(11) 98765-4321 — celular com DDD"
                autoComplete="tel-national"
                maxLength={15}
                disabled={readOnly}
              />
            </div>
          </div>
          <label className={loginStyles.label} htmlFor="c-email">
            E-mail
          </label>
          <input
            id="c-email"
            className={loginStyles.input}
            type="email"
            value={form.email}
            onChange={(e) => setField("email", e.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Fiscal</h2>
          <p className={styles.cepHint}>IE e IM quando a prefeitura ou a NF-e exigirem.</p>
          <div className={styles.grid2}>
            <div>
              <label className={loginStyles.label} htmlFor="c-ie-ind">
                Indicador IE (NF-e)
              </label>
              <select
                id="c-ie-ind"
                className={loginStyles.select}
                value={form.ie_indicator}
                onChange={(e) => setField("ie_indicator", e.target.value as FormState["ie_indicator"])}
                disabled={readOnly}
              >
                <option value="">—</option>
                <option value="1">1 — Contribuinte ICMS</option>
                <option value="2">2 — Isento</option>
                <option value="9">9 — Não contribuinte</option>
              </select>
            </div>
            <div>
              <label className={loginStyles.label} htmlFor="c-ie">
                Inscrição estadual
              </label>
              <input
                id="c-ie"
                className={loginStyles.input}
                value={form.state_registration}
                onChange={(e) => setField("state_registration", e.target.value)}
                placeholder="ou ISENTO"
                disabled={readOnly}
              />
            </div>
          </div>
          <label className={loginStyles.label} htmlFor="c-im">
            Inscrição municipal
          </label>
          <input
            id="c-im"
            className={loginStyles.input}
            value={form.municipal_registration}
            onChange={(e) => setField("municipal_registration", e.target.value)}
            disabled={readOnly}
          />
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Endereço</h2>
          <div className={styles.grid2}>
            <div>
              <label className={loginStyles.label} htmlFor="c-cep">
                CEP
              </label>
              <div className={styles.cepRow}>
                <input
                  id="c-cep"
                  className={`${loginStyles.input} ${styles.cepInputGrow}`}
                  value={form.address_postal_code}
                  onChange={(e) => setField("address_postal_code", formatCepInput(e.target.value))}
                  placeholder="00000-000"
                  autoComplete="postal-code"
                  maxLength={9}
                  disabled={readOnly}
                  aria-busy={cepLoading}
                />
                {canEdit ? (
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    disabled={readOnly || cepLoading || cepDigits.length !== 8}
                    onClick={() => void onBuscarCep()}
                  >
                    {cepLoading ? "Buscando…" : "Buscar CEP"}
                  </button>
                ) : null}
              </div>
              {cepLoading ? <p className={styles.cepHint}>Buscando endereço…</p> : null}
              {cepErr && !cepLoading ? <p className={styles.msgErr}>{cepErr}</p> : null}
              {!readOnly && !cepLoading && !cepErr ? (
                <p className={styles.cepHint}>
                  Ao buscar outro CEP, logradouro, bairro, cidade, UF e complemento são substituídos pelo retorno da API (se não houver complemento no Correios, o campo fica vazio). O número não vem do CEP e não é alterado. Salve para gravar no banco.
                </p>
              ) : null}
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className={loginStyles.label} htmlFor="c-street">
                Logradouro
              </label>
              <input
                id="c-street"
                className={loginStyles.input}
                value={form.address_street}
                onChange={(e) => setField("address_street", e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div>
              <label className={loginStyles.label} htmlFor="c-num">
                Número
              </label>
              <input
                id="c-num"
                className={loginStyles.input}
                value={form.address_number}
                onChange={(e) => setField("address_number", e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div>
              <label className={loginStyles.label} htmlFor="c-comp">
                Complemento
              </label>
              <input
                id="c-comp"
                className={loginStyles.input}
                value={form.address_complement}
                onChange={(e) => setField("address_complement", e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div>
              <label className={loginStyles.label} htmlFor="c-dist">
                Bairro
              </label>
              <input
                id="c-dist"
                className={loginStyles.input}
                value={form.address_district}
                onChange={(e) => setField("address_district", e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div>
              <label className={loginStyles.label} htmlFor="c-city">
                Cidade
              </label>
              <input
                id="c-city"
                className={loginStyles.input}
                value={form.address_city}
                onChange={(e) => setField("address_city", e.target.value)}
                disabled={readOnly}
              />
            </div>
            <div>
              <label className={loginStyles.label} htmlFor="c-uf">
                UF
              </label>
              <input
                id="c-uf"
                className={loginStyles.input}
                value={form.address_state}
                onChange={(e) => setField("address_state", e.target.value.toUpperCase())}
                maxLength={2}
                disabled={readOnly}
              />
            </div>
          </div>
        </div>

        {!isNew && Number.isFinite(idNum) && idNum >= 1 ? (
          <div className={styles.section}>
            <div className={styles.sectionHeaderRow}>
              <h2 className={styles.sectionTitle}>PMOC e laudos do cliente</h2>
              {canEdit ? (
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={documentSaving}
                  onClick={() => {
                    setShowClientPmocEditor(true);
                    setEquipmentDocumentForm(emptyEquipmentDocumentForm());
                  }}
                >
                  Novo documento
                </button>
              ) : null}
            </div>
            <p className={styles.lead} style={{ marginTop: 0 }}>
              Lista unificada dos documentos dos equipamentos deste cliente. Ao criar um novo registro, indique qual aparelho
              ele refere.
            </p>
            {showClientPmocEditor ? (
              <form className={styles.form} onSubmit={onSubmitClientPmocDocument}>
                <div className={styles.grid2}>
                  <div>
                    <label className={loginStyles.label}>Equipamento</label>
                    <select
                      className={loginStyles.select}
                      value={equipmentDocumentForm.target_equipment_id === "" ? "" : String(equipmentDocumentForm.target_equipment_id)}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEquipmentDocumentForm((prev) => ({
                          ...prev,
                          target_equipment_id: v === "" ? "" : Number(v),
                        }));
                      }}
                      required
                      disabled={documentSaving}
                    >
                      <option value="">Selecione…</option>
                      {clientEquipments.map((eq) => (
                        <option key={eq.id} value={eq.id}>
                          {eq.identificacao}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={loginStyles.label}>Tipo</label>
                    <select
                      className={loginStyles.select}
                      value={equipmentDocumentForm.document_type}
                      onChange={(e) =>
                        setEquipmentDocumentForm((prev) => ({
                          ...prev,
                          document_type: e.target.value as EquipmentDocumentFormState["document_type"],
                        }))
                      }
                      disabled={documentSaving}
                    >
                      <option value="pmoc">PMOC</option>
                      <option value="technical_report">Laudo técnico</option>
                      <option value="hygiene_report">Laudo de higienização</option>
                    </select>
                  </div>
                  <div>
                    <label className={loginStyles.label}>Status</label>
                    <select
                      className={loginStyles.select}
                      value={equipmentDocumentForm.status}
                      onChange={(e) =>
                        setEquipmentDocumentForm((prev) => ({
                          ...prev,
                          status: e.target.value as EquipmentDocumentFormState["status"],
                        }))
                      }
                      disabled={documentSaving}
                    >
                      <option value="draft">Rascunho</option>
                      <option value="issued">Emitido</option>
                      <option value="signed">Assinado</option>
                      <option value="expired">Vencido</option>
                      <option value="cancelled">Cancelado</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label className={loginStyles.label}>Título</label>
                    <input
                      className={loginStyles.input}
                      value={equipmentDocumentForm.title}
                      onChange={(e) => setEquipmentDocumentForm((prev) => ({ ...prev, title: e.target.value }))}
                      placeholder="Ex.: PMOC semestral"
                      required
                      disabled={documentSaving}
                    />
                  </div>
                  <div>
                    <label className={loginStyles.label}>Emitido em</label>
                    <input
                      className={loginStyles.input}
                      type="datetime-local"
                      value={equipmentDocumentForm.issued_at}
                      onChange={(e) => setEquipmentDocumentForm((prev) => ({ ...prev, issued_at: e.target.value }))}
                      disabled={documentSaving}
                    />
                  </div>
                  <div>
                    <label className={loginStyles.label}>Válido até</label>
                    <input
                      className={loginStyles.input}
                      type="date"
                      value={equipmentDocumentForm.valid_until}
                      onChange={(e) => setEquipmentDocumentForm((prev) => ({ ...prev, valid_until: e.target.value }))}
                      disabled={documentSaving}
                    />
                  </div>
                  <div>
                    <label className={loginStyles.label}>Próxima manutenção</label>
                    <input
                      className={loginStyles.input}
                      type="date"
                      value={equipmentDocumentForm.next_due_at}
                      onChange={(e) => setEquipmentDocumentForm((prev) => ({ ...prev, next_due_at: e.target.value }))}
                      disabled={documentSaving}
                    />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label className={loginStyles.label}>Observações</label>
                    <textarea
                      className={loginStyles.input}
                      rows={3}
                      value={equipmentDocumentForm.notes}
                      onChange={(e) => setEquipmentDocumentForm((prev) => ({ ...prev, notes: e.target.value }))}
                      disabled={documentSaving}
                    />
                  </div>
                </div>
                <div className={styles.actions}>
                  <button type="submit" className={styles.btnPrimary} disabled={documentSaving}>
                    {documentSaving ? "Salvando..." : "Criar documento"}
                  </button>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={() => setShowClientPmocEditor(false)}
                    disabled={documentSaving}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : null}
            <div className={styles.grid2} style={{ padding: "0.5rem 0" }}>
              <input
                className={loginStyles.input}
                placeholder="Buscar por título, observação ou número"
                value={pmocDocumentFilters.q}
                onChange={(e) => setPmocDocumentFilters((prev) => ({ ...prev, q: e.target.value }))}
              />
              <select
                className={loginStyles.select}
                value={pmocDocumentFilters.document_type}
                onChange={(e) =>
                  setPmocDocumentFilters((prev) => ({
                    ...prev,
                    document_type: e.target.value as EquipmentDocumentFilters["document_type"],
                  }))
                }
              >
                <option value="">Todos os tipos</option>
                <option value="pmoc">PMOC</option>
                <option value="technical_report">Laudo técnico</option>
                <option value="hygiene_report">Laudo de higienização</option>
              </select>
              <select
                className={loginStyles.select}
                value={pmocDocumentFilters.status}
                onChange={(e) =>
                  setPmocDocumentFilters((prev) => ({
                    ...prev,
                    status: e.target.value as EquipmentDocumentFilters["status"],
                  }))
                }
              >
                <option value="">Todos os status</option>
                <option value="draft">Rascunho</option>
                <option value="issued">Emitido</option>
                <option value="signed">Assinado</option>
                <option value="expired">Vencido</option>
                <option value="cancelled">Cancelado</option>
              </select>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={pmocDocumentFilters.only_overdue}
                  onChange={(e) => setPmocDocumentFilters((prev) => ({ ...prev, only_overdue: e.target.checked }))}
                />
                Apenas vencidos
              </label>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Equipamento</th>
                    <th>Tipo</th>
                    <th>Título</th>
                    <th>Status</th>
                    <th>Emitido em</th>
                    <th>Válido até</th>
                    <th>Próxima manutenção</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {clientPmocDocuments.map((doc) => (
                    <tr key={doc.id}>
                      <td>#{doc.document_number}</td>
                      <td>{doc.equipment_identificacao || "—"}</td>
                      <td>{doc.document_type}</td>
                      <td>{doc.title}</td>
                      <td>{doc.status}</td>
                      <td>{formatDateTime(doc.issued_at)}</td>
                      <td>
                        {doc.valid_until ? new Date(`${doc.valid_until}T00:00:00`).toLocaleDateString("pt-BR") : "-"}
                      </td>
                      <td>
                        {doc.next_due_at ? new Date(`${doc.next_due_at}T00:00:00`).toLocaleDateString("pt-BR") : "-"}
                      </td>
                      <td>
                        <Link className={styles.rowLink} to={`/app/equipments/${doc.equipment_id}/documents/${doc.id}`}>
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {clientPmocDocuments.length === 0 ? (
                    <tr>
                      <td colSpan={9}>Nenhum PMOC/laudo cadastrado para os equipamentos deste cliente.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {msg?.kind === "ok" ? <p className={styles.msgOk}>{msg.text}</p> : null}
        {msg?.kind === "err" ? <p className={styles.msgErr}>{msg.text}</p> : null}

        {canEdit ? (
          <div className={styles.actions}>
            <Link className={styles.btnBackLink} to="/app/clients">
              ← Voltar à lista
            </Link>
            <button type="submit" className={styles.btnPrimary} disabled={saving || deleting}>
              {saving ? "Salvando…" : isNew ? "Cadastrar" : "Salvar alterações"}
            </button>
            {canDelete && !isNew ? (
              <button
                type="button"
                className={styles.btnDanger}
                onClick={() => setShowDeleteModal(true)}
                disabled={saving || deleting}
              >
                {deleting ? "Excluindo…" : "Excluir cliente"}
              </button>
            ) : null}
          </div>
        ) : (
          <div className={styles.actions}>
            <Link className={styles.btnBackLink} to="/app/clients">
              ← Voltar à lista
            </Link>
            <p className={styles.readOnlyHint}>
              Você pode visualizar os dados. Para alterar, use um perfil de recepção ou administrador.
            </p>
          </div>
        )}
      </form>
      ) : activeTab === "equipments" ? (
        <section className={styles.section}>
          <div className={styles.sectionHeaderRow}>
            <h2 className={styles.sectionHeaderTitle}>Equipamento do cliente</h2>
            {canEdit ? (
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={equipmentSaving}
                onClick={() => {
                  setShowEquipmentEditor(true);
                  setSelectedEquipmentId(null);
                  setEquipmentHistory([]);
                  setEquipmentForm(emptyEquipmentForm());
                  setEditingEquipmentId(null);
                }}
              >
                Novo equipamento
              </button>
            ) : null}
          </div>
          {relatedErr ? <p className={styles.msgErr}>{relatedErr}</p> : null}
          {relatedLoading ? <p className={styles.loading}>Carregando equipamentos...</p> : null}
          {!relatedLoading ? (
            <>
              {canEdit && (showEquipmentEditor || selectedEquipmentId) ? (
                <div className={styles.actions}>
                  <button type="button" className={styles.btnSecondary} onClick={() => closeEquipmentPanel()}>
                    Fechar ficha e voltar para lista
                  </button>
                </div>
              ) : null}

              {!(showEquipmentEditor || selectedEquipmentId) ? (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Identificação</th>
                      <th>Tipo</th>
                      <th>Local</th>
                      <th>Modelo</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {clientEquipments.map((row) => (
                      <tr
                        key={row.id}
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          setSelectedEquipmentId(row.id);
                          startEditEquipment(row);
                        }}
                      >
                        <td>{row.identificacao}</td>
                        <td>{row.categoria_instalacao?.trim() || row.tipo.replaceAll("_", " ")}</td>
                        <td>{row.ambiente_nome?.trim() || row.local_instalacao?.trim() || "—"}</td>
                        <td>{row.modelo?.trim() || row.modelo_evaporadora?.trim() || "—"}</td>
                        <td>
                          <span className={`${styles.badge} ${row.ativo ? styles.badgeApproved : styles.badgeExpired}`}>
                            {row.ativo ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td>
                          {canEdit ? (
                            <div className={styles.actions}>
                              {row.ativo ? (
                                <button
                                  type="button"
                                  className={styles.btnDanger}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void onDeactivateEquipment(row.id);
                                  }}
                                  disabled={equipmentSaving}
                                >
                                  Inativar
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    {clientEquipments.length === 0 ? (
                      <tr>
                        <td colSpan={6}>Nenhum equipamento cadastrado.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              ) : (
              <div className={styles.equipmentOverlay}>
              {showEquipmentEditor ? (
                <form className={styles.form} onSubmit={onSubmitEquipment}>
                  <h3 className={styles.sectionTitle} style={{ marginTop: 0 }}>
                    {editingEquipmentId ? "Cadastro do equipamento" : "Novo equipamento"}
                  </h3>
                  <h4 className={styles.subSectionTitle}>1. Identificação geral</h4>
                  <div className={styles.grid2}>
                    <div>
                      <label className={loginStyles.label}>Tipo de equipamento</label>
                      <select
                        className={loginStyles.select}
                        value={equipmentForm.categoria_instalacao}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, categoria_instalacao: e.target.value }))}
                        disabled={readOnly || equipmentSaving}
                      >
                        <option value="">—</option>
                        {["Split", "Cassete", "Piso-Teto", "Window", "Self", "FanCoil", "Chiller"].map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={loginStyles.label}>Família</label>
                      <select
                        className={loginStyles.select}
                        value={equipmentForm.tipo}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, tipo: e.target.value as "AR_CONDICIONADO" }))}
                        disabled={readOnly || equipmentSaving}
                      >
                        <option value="AR_CONDICIONADO">Ar-condicionado</option>
                      </select>
                    </div>
                    <div>
                      <label className={loginStyles.label}>Identificação / TAG</label>
                      <input
                        className={loginStyles.input}
                        value={equipmentForm.identificacao}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, identificacao: e.target.value }))}
                        placeholder='Ex.: AC-01'
                        required
                        disabled={readOnly || equipmentSaving}
                      />
                    </div>
                    <div>
                      <label className={loginStyles.label}>Fabricante</label>
                      <input
                        className={loginStyles.input}
                        value={equipmentForm.fabricante}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, fabricante: e.target.value }))}
                        placeholder="Ex.: Samsung"
                        disabled={readOnly || equipmentSaving}
                      />
                    </div>
                    <div>
                      <label className={loginStyles.label}>Modelo (resumo / legado)</label>
                      <input
                        className={loginStyles.input}
                        value={equipmentForm.modelo}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, modelo: e.target.value }))}
                        disabled={readOnly || equipmentSaving}
                      />
                    </div>
                    <div>
                      <label className={loginStyles.label}>Modelo evaporadora</label>
                      <input
                        className={loginStyles.input}
                        value={equipmentForm.modelo_evaporadora}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, modelo_evaporadora: e.target.value }))}
                        disabled={readOnly || equipmentSaving}
                      />
                    </div>
                    <div>
                      <label className={loginStyles.label}>Modelo condensadora</label>
                      <input
                        className={loginStyles.input}
                        value={equipmentForm.modelo_condensadora}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, modelo_condensadora: e.target.value }))}
                        disabled={readOnly || equipmentSaving}
                      />
                    </div>
                    <div>
                      <label className={loginStyles.label}>Capacidade (BTU)</label>
                      <input
                        className={loginStyles.input}
                        type="number"
                        min={1}
                        value={equipmentForm.capacidade_btu}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, capacidade_btu: e.target.value }))}
                        disabled={readOnly || equipmentSaving}
                      />
                    </div>
                    <div>
                      <label className={loginStyles.label}>Capacidade (TR)</label>
                      <input
                        className={loginStyles.input}
                        inputMode="decimal"
                        value={equipmentForm.capacidade_tr}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, capacidade_tr: e.target.value }))}
                        placeholder="Ex.: 5"
                        disabled={readOnly || equipmentSaving}
                      />
                    </div>
                    <div>
                      <label className={loginStyles.label}>Número de série</label>
                      <input
                        className={loginStyles.input}
                        value={equipmentForm.serial}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, serial: e.target.value }))}
                        disabled={readOnly || equipmentSaving}
                      />
                    </div>
                  </div>
                  <h4 className={styles.subSectionTitle}>2. Localização e abrangência</h4>
                  <div className={styles.grid2}>
                    <div>
                      <label className={loginStyles.label}>Nome do ambiente</label>
                      <input
                        className={loginStyles.input}
                        value={equipmentForm.ambiente_nome}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, ambiente_nome: e.target.value }))}
                        placeholder="Ex.: Sala de reuniões"
                        disabled={readOnly || equipmentSaving}
                      />
                    </div>
                    <div>
                      <label className={loginStyles.label}>Tipo de ambiente</label>
                      <input
                        className={loginStyles.input}
                        value={equipmentForm.ambiente_tipo}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, ambiente_tipo: e.target.value }))}
                        placeholder="Ex.: Escritório"
                        disabled={readOnly || equipmentSaving}
                      />
                    </div>
                    <div>
                      <label className={loginStyles.label}>Local de instalação (livre)</label>
                      <input
                        className={loginStyles.input}
                        value={equipmentForm.local_instalacao}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, local_instalacao: e.target.value }))}
                        disabled={readOnly || equipmentSaving}
                      />
                    </div>
                    <div>
                      <label className={loginStyles.label}>
                        Área climatizada (m<sup>2</sup>)
                      </label>
                      <input
                        className={loginStyles.input}
                        inputMode="decimal"
                        value={equipmentForm.area_m2}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, area_m2: e.target.value }))}
                        disabled={readOnly || equipmentSaving}
                      />
                    </div>
                    <div>
                      <label className={loginStyles.label}>Ocupação fixa (pessoas)</label>
                      <input
                        className={loginStyles.input}
                        type="number"
                        min={0}
                        value={equipmentForm.ocupacao_fixa}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, ocupacao_fixa: e.target.value }))}
                        disabled={readOnly || equipmentSaving}
                      />
                    </div>
                    <div>
                      <label className={loginStyles.label}>Ocupação flutuante (média)</label>
                      <input
                        className={loginStyles.input}
                        type="number"
                        min={0}
                        value={equipmentForm.ocupacao_flutuante}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, ocupacao_flutuante: e.target.value }))}
                        disabled={readOnly || equipmentSaving}
                      />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label className={loginStyles.label}>Carga térmica total</label>
                      <input
                        className={loginStyles.input}
                        value={equipmentForm.carga_termica_total}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, carga_termica_total: e.target.value }))}
                        placeholder="Soma de eletrônicos, pessoas, etc."
                        disabled={readOnly || equipmentSaving}
                      />
                    </div>
                  </div>
                  <h4 className={styles.subSectionTitle}>3. Especificações técnicas</h4>
                  <div className={styles.grid2}>
                    <div>
                      <label className={loginStyles.label}>Fluido refrigerante</label>
                      <input
                        className={loginStyles.input}
                        value={equipmentForm.tipo_gas}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, tipo_gas: e.target.value }))}
                        placeholder="Ex.: R-410A"
                        disabled={readOnly || equipmentSaving}
                      />
                    </div>
                    <div>
                      <label className={loginStyles.label}>Massa de gás (kg)</label>
                      <input
                        className={loginStyles.input}
                        inputMode="decimal"
                        value={equipmentForm.massa_gas_kg}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, massa_gas_kg: e.target.value }))}
                        disabled={readOnly || equipmentSaving}
                      />
                    </div>
                    <div>
                      <label className={loginStyles.label}>Tensão / voltagem</label>
                      <input
                        className={loginStyles.input}
                        value={equipmentForm.voltagem}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, voltagem: e.target.value }))}
                        placeholder="Ex.: 220V ou 380V"
                        disabled={readOnly || equipmentSaving}
                      />
                    </div>
                    <div>
                      <label className={loginStyles.label}>Corrente nominal (A)</label>
                      <input
                        className={loginStyles.input}
                        inputMode="decimal"
                        value={equipmentForm.corrente_nominal_a}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, corrente_nominal_a: e.target.value }))}
                        disabled={readOnly || equipmentSaving}
                      />
                    </div>
                    <div>
                      <label className={loginStyles.label}>Tecnologia</label>
                      <select
                        className={loginStyles.select}
                        value={equipmentForm.tecnologia_ciclo}
                        onChange={(e) =>
                          setEquipmentForm((prev) => ({
                            ...prev,
                            tecnologia_ciclo: e.target.value as "" | "on_off" | "inverter",
                          }))
                        }
                        disabled={readOnly || equipmentSaving}
                      >
                        <option value="">Não informado</option>
                        <option value="on_off">On/Off</option>
                        <option value="inverter">Inverter</option>
                      </select>
                    </div>
                  </div>
                  <h4 className={styles.subSectionTitle}>4. Filtros e qualidade do ar</h4>
                  <div className={styles.grid2}>
                    <div>
                      <label className={loginStyles.label}>Tipo de filtro</label>
                      <input
                        className={loginStyles.input}
                        value={equipmentForm.filtro_tipo}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, filtro_tipo: e.target.value }))}
                        placeholder="Nylon, Hepa, G4…"
                        disabled={readOnly || equipmentSaving}
                      />
                    </div>
                    <div>
                      <label className={loginStyles.label}>Quantidade de filtros</label>
                      <input
                        className={loginStyles.input}
                        type="number"
                        min={0}
                        value={equipmentForm.filtro_quantidade}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, filtro_quantidade: e.target.value }))}
                        disabled={readOnly || equipmentSaving}
                      />
                    </div>
                    <div>
                      <label className={loginStyles.label}>Dimensões (L × A × E)</label>
                      <input
                        className={loginStyles.input}
                        value={equipmentForm.filtro_dimensoes}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, filtro_dimensoes: e.target.value }))}
                        placeholder="cm"
                        disabled={readOnly || equipmentSaving}
                      />
                    </div>
                    <div>
                      <label className={loginStyles.label}>Periodicidade de limpeza</label>
                      <input
                        className={loginStyles.input}
                        value={equipmentForm.filtro_periodicidade_limpeza}
                        onChange={(e) => setEquipmentForm((prev) => ({ ...prev, filtro_periodicidade_limpeza: e.target.value }))}
                        placeholder="Ex.: Mensal"
                        disabled={readOnly || equipmentSaving}
                      />
                    </div>
                  </div>
                  {canEdit ? (
                    <div className={styles.actions}>
                      <button type="submit" className={styles.btnPrimary} disabled={equipmentSaving}>
                        {equipmentSaving ? "Salvando..." : editingEquipmentId ? "Salvar equipamento" : "Adicionar equipamento"}
                      </button>
                      <button
                        type="button"
                        className={styles.btnSecondary}
                        onClick={() => closeEquipmentPanel()}
                        disabled={equipmentSaving}
                      >
                        Fechar
                      </button>
                    </div>
                  ) : null}
                </form>
              ) : null}

              {selectedEquipmentId ? (
                <>
                  {(() => {
                    const eq = clientEquipments.find((e) => e.id === selectedEquipmentId);
                    if (!eq?.public_token) return null;
                    const publicUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/p/e/${eq.public_token}`;
                    return (
                      <div className={styles.subPanel} style={{ marginTop: "1rem" }}>
                        <h3 className={styles.sectionTitle}>Ficha pública e QR</h3>
                        <p className={styles.lead} style={{ margin: "0 0 0.5rem" }}>
                          Imprima e cole no aparelho. O link mostra somente o histórico de serviços deste equipamento
                          (sem dados pessoais do cliente).
                        </p>
                        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-start" }}>
                          <img
                            alt="QR code ficha pública"
                            width={160}
                            height={160}
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(publicUrl)}`}
                          />
                          <div style={{ flex: 1, minWidth: "12rem" }}>
                            <label className={loginStyles.label}>URL pública</label>
                            <input
                              className={loginStyles.input}
                              readOnly
                              value={publicUrl}
                              onFocus={(e) => e.target.select()}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  <h3 className={styles.sectionTitle} style={{ marginTop: "1rem" }}>
                    Histórico do equipamento
                  </h3>
                  <p className={styles.lead} style={{ margin: "0 0 0.5rem" }}>
                    Vínculos de serviços da OS com este equipamento e ordens concluídas que incluíram o equipamento.
                  </p>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Quando</th>
                          <th>Origem</th>
                          <th>OS</th>
                          <th>Serviço</th>
                          <th>Responsável</th>
                        </tr>
                      </thead>
                      <tbody>
                        {equipmentHistory.map((row) => (
                          <tr key={`${row.service_item_id}-${row.changed_at}`}>
                            <td>{formatDateTime(row.changed_at)}</td>
                            <td>{formatEquipmentHistorySource(row.source)}</td>
                            <td>
                              <Link className={styles.rowLink} to={`/app/service-orders/${row.service_order_id}`}>
                                #{row.service_order_id}
                              </Link>
                            </td>
                            <td>{row.service_name ?? "-"}</td>
                            <td>{row.changed_by_user_name ?? "-"}</td>
                          </tr>
                        ))}
                        {equipmentHistory.length === 0 ? (
                          <tr>
                            <td colSpan={5}>Sem histórico para este equipamento.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
              </div>
              )}

              {(selectedEquipmentId || showEquipmentEditor) && (
                <>
                  <h3 className={styles.sectionTitle} style={{ marginTop: "1rem" }}>
                    OS do cliente sem equipamento vinculado
                  </h3>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>OS</th>
                          <th>Serviço</th>
                          <th>Status</th>
                          <th>Vincular equipamento</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientServiceLinks.map((row) => (
                          <tr key={row.service_item_id}>
                            <td>#{row.service_order_id}</td>
                            <td>{row.service_name}</td>
                            <td>{row.order_status}</td>
                            <td>
                              <select
                                className={loginStyles.select}
                                value={row.equipment_id ?? ""}
                                disabled={!canEdit || linkSavingServiceItemId === row.service_item_id}
                                onChange={(e) =>
                                  void onLinkServiceItemToEquipment(
                                    row.service_item_id,
                                    e.target.value ? Number(e.target.value) : null,
                                  )
                                }
                              >
                                <option value="">Sem equipamento</option>
                                {clientEquipments.filter((item) => item.ativo).map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.identificacao}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                        {clientServiceLinks.length === 0 ? (
                          <tr>
                            <td colSpan={4}>Nenhuma OS pendente de vínculo de equipamento.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          ) : null}
        </section>
      ) : (
        <section className={styles.section}>
          {relatedErr ? <p className={styles.msgErr}>{relatedErr}</p> : null}
          {relatedLoading ? <p className={styles.loading}>Carregando dados do cliente...</p> : null}

          {!relatedLoading && !relatedErr && activeTab === "budgets" ? (
            <>
              <div className={styles.sectionHeaderRow}>
                <h2 className={styles.sectionHeaderTitle}>Orçamentos</h2>
                {canEdit ? (
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => navigate(`/app/budgets/new?client_id=${idNum}`)}
                  >
                    Criar Orçamento
                  </button>
                ) : null}
              </div>
              {clientBudgets.length === 0 ? (
                <p className={styles.loading}>Nenhum orçamento encontrado para este cliente.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Orçamento</th>
                        <th>Status</th>
                        <th>Criado em</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {clientBudgets.map((row) => (
                        <tr key={row.id}>
                          <td>#{row.id}</td>
                          <td>
                            <span className={`${styles.badge} ${budgetStatusClass(row.status)}`}>{budgetStatusLabel(row.status)}</span>
                          </td>
                          <td>{formatDateTime(row.created_at)}</td>
                          <td>
                            <Link className={styles.rowLink} to={`/app/budgets/${row.id}`}>
                              Abrir
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}

          {!relatedLoading && !relatedErr && activeTab === "orders" ? (
            <>
              <div className={styles.sectionHeaderRow}>
                <h2 className={styles.sectionHeaderTitle}>Ordem de Serviço</h2>
                {canEdit ? (
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => navigate(`/app/service-orders/new?client_id=${idNum}`)}
                  >
                    Criar OS
                  </button>
                ) : null}
              </div>
              {clientOrders.length === 0 ? (
                <p className={styles.loading}>Nenhuma OS encontrada para este cliente.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>OS</th>
                        <th>Titulo</th>
                        <th>Status</th>
                        <th>Agendamento</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {clientOrders.map((row) => (
                        <tr key={row.id}>
                          <td>#{row.id}</td>
                          <td>{row.title}</td>
                          <td>
                            <span className={`${styles.badge} ${serviceOrderStatusClass(row.status)}`}>
                              {serviceOrderStatusLabel(row.status)}
                            </span>
                          </td>
                          <td>{formatDateTime(row.schedule?.starts_at)}</td>
                          <td>
                            <Link className={styles.rowLink} to={`/app/service-orders/${row.id}`}>
                              Abrir
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </section>
      )}
      {!isNew && activeTab !== "form" ? (
        <div className={styles.actions}>
          <Link className={styles.btnBackLink} to="/app/clients">
            ← Voltar à lista
          </Link>
          {canEdit ? (
            <button type="button" className={styles.btnPrimary} onClick={() => setActiveTab("form")}>
              Salvar alterações
            </button>
          ) : null}
          {canDelete ? (
            <button type="button" className={styles.btnDanger} onClick={() => setShowDeleteModal(true)} disabled={deleting}>
              {deleting ? "Excluindo…" : "Excluir cliente"}
            </button>
          ) : null}
        </div>
      ) : null}
      {showDeleteModal ? (
        <div className={styles.modalRoot} role="presentation">
          <button type="button" className={styles.modalBackdrop} aria-label="Fechar" onClick={() => setShowDeleteModal(false)} />
          <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="delete-client-title">
            <h3 id="delete-client-title" className={styles.modalTitle}>
              Excluir cliente
            </h3>
            <p className={styles.modalText}>
              Esta ação exclui o cliente permanentemente. Deseja continuar?
            </p>
            <div className={styles.modalActions}>
              <button type="button" className={styles.btnDanger} onClick={() => void onDelete()} disabled={deleting}>
                {deleting ? "Excluindo…" : "Confirmar exclusão"}
              </button>
              <button type="button" className={styles.btnSecondary} onClick={() => setShowDeleteModal(false)} disabled={deleting}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
