import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { Building2, Calendar, ClipboardList, Shield, Snowflake, User } from "lucide-react";
import { PmocCreateStatusBanner, type PmocCreateTab } from "../../components/pmoc/PmocCreateStatusBanner";
import { PmocPlanningTab } from "../../components/pmoc/PmocPlanningTab";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { ClientCombobox, type ClientComboboxItem } from "../../components/ui/client-combobox";
import {
  listClientSites,
  listClientsAll,
  type ClientOut,
  type ClientSiteOut,
} from "../../api/clients";
import { loadPmocEquipmentsForSite, type PmocEquipmentOption } from "../../lib/pmocEquipmentLoader";
import { activatePmocPlan, createPmocFull, type PmocFrequency } from "../../api/pmoc";
import { listServices, type ServiceOut } from "../../api/services";
import {
  parsePmocCreateApiErrors,
  validatePmocCreateDraft,
  type PmocCreateValidationIssue,
} from "../../lib/pmocCreateValidation";
import { toast } from "../../lib/toast";
import type { DashboardOutletContext } from "../dashboardContext";
import formLayout from "../formLayout.module.css";
import loginStyles from "../LoginPage.module.css";
import pmocStyles from "./PmocPages.module.css";
import createStyles from "./PmocCreatePage.module.css";

const FREQ_OPTIONS: { value: PmocFrequency; label: string }[] = [
  { value: "monthly", label: "Mensal" },
  { value: "quarterly", label: "Trimestral" },
  { value: "semiannual", label: "Semestral" },
  { value: "annual", label: "Anual" },
  { value: "custom", label: "Personalizado" },
];

type CreateActivityRow = {
  id: string;
  serviceId: number;
  serviceName: string;
  frequency: PmocFrequency;
  frequencyLabel: string;
  equipmentId: number | null;
  equipmentLabel: string | null;
};

function clientsToComboboxItems(clients: ClientOut[]): ClientComboboxItem[] {
  return clients.map((c) => ({
    id: String(c.id),
    nome: c.name,
    nomeFantasia: c.trade_name ?? undefined,
    documento: c.document ?? "—",
  }));
}

function siteLabel(site: ClientSiteOut): string {
  const parts = [site.name, site.city, site.state].filter(Boolean);
  return parts.join(" · ");
}

function formatBtu(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M BTU`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",")}k BTU`;
  return `${n} BTU`;
}

function FormCard({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className={createStyles.cardHeaderRow}>
          <div className={createStyles.cardIcon} aria-hidden>
            {icon}
          </div>
          <div className={createStyles.cardHeaderText}>
            <CardTitle>{title}</CardTitle>
            {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function PmocNewPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const fromClientId = useMemo(() => {
    const raw = searchParams.get("from_client");
    if (!raw) return NaN;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? n : NaN;
  }, [searchParams]);

  const backHref = Number.isFinite(fromClientId)
    ? `/app/clients/${fromClientId}?tab=pmoc`
    : "/app/pmoc";

  const [tab, setTab] = useState<PmocCreateTab>("identification");
  const [clientId, setClientId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [selectedEquipIds, setSelectedEquipIds] = useState<number[]>([]);
  const [planTitle, setPlanTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [validationHighlights, setValidationHighlights] = useState<PmocCreateValidationIssue["code"][]>([]);

  const [clients, setClients] = useState<ClientOut[]>([]);
  const [clientSites, setClientSites] = useState<ClientSiteOut[]>([]);
  const [siteEquipments, setSiteEquipments] = useState<PmocEquipmentOption[]>([]);
  const [otherSitesEquipmentCount, setOtherSitesEquipmentCount] = useState(0);
  const [servicesCatalog, setServicesCatalog] = useState<ServiceOut[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [loadingSites, setLoadingSites] = useState(false);
  const [loadingEquipments, setLoadingEquipments] = useState(false);

  const [activities, setActivities] = useState<CreateActivityRow[]>([]);
  const [newActivityOpen, setNewActivityOpen] = useState(false);
  const [newActivity, setNewActivity] = useState({
    serviceId: "",
    frequency: "monthly" as PmocFrequency,
    equipmentId: "",
  });

  const [artDraft, setArtDraft] = useState({
    responsibleName: "",
    responsibleCouncil: "",
    responsibleRegistration: "",
    artNumber: "",
    artIssuedAt: "",
    nextAirAnalysisDue: "",
  });

  useEffect(() => {
    if (!Number.isFinite(fromClientId)) return;
    setClientId(String(fromClientId));
  }, [fromClientId]);

  useEffect(() => {
    let cancelled = false;
    setLoadingClients(true);
    void (async () => {
      try {
        const rows = await listClientsAll({ status: "active" });
        if (!cancelled) setClients(rows);
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Não foi possível carregar clientes.");
      } finally {
        if (!cancelled) setLoadingClients(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listServices({ limit: 500 });
        if (!cancelled) setServicesCatalog(rows);
      } catch {
        if (!cancelled) setServicesCatalog([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = Number.parseInt(clientId, 10);
    if (!Number.isFinite(id) || id < 1) {
      setClientSites([]);
      return;
    }
    let cancelled = false;
    setLoadingSites(true);
    void (async () => {
      try {
        const rows = await listClientSites(id);
        if (!cancelled) {
          setClientSites(rows);
          if (rows.length === 1) setSiteId(String(rows[0]!.id));
        }
      } catch (e) {
        if (!cancelled) {
          setClientSites([]);
          toast.error(e instanceof Error ? e.message : "Não foi possível carregar obras/filiais.");
        }
      } finally {
        if (!cancelled) setLoadingSites(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const comboItems = useMemo(() => clientsToComboboxItems(clients), [clients]);

  const selectedClient = useMemo(
    () => clients.find((c) => String(c.id) === clientId) ?? null,
    [clients, clientId],
  );

  const showSiteField = clientSites.length > 1;

  const resolvedSiteId = useMemo(() => {
    if (!selectedClient) return "";
    if (clientSites.length === 1) return String(clientSites[0]!.id);
    return siteId;
  }, [selectedClient, clientSites, siteId]);

  const selectedSite = useMemo(
    () => clientSites.find((s) => String(s.id) === resolvedSiteId) ?? null,
    [clientSites, resolvedSiteId],
  );

  useEffect(() => {
    const cid = Number.parseInt(clientId, 10);
    const sid = Number.parseInt(resolvedSiteId, 10);
    if (!Number.isFinite(cid) || cid < 1 || !Number.isFinite(sid) || sid < 1) {
      setSiteEquipments([]);
      return;
    }
    let cancelled = false;
    setLoadingEquipments(true);
    void (async () => {
      try {
        const { items, otherSitesCount } = await loadPmocEquipmentsForSite(cid, sid);
        if (!cancelled) {
          setSiteEquipments(items);
          setOtherSitesEquipmentCount(otherSitesCount);
        }
      } catch (e) {
        if (!cancelled) {
          setSiteEquipments([]);
          toast.error(e instanceof Error ? e.message : "Não foi possível carregar equipamentos.");
        }
      } finally {
        if (!cancelled) setLoadingEquipments(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId, resolvedSiteId]);

  const selectedBtuSum = useMemo(
    () =>
      siteEquipments
        .filter((eq) => selectedEquipIds.includes(eq.id))
        .reduce((acc, eq) => acc + (eq.capacidade_btu ?? 0), 0),
    [siteEquipments, selectedEquipIds],
  );

  const bannerHighlights = useMemo(
    () => ({
      missingClient: validationHighlights.includes("missing_client"),
      missingSite: validationHighlights.includes("missing_site"),
      missingEquipment: validationHighlights.includes("missing_equipment"),
      missingRt: validationHighlights.includes("missing_rt"),
    }),
    [validationHighlights],
  );

  const selectedEquipmentLabels = useMemo(
    () =>
      siteEquipments
        .filter((eq) => selectedEquipIds.includes(eq.id))
        .map((eq) => eq.identificacao),
    [siteEquipments, selectedEquipIds],
  );

  const planningEquipments = useMemo(
    () =>
      siteEquipments.map((eq) => ({
        id: String(eq.id),
        siteId: resolvedSiteId,
        identificacao: eq.identificacao,
        fabricante: eq.fabricante ?? "—",
        modelo: eq.modelo ?? "—",
        capacidadeBtu: eq.capacidade_btu ?? 0,
        localInstalacao: eq.local_instalacao ?? eq.identificacao,
      })),
    [siteEquipments, resolvedSiteId],
  );

  const planningActivities = useMemo(
    () =>
      activities.map((row) => {
        const service = servicesCatalog.find((s) => s.id === row.serviceId);
        return {
          id: row.id,
          service: row.serviceName,
          serviceId: row.serviceId,
          durationMinutes: Number(service?.duration_minutes) || undefined,
          frequency: row.frequency,
          frequencyLabel: row.frequencyLabel,
          equipment: row.equipmentLabel,
          scheduledDate: new Date().toISOString().slice(0, 10),
        };
      }),
    [activities, servicesCatalog],
  );

  function handleClientChange(id: string) {
    setClientId(id);
    setSiteId("");
    setSelectedEquipIds([]);
    setValidationHighlights([]);
    const client = clients.find((c) => String(c.id) === id);
    if (client) {
      setPlanTitle((prev) => prev || `PMOC — ${client.name}`);
    }
  }

  function handleSiteChange(id: string) {
    setSiteId(id);
    setSelectedEquipIds([]);
    setValidationHighlights([]);
  }

  function toggleEquipment(id: number) {
    setSelectedEquipIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setValidationHighlights((prev) => prev.filter((c) => c !== "missing_equipment"));
  }

  function handleAddActivity() {
    const service = servicesCatalog.find((s) => String(s.id) === newActivity.serviceId);
    const freq = FREQ_OPTIONS.find((f) => f.value === newActivity.frequency);
    if (!service || !freq) {
      toast.error("Selecione o serviço e a periodicidade.");
      return;
    }

    const equipmentId =
      newActivity.equipmentId === "" ? null : Number.parseInt(newActivity.equipmentId, 10);
    const equipmentLabel =
      equipmentId != null
        ? siteEquipments.find((eq) => eq.id === equipmentId)?.identificacao ?? null
        : null;

    setActivities((rows) => [
      ...rows,
      {
        id: `local-${Date.now()}`,
        serviceId: service.id,
        serviceName: service.name,
        frequency: freq.value,
        frequencyLabel: freq.label,
        equipmentId: Number.isFinite(equipmentId) ? equipmentId : null,
        equipmentLabel,
      },
    ]);
    setNewActivity({ serviceId: "", frequency: "monthly", equipmentId: "" });
    setNewActivityOpen(false);
    toast.success("Atividade adicionada ao cronograma.");
  }

  function applyValidationIssues(issues: PmocCreateValidationIssue[]) {
    setValidationHighlights(issues.map((i) => i.code));
    if (issues[0]?.tab) setTab(issues[0].tab);
  }

  async function handleSave() {
    const validation = validatePmocCreateDraft({
      clientId,
      siteId,
      resolvedSiteId,
      equipmentIds: selectedEquipIds,
      planTitle,
      responsibleName: artDraft.responsibleName,
      selectedBtuSum,
    });
    if (!validation.ok) {
      applyValidationIssues(validation.issues);
      toast.error(validation.message);
      return;
    }

    const clientNum = Number.parseInt(clientId, 10);
    const siteNum = Number.parseInt(resolvedSiteId, 10);
    setSaving(true);
    setValidationHighlights([]);
    try {
      let plan = await createPmocFull({
        clientId: clientNum,
        siteId: siteNum,
        title: planTitle.trim(),
        equipmentIds: selectedEquipIds,
        activities: activities.map((row) => ({
          serviceId: row.serviceId,
          frequency: row.frequency,
          equipmentId: row.equipmentId,
          title: row.serviceName,
        })),
        rtData: {
          responsibleName: artDraft.responsibleName.trim(),
          responsibleCouncil: artDraft.responsibleCouncil.trim() || undefined,
          responsibleRegistration: artDraft.responsibleRegistration.trim() || undefined,
          artNumber: artDraft.artNumber.trim() || undefined,
          artIssuedAt: artDraft.artIssuedAt || undefined,
          nextAirAnalysisDue: artDraft.nextAirAnalysisDue || undefined,
        },
      });

      const canActivate = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";
      if (canActivate) {
        try {
          plan = await activatePmocPlan(plan.id);
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : "PMOC salvo como rascunho. Ative o plano para agendar.",
          );
        }
      }

      toast.success("PMOC criado com sucesso.");
      const canSchedule = ctx?.user.role === "admin" || ctx?.user.role === "receptionist";
      const openSchedule = canSchedule && plan.status === "active" ? "&openSchedule=1" : "";
      navigate(`/app/pmoc/${plan.id}?tab=planning${openSchedule}`, { replace: true });
    } catch (e) {
      const apiIssues = (e as Error & { pmocValidationIssues?: unknown[] }).pmocValidationIssues;
      if (Array.isArray(apiIssues) && apiIssues.length > 0) {
        const parsed = parsePmocCreateApiErrors({ detail: { errors: apiIssues } });
        applyValidationIssues(parsed);
      }
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o PMOC.");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (window.confirm("Descartar alterações deste rascunho?")) {
      navigate(backHref);
    }
  }

  if (!ctx) return <Navigate to="/login" replace />;

  const canCreate =
    ctx.user.role === "admin" || ctx.user.role === "receptionist" || ctx.user.role === "technician";

  if (!canCreate) {
    return (
      <div className={createStyles.content}>
        <p className={pmocStyles.msgErr}>Sem permissão para criar PMOC.</p>
        <Button variant="outline" onClick={() => navigate(backHref)}>
          Voltar
        </Button>
      </div>
    );
  }

  const tabs: { id: PmocCreateTab; label: string }[] = [
    { id: "identification", label: "Identificação do Cliente" },
    { id: "schedule", label: "Cronograma" },
    { id: "air", label: "Ar & ART" },
    { id: "planning", label: "Planejamento" },
  ];

  return (
    <div className={createStyles.pageShell}>
      <header className={createStyles.pageHeader}>
        <div className={createStyles.pageHeaderInner}>
          <h1 className={createStyles.title}>Novo PMOC</h1>
          <div className={createStyles.badges}>
            <span className={createStyles.badgeDraft}>Rascunho</span>
            <span className={createStyles.badgeType}>PMOC</span>
          </div>
          <p className={createStyles.lead}>
            Cadastre cliente, equipamentos, cronograma e conformidade legal. Ao salvar, o plano é persistido e você pode agendar as visitas.
          </p>
        </div>
      </header>

      <div className={createStyles.content}>
        <PmocCreateStatusBanner
          selectedBtuSum={selectedBtuSum}
          equipmentCount={selectedEquipIds.length}
          activityCount={activities.length}
          hasResponsibleTech={Boolean(artDraft.responsibleName.trim())}
          validationHighlights={bannerHighlights}
          onNavigateTab={setTab}
        />

        <nav className={createStyles.tabNav} role="tablist" aria-label="Seções do cadastro PMOC">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`${createStyles.tabNavBtn} ${tab === item.id ? createStyles.tabNavBtnActive : ""}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <form
          id="pmoc-create-form"
          className={createStyles.tabStack}
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          {tab === "identification" ? (
            <>
              <FormCard
                icon={<User size={20} />}
                title="Buscar Cliente"
                subtitle="Selecione o cliente titular do plano PMOC"
              >
                <div className={formLayout.field}>
                  <ClientCombobox
                    id="pmoc-create-client"
                    clientes={comboItems}
                    value={clientId}
                    onChange={handleClientChange}
                    placeholder="Selecione o cliente"
                    searchPlaceholder="Buscar por nome, CNPJ/CPF ou razão social…"
                    emptyMessage={loadingClients ? "Carregando clientes…" : "Nenhum cliente encontrado."}
                  />
                  <p className={createStyles.metaHint}>
                    {loadingClients ? "Carregando…" : `${clients.length} cliente(s) ativo(s), ordenados alfabeticamente.`}
                  </p>
                </div>

                {selectedClient ? (
                  <div className={createStyles.selectedPill}>
                    <div className={createStyles.selectedPillLabel}>Cliente selecionado</div>
                    <div className={createStyles.selectedPillValue}>{selectedClient.name}</div>
                    <div className={createStyles.selectedPillMeta}>{selectedClient.document ?? "—"}</div>
                  </div>
                ) : null}
              </FormCard>

              {selectedClient && showSiteField ? (
                <FormCard
                  icon={<Building2 size={20} />}
                  title="Selecionar Obra/Filial"
                  subtitle="O PMOC é vinculado a uma unidade específica do cliente"
                >
                  <label className={formLayout.field}>
                    <span className={loginStyles.label}>Obra / filial</span>
                    <select
                      id="pmoc-create-site"
                      className={loginStyles.input}
                      value={siteId}
                      disabled={loadingSites}
                      onChange={(e) => handleSiteChange(e.target.value)}
                    >
                      <option value="">Selecione a obra/filial</option>
                      {clientSites.map((site) => (
                        <option key={site.id} value={site.id}>
                          {siteLabel(site)}
                        </option>
                      ))}
                    </select>
                  </label>
                </FormCard>
              ) : null}

              {selectedClient && !showSiteField && selectedSite ? (
                <FormCard
                  icon={<Building2 size={20} />}
                  title="Obra / Unidade"
                  subtitle="Estabelecimento vinculado automaticamente"
                >
                  <p className={createStyles.selectedPillValue} style={{ margin: 0 }}>
                    {siteLabel(selectedSite)}
                  </p>
                </FormCard>
              ) : null}

              {resolvedSiteId ? (
                <FormCard
                  icon={<Snowflake size={20} />}
                  title="Equipamentos da unidade"
                  subtitle="Marque os equipamentos de ar-condicionado desta obra/filial"
                >
                  <div className={pmocStyles.btuSummaryCard}>
                    <div className={pmocStyles.btuSummaryRow}>
                      <span className={pmocStyles.btuSummaryLabel}>Capacidade total selecionada</span>
                      <span className={pmocStyles.btuSummaryValue}>{formatBtu(selectedBtuSum)}</span>
                    </div>
                    <div className={pmocStyles.btuSummaryRow} style={{ marginTop: "0.35rem" }}>
                      <span className={pmocStyles.btuSummaryLabel}>
                        {selectedEquipIds.length} de {siteEquipments.length} equipamento
                        {siteEquipments.length !== 1 ? "s" : ""} selecionado
                        {selectedEquipIds.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  {loadingEquipments ? (
                    <p className={pmocStyles.metaMuted}>Carregando equipamentos…</p>
                  ) : siteEquipments.length === 0 ? (
                    <p className={pmocStyles.metaMuted}>
                      Nenhum equipamento ativo nesta unidade.
                      {otherSitesEquipmentCount > 0
                        ? ` Há ${otherSitesEquipmentCount} equipamento(s) vinculado(s) a outras obras deste cliente — confira a obra/filial selecionada.`
                        : " Cadastre equipamentos na aba Equipamentos do cliente."}
                    </p>
                  ) : (
                    <div className={pmocStyles.tableWrap}>
                      <table className={pmocStyles.table}>
                        <thead>
                          <tr>
                            <th style={{ width: "2.5rem" }} />
                            <th>Identificação</th>
                            <th>Modelo</th>
                            <th>Capacidade BTU</th>
                            <th>Local</th>
                          </tr>
                        </thead>
                        <tbody>
                          {siteEquipments.map((eq) => {
                            const checked = selectedEquipIds.includes(eq.id);
                            return (
                              <tr
                                key={eq.id}
                                className={checked ? pmocStyles.equipRowSelected : ""}
                                onClick={() => toggleEquipment(eq.id)}
                                style={{ cursor: "pointer" }}
                              >
                                <td onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    className={pmocStyles.equipCheckbox}
                                    checked={checked}
                                    onChange={() => toggleEquipment(eq.id)}
                                    aria-label={`Selecionar ${eq.identificacao}`}
                                  />
                                </td>
                                <td>{eq.identificacao}</td>
                                <td className={pmocStyles.metaMuted}>{eq.modelo ?? "—"}</td>
                                <td>
                                  <span className={pmocStyles.btuPill}>{formatBtu(eq.capacidade_btu ?? 0)}</span>
                                </td>
                                <td className={pmocStyles.metaMuted}>{eq.local_instalacao ?? "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </FormCard>
              ) : selectedClient ? (
                <p className={pmocStyles.metaMuted}>Selecione a obra/filial para listar os equipamentos.</p>
              ) : null}

              <FormCard icon={<ClipboardList size={20} />} title="Identificação do plano" subtitle="Título exibido na listagem e nos relatórios">
                <label className={formLayout.field}>
                  <span className={loginStyles.label}>Título do PMOC</span>
                  <input
                    id="pmoc-create-title"
                    className={loginStyles.input}
                    value={planTitle}
                    onChange={(e) => setPlanTitle(e.target.value)}
                    placeholder="Ex.: PMOC — Cliente — Unidade Centro"
                  />
                </label>
              </FormCard>
            </>
          ) : null}

        {tab === "schedule" ? (
            <FormCard
              icon={<Calendar size={20} />}
              title="Cronograma de atividades"
              subtitle="Visualize e inclua atividades de manutenção preventiva"
            >
              <div className={createStyles.sectionHeadRow}>
                <p className={pmocStyles.metaMuted} style={{ margin: 0 }}>
                  {activities.length} atividade(s) cadastrada(s)
                </p>
                <Button type="button" variant="outline" onClick={() => setNewActivityOpen((open) => !open)}>
                  {newActivityOpen ? "Fechar formulário" : "Nova Atividade"}
                </Button>
              </div>

              {newActivityOpen ? (
                <div className={createStyles.collapsePanel}>
                  <h3 className={pmocStyles.sectionTitle}>Nova atividade</h3>
                  <div className={pmocStyles.grid2}>
                    <label className={formLayout.field}>
                      <span className={pmocStyles.metaMuted}>Serviço</span>
                      <select
                        className={loginStyles.input}
                        value={newActivity.serviceId}
                        onChange={(e) => setNewActivity((x) => ({ ...x, serviceId: e.target.value }))}
                      >
                        <option value="">— Selecione —</option>
                        {servicesCatalog.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={formLayout.field}>
                      <span className={pmocStyles.metaMuted}>Periodicidade</span>
                      <select
                        className={loginStyles.input}
                        value={newActivity.frequency}
                        onChange={(e) => {
                          const frequency = e.target.value as PmocFrequency;
                          setNewActivity((x) => ({ ...x, frequency }));
                        }}
                      >
                        {FREQ_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={formLayout.field}>
                      <span className={pmocStyles.metaMuted}>Equipamento (opcional)</span>
                      <select
                        className={loginStyles.input}
                        value={newActivity.equipmentId}
                        onChange={(e) => setNewActivity((x) => ({ ...x, equipmentId: e.target.value }))}
                      >
                        <option value="">— Todo o sistema / plano —</option>
                        {siteEquipments.map((eq) => (
                          <option key={eq.id} value={eq.id}>
                            {eq.identificacao}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className={pmocStyles.actions}>
                    <Button type="button" onClick={handleAddActivity}>
                      Adicionar ao cronograma
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setNewActivityOpen(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className={pmocStyles.tableWrap}>
                <table className={pmocStyles.table}>
                  <thead>
                    <tr>
                      <th>Serviço</th>
                      <th>Periodicidade</th>
                      <th>Equipamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activities.map((row) => (
                      <tr key={row.id}>
                        <td>{row.serviceName}</td>
                        <td>{row.frequencyLabel}</td>
                        <td className={pmocStyles.metaMuted}>{row.equipmentLabel ?? "Todo o sistema / plano"}</td>
                      </tr>
                    ))}
                    {activities.length === 0 ? (
                      <tr>
                        <td colSpan={3}>
                          <span className={pmocStyles.metaMuted}>
                            Nenhuma atividade customizada — o modelo oficial será aplicado ao salvar.
                          </span>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              {selectedEquipmentLabels.length > 0 ? (
                <p className={createStyles.metaHint}>
                  Equipamentos selecionados na identificação: {selectedEquipmentLabels.join(", ")}.
                </p>
              ) : null}
            </FormCard>
          ) : null}

          {tab === "air" ? (
            <>
              <FormCard
                icon={<Shield size={20} />}
                title="Central de conformidade legal"
                subtitle="Responsável técnico, ART e análise de ar (Lei 13.589/2018)"
              >
                <p className={pmocStyles.metaMuted} style={{ margin: 0 }}>
                  Informe RT e ART antes de salvar. Upload de PDF pode ser feito após a criação do plano.
                </p>
              </FormCard>

              <FormCard icon={<User size={20} />} title="Responsável técnico" subtitle="Dados do profissional habilitado">
                <div className={pmocStyles.grid2}>
                  <label className={formLayout.field}>
                    <span className={pmocStyles.metaMuted}>Nome</span>
                    <input
                      className={loginStyles.input}
                      value={artDraft.responsibleName}
                      onChange={(e) => setArtDraft((d) => ({ ...d, responsibleName: e.target.value }))}
                      placeholder="Nome completo"
                    />
                  </label>
                  <label className={formLayout.field}>
                    <span className={pmocStyles.metaMuted}>Conselho (CREA/CFT)</span>
                    <input
                      className={loginStyles.input}
                      value={artDraft.responsibleCouncil}
                      onChange={(e) => setArtDraft((d) => ({ ...d, responsibleCouncil: e.target.value }))}
                      placeholder="Ex.: CREA-SP"
                    />
                  </label>
                  <label className={formLayout.field}>
                    <span className={pmocStyles.metaMuted}>Registro profissional</span>
                    <input
                      className={loginStyles.input}
                      value={artDraft.responsibleRegistration}
                      onChange={(e) => setArtDraft((d) => ({ ...d, responsibleRegistration: e.target.value }))}
                      placeholder="Nº registro"
                    />
                  </label>
                </div>
              </FormCard>

              <FormCard icon={<ClipboardList size={20} />} title="Dados da ART" subtitle="Número, emissão e planejamento de análise de ar">
                <div className={pmocStyles.grid2}>
                  <label className={formLayout.field}>
                    <span className={pmocStyles.metaMuted}>Número da ART</span>
                    <input
                      className={loginStyles.input}
                      value={artDraft.artNumber}
                      onChange={(e) => setArtDraft((d) => ({ ...d, artNumber: e.target.value }))}
                    />
                  </label>
                  <label className={formLayout.field}>
                    <span className={pmocStyles.metaMuted}>Emissão ART</span>
                    <input
                      type="date"
                      className={loginStyles.input}
                      value={artDraft.artIssuedAt}
                      onChange={(e) => setArtDraft((d) => ({ ...d, artIssuedAt: e.target.value }))}
                    />
                  </label>
                  <label className={formLayout.field}>
                    <span className={pmocStyles.metaMuted}>Próxima análise de ar</span>
                    <input
                      type="date"
                      className={loginStyles.input}
                      value={artDraft.nextAirAnalysisDue}
                      onChange={(e) => setArtDraft((d) => ({ ...d, nextAirAnalysisDue: e.target.value }))}
                    />
                  </label>
                </div>
              </FormCard>
            </>
          ) : null}

          {tab === "planning" ? (
            <PmocPlanningTab
              clientName={selectedClient?.name ?? "Cliente não selecionado"}
              planTitle={planTitle || "Novo PMOC"}
              activities={planningActivities}
              equipments={planningEquipments}
              selectedEquipmentIds={selectedEquipIds.map(String)}
              artIssuedAt={artDraft.artIssuedAt}
              nextAirAnalysisDue={artDraft.nextAirAnalysisDue}
              requireSaveBeforeSchedule
            />
          ) : null}
        </form>
      </div>

      <div className={createStyles.footerBar} role="toolbar" aria-label="Ações do cadastro PMOC">
        <div className={createStyles.footerInner}>
          <Button type="button" variant="ghost" onClick={() => navigate(backHref)}>
            Voltar
          </Button>
          <Button type="button" variant="destructive" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button type="submit" form="pmoc-create-form" disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
