import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useOutletContext } from "react-router-dom";
import {
  createPmocServiceCatalog,
  deletePmocServiceCatalog,
  listPmocEquipmentTypeOptions,
  listPmocServiceCatalog,
  updatePmocServiceCatalog,
  type PmocEquipmentTypeOptionOut,
  type PmocFrequency,
  type PmocServiceCatalogOut,
} from "../../api/pmoc";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { toast } from "../../lib/toast";
import type { DashboardOutletContext } from "../dashboardContext";
import formLayout from "../formLayout.module.css";
import loginStyles from "../LoginPage.module.css";
import pmocStyles from "./PmocPages.module.css";
import ui from "./PmocSettingsPage.module.css";

const FREQ_OPTIONS: { value: PmocFrequency; label: string }[] = [
  { value: "monthly", label: "Mensal" },
  { value: "quarterly", label: "Trimestral" },
  { value: "semiannual", label: "Semestral" },
  { value: "annual", label: "Anual" },
  { value: "custom", label: "Personalizado" },
];

export function PmocSettingsPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [services, setServices] = useState<PmocServiceCatalogOut[]>([]);
  const [equipmentTypeOptions, setEquipmentTypeOptions] = useState<PmocEquipmentTypeOptionOut[]>([]);
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<PmocFrequency>("monthly");
  const [equipmentTypes, setEquipmentTypes] = useState<string[]>([]);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [catalogRows, typeRows] = await Promise.all([
        listPmocServiceCatalog({ includeInactive: true }),
        listPmocEquipmentTypeOptions(),
      ]);
      setServices(catalogRows);
      setEquipmentTypeOptions(typeRows);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Não foi possível carregar as configurações do PMOC.";
      setErr(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const frequencyLabelByValue = useMemo(
    () => new Map(FREQ_OPTIONS.map((row) => [row.value, row.label])),
    [],
  );
  const equipmentTypeLabelByKey = useMemo(
    () => new Map(equipmentTypeOptions.map((row) => [row.key, row.label])),
    [equipmentTypeOptions],
  );

  function toggleEquipmentType(value: string) {
    setEquipmentTypes((rows) => (rows.includes(value) ? rows.filter((item) => item !== value) : [...rows, value]));
  }

  function selectAllEquipmentTypes() {
    setEquipmentTypes(equipmentTypeOptions.map((row) => row.key));
  }

  function clearEquipmentTypes() {
    setEquipmentTypes([]);
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast.error("Informe o nome do serviço PMOC.");
      return;
    }
    try {
      setSaving(true);
      await createPmocServiceCatalog({
        name: name.trim(),
        frequency,
        equipment_types: equipmentTypes,
      });
      setName("");
      setFrequency("monthly");
      setEquipmentTypes([]);
      toast.success("Serviço PMOC cadastrado.");
      await load();
    } catch (ex) {
      toast.error(ex instanceof Error ? ex.message : "Não foi possível cadastrar o serviço PMOC.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(row: PmocServiceCatalogOut) {
    try {
      await updatePmocServiceCatalog(row.id, { is_active: !row.is_active });
      await load();
    } catch (ex) {
      toast.error(ex instanceof Error ? ex.message : "Não foi possível atualizar o serviço PMOC.");
    }
  }

  async function handleDelete(row: PmocServiceCatalogOut) {
    if (!window.confirm(`Excluir o serviço PMOC "${row.name}"?`)) return;
    try {
      await deletePmocServiceCatalog(row.id);
      toast.success("Serviço PMOC excluído.");
      await load();
    } catch (ex) {
      toast.error(ex instanceof Error ? ex.message : "Não foi possível excluir o serviço PMOC.");
    }
  }

  if (!ctx) return <Navigate to="/login" replace />;
  if (ctx.user.role !== "admin" && ctx.user.role !== "receptionist") return <Navigate to="/app/pmoc" replace />;

  const activeServicesCount = services.filter((row) => row.is_active).length;
  const inactiveServicesCount = services.length - activeServicesCount;
  const selectedEquipmentCoverage =
    equipmentTypeOptions.length > 0 ? Math.round((equipmentTypes.length / equipmentTypeOptions.length) * 100) : 0;

  return (
    <section className={`${pmocStyles.page} ${ui.settingsPage}`}>
      <header className={`${pmocStyles.head} ${ui.pageHeader}`}>
        <div>
          <span className={ui.heroTag}>Catalogo PMOC</span>
          <h1 className={`${pmocStyles.title} ${ui.pageTitle}`}>Configurações do PMOC</h1>
          <p className={`${pmocStyles.subtitle} ${ui.pageSubtitle}`}>
            Catálogo exclusivo do PMOC com regras por tipo de equipamento para preencher o cronograma automaticamente.
          </p>
        </div>
        <div className={`${pmocStyles.actions} ${ui.headerActions}`}>
          <Link to="/app/pmoc" className={`${pmocStyles.btnSecondary} ${ui.backButton}`}>
            Voltar para PMOC
          </Link>
        </div>
      </header>

      <section className={ui.kpiGrid} aria-label="Indicadores rápidos">
        <article className={ui.kpiCard}>
          <div className={ui.kpiHead}>
            <span className={ui.kpiIcon}>SC</span>
            <p className={ui.kpiLabel}>Serviços cadastrados</p>
          </div>
          <p className={ui.kpiValue}>{services.length}</p>
          <p className={ui.kpiHint}>Base total do catalogo PMOC</p>
        </article>
        <article className={ui.kpiCard}>
          <div className={ui.kpiHead}>
            <span className={ui.kpiIcon}>AT</span>
            <p className={ui.kpiLabel}>Serviços ativos</p>
          </div>
          <p className={ui.kpiValue}>{activeServicesCount}</p>
          <p className={ui.kpiHint}>Disponiveis para uso imediato</p>
        </article>
        <article className={ui.kpiCard}>
          <div className={ui.kpiHead}>
            <span className={ui.kpiIcon}>IN</span>
            <p className={ui.kpiLabel}>Serviços inativos</p>
          </div>
          <p className={ui.kpiValue}>{inactiveServicesCount}</p>
          <p className={ui.kpiHint}>Pausados sem exclusao definitiva</p>
        </article>
        <article className={ui.kpiCard}>
          <div className={ui.kpiHead}>
            <span className={ui.kpiIcon}>TP</span>
            <p className={ui.kpiLabel}>Tipos disponíveis</p>
          </div>
          <p className={ui.kpiValue}>{equipmentTypeOptions.length}</p>
          <p className={ui.kpiHint}>Cobertura de equipamentos</p>
        </article>
      </section>

      <Card className={ui.panelCard}>
        <CardHeader className={ui.panelHeader}>
          <CardTitle>Novo serviço PMOC</CardTitle>
          <CardDescription>
            Esses serviços serão sugeridos automaticamente na ficha PMOC conforme os equipamentos selecionados.
          </CardDescription>
        </CardHeader>
        <CardContent className={ui.panelContent}>
          <form onSubmit={(e) => void handleCreate(e)} className={ui.formStack}>
            <div className={pmocStyles.grid2}>
              <label className={formLayout.field}>
                <span className={`${pmocStyles.metaMuted} ${ui.fieldLabel}`}>Nome do serviço</span>
                <input
                  className={loginStyles.input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Limpeza de bandeja e dreno"
                />
              </label>
              <label className={formLayout.field}>
                <span className={`${pmocStyles.metaMuted} ${ui.fieldLabel}`}>Periodicidade</span>
                <select
                  className={loginStyles.input}
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as PmocFrequency)}
                >
                  {FREQ_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={`${formLayout.field} ${ui.typesPanel}`}>
              <div className={ui.typesHeader}>
                <span className={`${pmocStyles.metaMuted} ${ui.typesTitle}`}>
                  Tipos de equipamento atendidos (vazio = todo tipo de equipamento)
                </span>
                <span className={ui.coverageBadge}>{selectedEquipmentCoverage}% de cobertura</span>
                <div className={ui.typesActions}>
                  <button type="button" className={ui.linkButton} onClick={selectAllEquipmentTypes}>
                    Marcar todos
                  </button>
                  <button type="button" className={ui.linkButton} onClick={clearEquipmentTypes}>
                    Limpar
                  </button>
                </div>
              </div>
              <div className={ui.typesGrid}>
                {equipmentTypeOptions.map((option) => (
                  <label
                    key={option.key}
                    className={`${ui.typeCard} ${equipmentTypes.includes(option.key) ? ui.typeCardSelected : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={equipmentTypes.includes(option.key)}
                      onChange={() => toggleEquipmentType(option.key)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
              <p className={ui.selectionSummary}>
                {equipmentTypes.length > 0
                  ? `${equipmentTypes.length} tipo(s) selecionado(s).`
                  : "Nenhum tipo selecionado: o serviço ficará disponível para todos os equipamentos."}
              </p>
            </div>

            <div className={ui.formActions}>
              <Button
                type="submit"
                disabled={saving}
                style={{ minWidth: "12rem", borderRadius: "0.72rem", fontWeight: 700, letterSpacing: "0.01em" }}
              >
                {saving ? "Salvando..." : "Salvar serviço PMOC"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className={`${ui.panelCard} ${ui.tablePanel}`}>
        <CardHeader className={ui.panelHeader}>
          <CardTitle>Serviços PMOC cadastrados</CardTitle>
          <CardDescription>Lista dedicada ao módulo PMOC (não usa o cadastro geral de serviços).</CardDescription>
        </CardHeader>
        <CardContent className={ui.panelContent}>
          {err ? <p className={ui.errorBanner}>{err}</p> : null}
          <div className={`${pmocStyles.tableWrap} ${ui.tableWrapPremium}`}>
            <table className={`${pmocStyles.table} ${ui.settingsTable}`}>
              <thead>
                <tr>
                  <th>Serviço</th>
                  <th>Periodicidade</th>
                  <th>Tipos de equipamento</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className={ui.emptyStateCell}>
                      Carregando serviços PMOC...
                    </td>
                  </tr>
                ) : null}
                {services.map((row) => (
                  <tr key={row.id} className={ui.dataRow}>
                    <td>
                      <span className={ui.serviceName}>{row.name}</span>
                    </td>
                    <td>{frequencyLabelByValue.get(row.frequency) ?? row.frequency}</td>
                    <td className={pmocStyles.metaMuted}>
                      {row.equipment_types.length > 0
                        ? row.equipment_types
                            .map((key) => equipmentTypeLabelByKey.get(key) ?? key)
                            .join(", ")
                        : "Todo tipo de equipamento"}
                    </td>
                    <td>
                      <span className={row.is_active ? ui.badgeActive : ui.badgeInactive}>
                        {row.is_active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className={ui.rowActionsCell}>
                      <div className={ui.rowActions}>
                        <Button type="button" variant="outline" size="sm" onClick={() => void handleToggleActive(row)}>
                          {row.is_active ? "Inativar" : "Ativar"}
                        </Button>
                        <Button type="button" variant="destructive" size="sm" onClick={() => void handleDelete(row)}>
                          Excluir
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && services.length === 0 && !err ? (
                  <tr>
                    <td colSpan={5} className={ui.emptyStateCell}>
                      Nenhum serviço PMOC cadastrado ainda. Cadastre o primeiro serviço acima para iniciar o catálogo.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
