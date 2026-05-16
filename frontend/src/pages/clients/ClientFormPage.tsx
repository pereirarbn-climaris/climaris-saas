import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Link,
  Navigate,
  useMatch,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  createClient,
  deactivateClientEquipment,
  deleteClient,
  getClient,
  listClientAudit,
  listClientEquipments,
  updateClient,
  type EquipmentOut,
} from "../../api/clients";
import { fetchCepLookup } from "../../api/cep";
import { fetchCnpjCommercial, fetchCnpjOpen } from "../../api/cnpj";
import { listBudgets } from "../../api/budgets";
import { listPmocPlans } from "../../api/pmoc";
import { listServiceOrders } from "../../api/serviceOrders";
import {
  ClientFormView,
  type Budget,
  type ClientData,
  type Equipment,
  type ServiceOrder,
  type TabId,
} from "../../components/v0-ui/clients";
import { digitsOnly, formatCepInput } from "../../lib/brMask";
import {
  clientHasPersistedAddressFromView,
  clientOutToViewData,
  emptyViewData,
  mapAuditToHistory,
  mapBudgetsToView,
  mapEquipmentsToView,
  mapOrdersToView,
  mapPmocPlansToView,
  mergeCnpjLookupToViewData,
  mergeViewData,
  viewDataToCreatePayload,
  viewDataToUpdatePayload,
} from "../../lib/clientFormViewAdapter";
import type { DashboardOutletContext } from "../dashboardContext";
import styles from "./ClientFormPage.module.css";

export function ClientFormPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isNew = useMatch({ path: "/app/clients/new", end: true }) != null;
  const { clientId } = useParams<{ clientId: string }>();
  const idNum = clientId ? Number(clientId) : NaN;

  const canEdit = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";
  const canDelete = ctx?.user.role === "admin";
  const readOnly = !canEdit;

  const [clientData, setClientData] = useState<ClientData>(emptyViewData);
  const [isLoading, setIsLoading] = useState(!isNew);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepErr, setCepErr] = useState("");
  const [cnpjLookupLoading, setCnpjLookupLoading] = useState(false);
  const [cnpjCommercialLoading, setCnpjCommercialLoading] = useState(false);
  const [cnpjLookupErr, setCnpjLookupErr] = useState("");
  const [cnpjIncludeAddress, setCnpjIncludeAddress] = useState(true);
  const [addressPersisted, setAddressPersisted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("cadastro");
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [history, setHistory] = useState<ReturnType<typeof mapAuditToHistory>>([]);
  const [pmocData, setPmocData] = useState<ReturnType<typeof mapPmocPlansToView>>(undefined);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedErr, setRelatedErr] = useState("");

  const docDigits = useMemo(() => digitsOnly(clientData.documento).slice(0, 14), [clientData.documento]);
  const cepDigits = useMemo(
    () => digitsOnly(clientData.endereco?.cep ?? "").slice(0, 8),
    [clientData.endereco?.cep],
  );

  const showPmocTab = !isNew && clientData.type === "pj";
  const canConsultCnpjCommercial = ctx?.user.role === "admin";
  const fiscalFieldsLocked =
    !readOnly && clientData.type === "pj" && Boolean(clientData.isVerifiedCnpj);

  useEffect(() => {
    if (clientData.type !== "pj" && activeTab === "pmoc") {
      setActiveTab("cadastro");
    }
  }, [clientData.type, activeTab]);

  useEffect(() => {
    if (isNew) {
      setClientData(emptyViewData());
      setAddressPersisted(false);
      setIsLoading(false);
      return;
    }
    if (!clientId || !Number.isFinite(idNum) || idNum < 1) return;

    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const c = await getClient(idNum);
        if (!cancelled) {
          const view = clientOutToViewData(c);
          setClientData(view);
          setAddressPersisted(clientHasPersistedAddressFromView(view));
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erro ao carregar cliente.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
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
    if (isNew || !Number.isFinite(idNum) || idNum < 1 || isLoading) return;
    const tab = searchParams.get("tab");
    if (tab === "pmoc" && showPmocTab) {
      setActiveTab("pmoc");
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("tab");
        return next;
      },
      { replace: true },
    );
  }, [isNew, idNum, isLoading, searchParams, showPmocTab, setSearchParams]);

  useEffect(() => {
    if (isNew || !Number.isFinite(idNum) || idNum < 1) return;

    let cancelled = false;
    void (async () => {
      setRelatedLoading(true);
      setRelatedErr("");
      try {
        const [equipmentRows, budgetRows, orderRows] = await Promise.all([
          listClientEquipments(idNum),
          listBudgets({ limit: 100 }),
          listServiceOrders({ limit: 100 }),
        ]);
        if (cancelled) return;
        setEquipments(mapEquipmentsToView(equipmentRows));
        setBudgets(mapBudgetsToView(budgetRows.filter((b) => b.client_id === idNum)));
        setOrders(mapOrdersToView(orderRows.filter((o) => o.client_id === idNum)));
      } catch (e) {
        if (!cancelled) {
          setRelatedErr(e instanceof Error ? e.message : "Não foi possível carregar dados relacionados.");
        }
      } finally {
        if (!cancelled) setRelatedLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, idNum]);

  useEffect(() => {
    if (isNew || !Number.isFinite(idNum) || idNum < 1 || activeTab !== "historico") {
      setHistory([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listClientAudit(idNum);
        if (!cancelled) setHistory(mapAuditToHistory(rows));
      } catch {
        if (!cancelled) setHistory([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, idNum, isNew]);

  useEffect(() => {
    if (
      isNew ||
      !Number.isFinite(idNum) ||
      idNum < 1 ||
      activeTab !== "pmoc" ||
      clientData.type !== "pj"
    ) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const plans = await listPmocPlans({ client_id: idNum, limit: 100 });
        if (!cancelled) setPmocData(mapPmocPlansToView(plans));
      } catch {
        if (!cancelled) setPmocData({ status: "sem_contrato" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, idNum, isNew, clientData.type]);

  const handleClientChange = useCallback((patch: Partial<ClientData>) => {
    setClientData((prev) => mergeViewData(prev, patch));
  }, []);

  const onBuscarCep = useCallback(async () => {
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
      setClientData((prev) => {
        const cur = digitsOnly(prev.endereco?.cep ?? "").slice(0, 8);
        if (cur !== cepDigits) return prev;
        const uf = (data.address_state ?? "").trim();
        const ibgeFromCep = digitsOnly(data.address_ibge_code ?? "").slice(0, 7);
        return mergeViewData(prev, {
          endereco: {
            logradouro: (data.address_street ?? "").trim(),
            complemento: (data.address_complement ?? "").trim(),
            bairro: (data.address_district ?? "").trim(),
            cidade: (data.address_city ?? "").trim(),
            estado: uf ? uf.toUpperCase().slice(0, 2) : "",
            cep: data.address_postal_code
              ? formatCepInput(data.address_postal_code)
              : formatCepInput(cepDigits),
          },
          addressIbgeCode: ibgeFromCep.length === 7 ? ibgeFromCep : prev.addressIbgeCode,
        });
      });
      setMsg({
        kind: "ok",
        text: "Endereço preenchido pela consulta de CEP. Clique em Salvar para gravar.",
      });
    } catch (e) {
      setCepErr(e instanceof Error ? e.message : "Não foi possível buscar o CEP.");
    } finally {
      setCepLoading(false);
    }
  }, [cepDigits, readOnly]);

  const applyCnpjLookupResult = useCallback(
    (lu: Awaited<ReturnType<typeof fetchCnpjOpen>>, source: "open" | "commercial") => {
      setClientData((prev) => {
        const cur = digitsOnly(prev.documento).slice(0, 14);
        if (cur !== docDigits) return prev;
        return mergeCnpjLookupToViewData(prev, lu, cnpjIncludeAddress);
      });
      const sourceLabel = source === "open" ? "consulta rápida (CNPJA Open)" : "validação fiscal (CNPJA Comercial)";
      setMsg({
        kind: "ok",
        text: cnpjIncludeAddress
          ? `Dados aplicados via ${sourceLabel}. CNPJ, razão social e tipo ficam protegidos após salvar.`
          : `Razão social e nome fantasia atualizados via ${sourceLabel}. Clique em Salvar para gravar.`,
      });
    },
    [cnpjIncludeAddress, docDigits],
  );

  const onConsultCNPJ = useCallback(
    async (_cnpj: string) => {
      if (readOnly || clientData.type !== "pj" || docDigits.length !== 14) {
        setCnpjLookupErr("Informe um CNPJ válido com 14 dígitos.");
        return;
      }
      setCnpjLookupLoading(true);
      setCnpjLookupErr("");
      setMsg(null);
      try {
        const lu = await fetchCnpjOpen(docDigits);
        applyCnpjLookupResult(lu, "open");
      } catch (e) {
        setCnpjLookupErr(e instanceof Error ? e.message : "Não foi possível consultar o CNPJ.");
      } finally {
        setCnpjLookupLoading(false);
      }
    },
    [applyCnpjLookupResult, clientData.type, docDigits, readOnly],
  );

  const onConsultCNPJCommercial = useCallback(
    async (_cnpj: string) => {
      if (readOnly || !canConsultCnpjCommercial || clientData.type !== "pj" || docDigits.length !== 14) {
        setCnpjLookupErr("Informe um CNPJ válido com 14 dígitos.");
        return;
      }
      setCnpjCommercialLoading(true);
      setCnpjLookupErr("");
      setMsg(null);
      try {
        const lu = await fetchCnpjCommercial(docDigits, true);
        applyCnpjLookupResult(lu, "commercial");
      } catch (e) {
        setCnpjLookupErr(
          e instanceof Error ? e.message : "Consulta comercial indisponível. Verifique CNPJA_API_KEY no servidor.",
        );
      } finally {
        setCnpjCommercialLoading(false);
      }
    },
    [applyCnpjLookupResult, canConsultCnpjCommercial, clientData.type, docDigits, readOnly],
  );

  const reloadEquipments = useCallback(async () => {
    if (!Number.isFinite(idNum) || idNum < 1) return;
    const rows = await listClientEquipments(idNum);
    setEquipments(mapEquipmentsToView(rows));
  }, [idNum]);

  const onEquipmentAction = useCallback(
    async (action: "view" | "edit" | "delete", equipment: Equipment) => {
      const eqId = Number(equipment.id);
      if (!Number.isFinite(eqId) || eqId < 1) return;

      if (action === "view" || action === "edit") {
        const row = (await listClientEquipments(idNum)).find((e) => e.id === eqId) as EquipmentOut | undefined;
        if (row?.public_token) {
          window.open(`${window.location.origin}/p/e/${row.public_token}`, "_blank", "noopener,noreferrer");
        } else {
          setMsg({ kind: "err", text: "Ficha pública do equipamento indisponível." });
        }
        return;
      }

      if (!canEdit || readOnly) return;
      if (!window.confirm(`Inativar o equipamento ${equipment.marca} ${equipment.modelo}?`)) return;
      try {
        await deactivateClientEquipment(idNum, eqId);
        await reloadEquipments();
        setMsg({ kind: "ok", text: "Equipamento inativado." });
      } catch (e) {
        setMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao inativar equipamento." });
      }
    },
    [canEdit, idNum, readOnly, reloadEquipments],
  );

  const onOrderAction = useCallback(
    (action: "view" | "edit", order: ServiceOrder) => {
      const path = `/app/service-orders/${order.id}`;
      if (action === "edit" && canEdit) navigate(path);
      else navigate(path);
    },
    [canEdit, navigate],
  );

  const onBudgetAction = useCallback(
    (action: "view" | "edit" | "send", budget: Budget) => {
      void action;
      navigate(`/app/budgets/${budget.id}`);
    },
    [navigate],
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (readOnly) return;

    const digits = digitsOnly(clientData.documento);
    if (digits && digits.length !== 11 && digits.length !== 14) {
      setMsg({ kind: "err", text: "Documento deve ser CPF (11 dígitos) ou CNPJ (14 dígitos)." });
      return;
    }

    setSaving(true);
    try {
      if (isNew) {
        const created = await createClient(viewDataToCreatePayload(clientData));
        navigate(`/app/clients/${created.id}`, { replace: true });
      } else {
        const updated = await updateClient(idNum, viewDataToUpdatePayload(clientData));
        const view = clientOutToViewData(updated);
        setClientData(view);
        setAddressPersisted(clientHasPersistedAddressFromView(view));
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

  if (!ctx) {
    return <Navigate to="/login" replace />;
  }

  if (isNew && !canEdit) {
    return <Navigate to="/app/clients" replace />;
  }

  if (!isNew && (!clientId || !Number.isFinite(idNum) || idNum < 1)) {
    return <Navigate to="/app/clients" replace />;
  }

  if (!isNew && isLoading) {
    return (
      <div className={styles.wrap}>
        <p className={styles.loading}>Carregando cliente…</p>
      </div>
    );
  }

  if (!isNew && error) {
    return (
      <div className={styles.wrap}>
        <Link className={styles.btnBackLink} to="/app/clients">
          ← Voltar à lista
        </Link>
        <p className={styles.msgErr}>{error}</p>
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
              Cadastro completo para faturamento e operação (CPF/CNPJ, fiscal, endereço e histórico comercial).
            </p>
          </div>
        </div>
      </header>

      {relatedLoading && !isNew ? <p className={styles.loading}>Carregando equipamentos, OS e orçamentos…</p> : null}
      {relatedErr ? <p className={styles.msgErr}>{relatedErr}</p> : null}
      {cepErr ? <p className={styles.msgErr}>{cepErr}</p> : null}
      {cnpjLookupErr ? <p className={styles.msgErr}>{cnpjLookupErr}</p> : null}

      {!isNew && clientData.type === "pj" && addressPersisted && canEdit ? (
        <p className={styles.cepHint}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={cnpjIncludeAddress}
              onChange={(e) => setCnpjIncludeAddress(e.target.checked)}
            />
            Ao consultar CNPJ, atualizar também o endereço da Receita
          </label>
        </p>
      ) : null}

      <form className={styles.form} onSubmit={onSubmit}>
        <ClientFormView
          client={clientData}
          equipments={isNew ? [] : equipments}
          history={history}
          orders={isNew ? [] : orders}
          budgets={isNew ? [] : budgets}
          pmocData={showPmocTab ? pmocData : { status: "sem_contrato" }}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onClientChange={handleClientChange}
          onConsultCNPJ={onConsultCNPJ}
          onConsultCNPJCommercial={canConsultCnpjCommercial ? onConsultCNPJCommercial : undefined}
          onBuscarCep={() => void onBuscarCep()}
          loadingCNPJ={cnpjLookupLoading}
          loadingCNPJCommercial={cnpjCommercialLoading}
          fiscalFieldsLocked={fiscalFieldsLocked}
          cepLoading={cepLoading}
          readOnly={readOnly}
          onEquipmentAction={(action, eq) => void onEquipmentAction(action, eq)}
          onOrderAction={onOrderAction}
          onBudgetAction={onBudgetAction}
        />

        {msg?.kind === "ok" ? <p className={styles.msgOk}>{msg.text}</p> : null}
        {msg?.kind === "err" ? <p className={styles.msgErr}>{msg.text}</p> : null}

        <div className={styles.actions}>
          <Link className={styles.btnBackLink} to="/app/clients">
            ← Voltar à lista
          </Link>
          {canEdit ? (
            <button type="submit" className={styles.btnPrimary} disabled={saving || deleting}>
              {saving ? "Salvando…" : isNew ? "Cadastrar" : "Salvar alterações"}
            </button>
          ) : (
            <p className={styles.readOnlyHint}>
              Você pode visualizar os dados. Para alterar, use um perfil de recepção ou administrador.
            </p>
          )}
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
      </form>

      {showDeleteModal ? (
        <div className={styles.modalRoot} role="presentation">
          <button type="button" className={styles.modalBackdrop} aria-label="Fechar" onClick={() => setShowDeleteModal(false)} />
          <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="delete-client-title">
            <h3 id="delete-client-title" className={styles.modalTitle}>
              Excluir cliente
            </h3>
            <p className={styles.modalText}>
              Prefira desmarcar &quot;Cadastro ativo&quot; para inativar. A exclusão permanente só deve ser usada quando não
              houver ordens, orçamentos ou NFS-e vinculados.
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
