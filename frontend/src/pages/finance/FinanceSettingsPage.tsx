import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  Bell,
  Calculator,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Landmark,
  Palette,
  Send,
  Settings2,
  Smartphone,
  Tags,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";
import {
  createFinanceCategory,
  deleteFinanceCategory,
  getFinanceCashflow,
  getFinanceSettings,
  listFinanceCategories,
  patchFinanceCategory,
  sendFinanceDueReminders,
  updateFinanceSettings,
  type FinanceCashflowOut,
  type FinanceCategoryOut,
  type FinanceSettingsOut,
} from "../../api/finance";
import { Button } from "../../components/ui/button";
import { FormSwitch } from "../../components/ui/form-switch";
import { CategoryColorPicker, resolveCategoryColor } from "../../components/finance/CategoryColorPicker";
import type { DashboardOutletContext } from "../dashboardContext";
import formLayout from "../formLayout.module.css";
import layout from "../admin/ManagementView.module.css";
import styles from "./FinanceSettingsPage.module.css";

function FinanceSettingsHeaderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2v20" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function money(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);
}

function modeLabel(mode: FinanceSettingsOut["effective_mode"]): string {
  if (mode === "management") return "Gestão completa";
  if (mode === "intermediate") return "Intermediário";
  return "Básico";
}

function modeDescription(mode: FinanceSettingsOut["effective_mode"]): string {
  if (mode === "management") return "Relatórios avançados, conciliação e previsão de caixa.";
  if (mode === "intermediate") return "Categorias, cartões e maquininhas com taxas.";
  return "Lançamentos essenciais e saldos.";
}

function categoryDotColor(value: string | null | undefined): string {
  return resolveCategoryColor(value) || "var(--color-border)";
}

function PanelIcon({
  children,
  variant,
}: {
  children: ReactNode;
  variant?: "default" | "warn" | "success" | "violet";
}) {
  const cls =
    variant === "warn"
      ? `${styles.panelIcon} ${styles.panelIconWarn}`
      : variant === "success"
        ? `${styles.panelIcon} ${styles.panelIconSuccess}`
        : variant === "violet"
          ? `${styles.panelIcon} ${styles.panelIconViolet}`
          : styles.panelIcon;
  return <span className={cls}>{children}</span>;
}

export function FinanceSettingsPage() {
  const { user } = useOutletContext<DashboardOutletContext>();
  const isAdmin = user.role === "admin";
  const canManageCadastros = user.role === "admin" || user.role === "receptionist";

  const [settings, setSettings] = useState<FinanceSettingsOut | null>(null);
  const [categories, setCategories] = useState<FinanceCategoryOut[]>([]);
  const [cashflow, setCashflow] = useState<FinanceCashflowOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [remindDate, setRemindDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cashflowStart, setCashflowStart] = useState(() =>
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
  );
  const [cashflowEnd, setCashflowEnd] = useState(() => new Date().toISOString().slice(0, 10));

  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("");
  const [catBusy, setCatBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const s = await getFinanceSettings();
      setSettings(s);
      if (s.finance_enabled) {
        const cats = await listFinanceCategories();
        setCategories(cats);
      } else {
        setCategories([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar configurações.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const categoriesAllowed = useMemo(() => {
    if (!settings?.finance_enabled) return false;
    return settings.effective_mode === "intermediate" || settings.effective_mode === "management";
  }, [settings]);

  async function saveSettings(next: { finance_enabled: boolean; finance_mode: "basic" | "intermediate" | "management" }) {
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      await updateFinanceSettings(next);
      await loadData();
      setMsg("Preferências salvas.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function fireReminders() {
    setError(null);
    try {
      const r = await sendFinanceDueReminders({ due_date: remindDate, mode: "manual" });
      setMsg(`Lembretes enviados: ${r.sent}/${r.eligible}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao enviar lembretes.");
    }
  }

  async function loadCashflow() {
    setError(null);
    try {
      const out = await getFinanceCashflow({ start_date: cashflowStart, end_date: cashflowEnd });
      setCashflow(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar fluxo de caixa.");
    }
  }

  async function submitNewCategory(ev: FormEvent) {
    ev.preventDefault();
    if (!newCatName.trim() || !categoriesAllowed || !canManageCadastros) return;
    setCatBusy(true);
    setError(null);
    try {
      const row = await createFinanceCategory({
        name: newCatName.trim(),
        color: newCatColor.trim() || null,
      });
      setCategories((prev) => [...prev.filter((c) => c.id !== row.id), row].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
      setNewCatName("");
      setNewCatColor("");
      setMsg("Categoria criada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível criar categoria.");
    } finally {
      setCatBusy(false);
    }
  }

  function startEdit(c: FinanceCategoryOut) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditColor(c.color?.trim() ?? "");
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditColor("");
  }

  async function saveEdit() {
    if (editingId == null || !editName.trim()) return;
    setCatBusy(true);
    setError(null);
    try {
      const row = await patchFinanceCategory(editingId, {
        name: editName.trim(),
        color: editColor.trim() || null,
      });
      setCategories((prev) =>
        prev.map((c) => (c.id === row.id ? row : c)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
      );
      cancelEdit();
      setMsg("Categoria atualizada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível atualizar.");
    } finally {
      setCatBusy(false);
    }
  }

  async function removeCategory(c: FinanceCategoryOut) {
    if (!window.confirm(`Excluir a categoria "${c.name}"? Lançamentos vinculados ficam sem categoria.`)) return;
    setCatBusy(true);
    setError(null);
    try {
      await deleteFinanceCategory(c.id);
      setCategories((prev) => prev.filter((x) => x.id !== c.id));
      if (editingId === c.id) cancelEdit();
      setMsg("Categoria removida.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível remover.");
    } finally {
      setCatBusy(false);
    }
  }

  if (loading) {
    return (
      <section className={styles.page} aria-busy="true" aria-label="Carregando configurações">
        <div className={styles.loadingState}>
          <div className={styles.loadingHero} />
          <div className={styles.loadingPanels}>
            <div className={styles.loadingPanel} />
            <div className={styles.loadingPanel} />
            <div className={styles.loadingPanel} />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <header className={layout.pageHeader}>
        <nav className={layout.breadcrumb} aria-label="Navegação">
          <Link to="/app/finance/dashboard" className={layout.breadcrumbCurrent}>
            Financeiro
          </Link>
          <span className={layout.breadcrumbSep} aria-hidden>
            /
          </span>
          <span>Configurações</span>
        </nav>
        <div className={layout.sectionHeaderRow}>
          <div className={layout.pageHeaderMain}>
            <span className={layout.pageHeaderIcon} aria-hidden>
              <FinanceSettingsHeaderIcon />
            </span>
            <div className={layout.pageHeaderText}>
              <h1 className={layout.pageTitle}>Configurações do Financeiro</h1>
              <p className={layout.pageLead}>
                Ative o módulo, organize cadastros e acompanhe o fluxo de caixa em um só lugar.
              </p>
              {settings ? (
                <div className={styles.heroMeta}>
                  <span className={styles.modeBadge}>
                    <span className={styles.modeBadgeDot} aria-hidden />
                    Modo {modeLabel(settings.effective_mode)}
                    {!settings.finance_enabled ? " · inativo" : ""}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
          <Link to="/app/finance/dashboard" style={{ textDecoration: "none" }}>
            <Button type="button" variant="outline" size="sm">
              Voltar ao Financeiro
            </Button>
          </Link>
        </div>
      </header>

      {(error || msg) && (
        <div className={styles.flashRow}>
          {error ? (
            <div className={styles.flashError} role="alert">
              <TriangleAlert aria-hidden />
              <span>{error}</span>
            </div>
          ) : null}
          {msg ? (
            <div className={styles.flashOk} role="status">
              <CheckCircle2 aria-hidden />
              <span>{msg}</span>
            </div>
          ) : null}
        </div>
      )}

      <div className={styles.layout}>
        <div className={styles.main}>
          {settings ? (
            <article className={styles.panel}>
              <div className={styles.panelHead}>
                <PanelIcon>
                  <Settings2 aria-hidden />
                </PanelIcon>
                <div className={styles.panelHeadText}>
                  <h2 className={styles.panelTitle}>Módulo financeiro</h2>
                  <p className={styles.panelDesc}>Controle se o workspace usa o financeiro e qual nível de recursos.</p>
                </div>
              </div>
              <div className={`${formLayout.stack} ${styles.panelBody}`}>
                <div className={styles.settingRow}>
                  <div className={styles.settingRowLabel}>
                    <span className={styles.settingRowTitle}>Ativar financeiro no workspace</span>
                    <span className={styles.settingRowHint}>
                      Habilita lançamentos, saldos e relatórios para toda a equipe autorizada.
                    </span>
                  </div>
                  <FormSwitch
                    id="finance-enabled-switch"
                    checked={settings.finance_enabled}
                    disabled={!isAdmin || saving}
                    ariaLabel="Ativar financeiro no workspace"
                    onChange={(checked) =>
                      void saveSettings({ finance_enabled: checked, finance_mode: settings.selected_mode })
                    }
                  />
                </div>
                <label className={`${formLayout.field} ${styles.fieldBlock}`}>
                  <span className={styles.fieldLabel}>Modo de operação</span>
                  <select
                    className={styles.select}
                    value={settings.selected_mode}
                    disabled={!isAdmin || saving}
                    onChange={(e) =>
                      void saveSettings({
                        finance_enabled: settings.finance_enabled,
                        finance_mode: e.target.value as "basic" | "intermediate" | "management",
                      })
                    }
                  >
                    <option value="basic">Básico</option>
                    <option value="intermediate">Intermediário</option>
                    <option value="management">Gestão completa</option>
                  </select>
                  <span className={styles.fieldHint}>{modeDescription(settings.effective_mode)}</span>
                </label>
              </div>
            </article>
          ) : null}

          <article className={styles.panel}>
            <div className={styles.panelHead}>
              <PanelIcon variant="warn">
                <Bell aria-hidden />
              </PanelIcon>
              <div className={styles.panelHeadText}>
                <h2 className={styles.panelTitle}>Lembretes de vencimento</h2>
                <p className={styles.panelDesc}>Dispare avisos manuais para lançamentos em aberto na data escolhida.</p>
              </div>
            </div>
            <div className={`${formLayout.stack} ${styles.panelBody}`}>
              <div className={formLayout.field}>
                <span className={styles.fieldLabel} id="finance-remind-date-label">
                  Data de vencimento para lembretes
                </span>
                <div className={styles.inlineActions}>
                  <input
                    className={styles.input}
                    type="date"
                    value={remindDate}
                    onChange={(e) => setRemindDate(e.target.value)}
                    aria-labelledby="finance-remind-date-label"
                  />
                  <button type="button" className={styles.btnPrimary} onClick={() => void fireReminders()}>
                    <Send aria-hidden />
                    Disparar lembretes do dia
                  </button>
                </div>
              </div>
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHead}>
              <PanelIcon variant="violet">
                <Tags aria-hidden />
              </PanelIcon>
              <div className={styles.panelHeadText}>
                <h2 className={styles.panelTitle}>Categorias</h2>
                <p className={styles.panelDesc}>
                  Classifique lançamentos nas movimentações. As categorias aparecem nos filtros e relatórios compatíveis com o
                  modo ativo.
                </p>
              </div>
            </div>
            <div className={`${formLayout.stack} ${styles.panelBody}`}>
              {!settings?.finance_enabled ? (
                <p className={styles.muted}>Ative o financeiro para gerenciar categorias.</p>
              ) : !categoriesAllowed ? (
                <p className={styles.hintBox}>
                  Categorias completas estão disponíveis a partir do modo <strong>Intermediário</strong>. Suba o modo nas
                  preferências acima ou ajuste o plano do workspace.
                </p>
              ) : (
                <>
                  {canManageCadastros ? (
                    <form className={styles.newCategoryForm} onSubmit={submitNewCategory}>
                      <input
                        className={styles.input}
                        placeholder="Nome da categoria"
                        value={newCatName}
                        onChange={(e) => setNewCatName(e.target.value)}
                        maxLength={120}
                        disabled={catBusy}
                        aria-label="Nome da nova categoria"
                      />
                      <CategoryColorPicker
                        id="new-category-color"
                        label="Cor (opcional)"
                        value={newCatColor}
                        onChange={setNewCatColor}
                        disabled={catBusy}
                      />
                      <div className={styles.newCategoryActions}>
                        <button type="submit" className={styles.btnSecondary} disabled={catBusy || !newCatName.trim()}>
                          Adicionar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p className={styles.muted}>Apenas administradores e recepção alteram categorias; lista abaixo para consulta.</p>
                  )}

                  {categories.length === 0 ? (
                    <div className={styles.emptyCategories}>
                      <Palette aria-hidden />
                      <p>
                        {canManageCadastros
                          ? "Nenhuma categoria ainda. Cadastre a primeira acima."
                          : "Nenhuma categoria cadastrada."}
                      </p>
                    </div>
                  ) : (
                    <ul className={styles.categoryList}>
                      {categories.map((c) => (
                        <li
                          key={c.id}
                          className={`${styles.categoryRow} ${canManageCadastros && editingId === c.id ? styles.categoryRowEditing : ""}`}
                        >
                          {canManageCadastros && editingId === c.id ? (
                            <div className={styles.categoryEditBlock}>
                              <input
                                className={styles.input}
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                disabled={catBusy}
                                aria-label="Editar nome"
                              />
                              <CategoryColorPicker
                                id={`edit-category-color-${c.id}`}
                                label="Cor"
                                value={editColor}
                                onChange={setEditColor}
                                disabled={catBusy}
                                compact
                              />
                              <div className={styles.rowActions}>
                                <button type="button" className={styles.btnGhost} onClick={cancelEdit} disabled={catBusy}>
                                  Cancelar
                                </button>
                                <button type="button" className={styles.btnPrimary} onClick={() => void saveEdit()} disabled={catBusy}>
                                  Salvar
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <span
                                className={styles.colorDot}
                                style={{ background: categoryDotColor(c.color) }}
                                title={c.color ?? "Sem cor"}
                                aria-hidden
                              />
                              <span className={styles.categoryName}>{c.name}</span>
                              {canManageCadastros ? (
                                <div className={styles.rowActions}>
                                  <button type="button" className={styles.btnGhost} onClick={() => startEdit(c)} disabled={catBusy}>
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.btnDangerGhost}
                                    onClick={() => void removeCategory(c)}
                                    disabled={catBusy}
                                  >
                                    Excluir
                                  </button>
                                </div>
                              ) : null}
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelHead}>
              <PanelIcon variant="success">
                <TrendingUp aria-hidden />
              </PanelIcon>
              <div className={styles.panelHeadText}>
                <h2 className={styles.panelTitle}>Fluxo de caixa</h2>
                <p className={styles.panelDesc}>Resumo sintético do período — útil para conferência rápida.</p>
              </div>
            </div>
            <div className={`${formLayout.stack} ${styles.panelBody}`}>
              <div className={formLayout.field}>
                <span className={styles.fieldLabel} id="finance-cashflow-period-label">
                  Período
                </span>
                <div className={styles.inlineActions}>
                  <input
                    className={styles.input}
                    type="date"
                    value={cashflowStart}
                    onChange={(e) => setCashflowStart(e.target.value)}
                    aria-labelledby="finance-cashflow-period-label"
                  />
                  <span className={styles.dateSep}>até</span>
                  <input
                    className={styles.input}
                    type="date"
                    value={cashflowEnd}
                    onChange={(e) => setCashflowEnd(e.target.value)}
                    aria-labelledby="finance-cashflow-period-label"
                  />
                  <button type="button" className={styles.btnSecondary} onClick={() => void loadCashflow()}>
                    <Calculator aria-hidden />
                    Calcular
                  </button>
                </div>
              </div>
              {cashflow ? (
                <dl className={styles.stats}>
                  <div className={styles.stat}>
                    <dt>Saldo inicial</dt>
                    <dd>{money(cashflow.opening_balance)}</dd>
                  </div>
                  <div className={styles.stat}>
                    <dt>Entradas</dt>
                    <dd className={styles.statPos}>{money(cashflow.incomes)}</dd>
                  </div>
                  <div className={styles.stat}>
                    <dt>Saídas</dt>
                    <dd className={styles.statNeg}>{money(cashflow.expenses)}</dd>
                  </div>
                  <div className={styles.stat}>
                    <dt>Fluxo líquido</dt>
                    <dd>{money(cashflow.net_flow)}</dd>
                  </div>
                  <div className={`${styles.stat} ${styles.statHighlight}`}>
                    <dt>Saldo final</dt>
                    <dd>{money(cashflow.closing_balance)}</dd>
                  </div>
                </dl>
              ) : (
                <p className={styles.muted}>Defina o período e clique em Calcular.</p>
              )}
            </div>
          </article>
        </div>

        <aside className={styles.aside}>
          <h3 className={styles.asideTitle}>Cadastros</h3>
          <p className={styles.asideLead}>Páginas dedicadas — cada uma com fluxo próprio e validações.</p>
          <nav className={styles.tileNav} aria-label="Cadastros financeiros">
            <Link className={styles.tile} to="/app/finance/settings/accounts">
              <span className={styles.tileIcon}>
                <Landmark aria-hidden />
              </span>
              <span className={styles.tileBody}>
                <span className={styles.tileKicker}>Contas</span>
                <span className={styles.tileTitle}>Contas bancárias e caixa</span>
              </span>
              <span className={styles.tileChevron} aria-hidden>
                <ChevronRight />
              </span>
            </Link>
            <Link className={styles.tile} to="/app/finance/settings/cards">
              <span className={styles.tileIcon}>
                <CreditCard aria-hidden />
              </span>
              <span className={styles.tileBody}>
                <span className={styles.tileKicker}>Cartões</span>
                <span className={styles.tileTitle}>Cartões de crédito</span>
              </span>
              <span className={styles.tileChevron} aria-hidden>
                <ChevronRight />
              </span>
            </Link>
            <Link className={styles.tile} to="/app/finance/settings/machines">
              <span className={styles.tileIcon}>
                <Smartphone aria-hidden />
              </span>
              <span className={styles.tileBody}>
                <span className={styles.tileKicker}>Maquininhas</span>
                <span className={styles.tileTitle}>Taxas por parcela e bandeira</span>
              </span>
              <span className={styles.tileChevron} aria-hidden>
                <ChevronRight />
              </span>
            </Link>
          </nav>
        </aside>
      </div>
    </section>
  );
}
