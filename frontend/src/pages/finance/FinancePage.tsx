import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  createFinanceEntry,
  createFinanceEntryAsaasCharge,
  deleteFinanceEntry,
  getFinanceGateways,
  getFinanceSettings,
  listFinanceAccounts,
  listFinanceCreditCards,
  listFinancePaymentFees,
  listFinanceCategories,
  listFinanceEntries,
  patchFinanceEntry,
  type FinanceEntryDateBasis,
  type FinanceBankAccountOut,
  type FinanceCreditCardOut,
  type FinanceEntryStatus,
  type FinanceEntryOut,
  type FinanceGatewaysOut,
  type FinancePaymentFeeOut,
  type FinanceSettingsOut,
  type FinanceEntryType,
} from "../../api/finance";
import { digitsOnlyPhoneForApi, formatPhoneBrDisplay, formatPhoneBrInput } from "../../lib/brMask";
import type { DashboardOutletContext } from "../dashboardContext";
import styles from "./FinancePage.module.css";

function toDateInput(v: Date): string {
  return v.toISOString().slice(0, 10);
}

function money(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);
}

function statusLabel(v: FinanceEntryStatus): string {
  if (v === "paid") return "Pago";
  if (v === "overdue") return "Vencido";
  if (v === "cancelled") return "Cancelado";
  return "Pendente";
}

function statusBadgeClass(v: FinanceEntryStatus): string {
  if (v === "paid") return styles.statusPaid;
  if (v === "overdue") return styles.statusOverdue;
  if (v === "cancelled") return styles.statusCancelled;
  return styles.statusPending;
}

function modeLabel(m: FinanceSettingsOut["effective_mode"]): string {
  if (m === "management") return "Gestão completa";
  if (m === "intermediate") return "Intermediário";
  return "Básico";
}

export function FinancePage() {
  const { tenant } = useOutletContext<DashboardOutletContext>();
  const now = new Date();
  const startOfMonth = useMemo(() => new Date(now.getFullYear(), now.getMonth(), 1), [now.getFullYear(), now.getMonth()]);
  const endOfMonth = useMemo(() => new Date(now.getFullYear(), now.getMonth() + 1, 0), [now.getFullYear(), now.getMonth()]);
  const [entries, setEntries] = useState<FinanceEntryOut[]>([]);
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([]);
  const [accounts, setAccounts] = useState<FinanceBankAccountOut[]>([]);
  const [cards, setCards] = useState<FinanceCreditCardOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>(toDateInput(startOfMonth));
  const [endDate, setEndDate] = useState<string>(toDateInput(endOfMonth));

  const [description, setDescription] = useState("");
  const [entryType, setEntryType] = useState<FinanceEntryType>("income");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(toDateInput(now));
  const [competenceDate, setCompetenceDate] = useState(toDateInput(now));
  const [settlementPlan, setSettlementPlan] = useState<"same_as_due" | "next_business_day">("same_as_due");
  const [listDateBasis, setListDateBasis] = useState<FinanceEntryDateBasis>("due_date");
  const [categoryId, setCategoryId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [paymentProvider, setPaymentProvider] = useState("");
  const [feePercent, setFeePercent] = useState("0");
  const [feeFixedAmount, setFeeFixedAmount] = useState("0");
  const [recipientWhatsapp, setRecipientWhatsapp] = useState("");
  const [installments, setInstallments] = useState("1");
  const [installmentIntervalMonths, setInstallmentIntervalMonths] = useState("1");
  const [financeAccountId, setFinanceAccountId] = useState("");
  const [creditCardId, setCreditCardId] = useState("");

  const [settings, setSettings] = useState<FinanceSettingsOut | null>(null);
  const [entryStatus, setEntryStatus] = useState<FinanceEntryStatus>("pending");
  const [showNewEntry, setShowNewEntry] = useState(false);

  const [gateways, setGateways] = useState<FinanceGatewaysOut | null>(null);
  const [paymentFees, setPaymentFees] = useState<FinancePaymentFeeOut[]>([]);
  const [chargeModalEntry, setChargeModalEntry] = useState<FinanceEntryOut | null>(null);
  const [chargeCustomerId, setChargeCustomerId] = useState("");
  const [chargeBillingType, setChargeBillingType] = useState<"PIX" | "BOLETO">("PIX");
  const [chargeSubmitting, setChargeSubmitting] = useState(false);
  const [chargeResult, setChargeResult] = useState<{ paymentId: string; invoiceUrl: string | null } | null>(null);
  const [editingEntry, setEditingEntry] = useState<FinanceEntryOut | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editStatus, setEditStatus] = useState<FinanceEntryStatus>("pending");
  const [editScope, setEditScope] = useState<"single" | "future" | "all">("single");
  const isIncome = entryType === "income";
  const showMachineField = isIncome && (paymentMethod === "credit_card" || paymentMethod === "debit_card");
  const showBankAccountField =
    paymentMethod === "pix" ||
    (isIncome && paymentMethod === "boleto") ||
    (!isIncome && paymentMethod === "debit_card");
  const showCreditCardField = !isIncome && paymentMethod === "credit_card";
  const showInstallmentsField = paymentMethod === "credit_card" || paymentMethod === "boleto";

  const providerSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const f of paymentFees) {
      const name = f.provider_name.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    return out.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [paymentFees]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const cfg = await getFinanceSettings();
      setSettings(cfg);
      if (!cfg.finance_enabled) {
        setEntries([]);
        setCategories([]);
        setGateways(null);
        return;
      }
      const [e, c, gw, fees, accs, ccs] = await Promise.all([
        listFinanceEntries({
          start_date: startDate,
          end_date: endDate,
          date_basis: listDateBasis,
        }),
        listFinanceCategories(),
        getFinanceGateways(),
        listFinancePaymentFees(),
        listFinanceAccounts(),
        listFinanceCreditCards(),
      ]);
      setGateways(gw);
      setEntries(e);
      setCategories(c.map((x) => ({ id: x.id, name: x.name })));
      setPaymentFees(fees);
      setAccounts(accs);
      setCards(ccs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar financeiro.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [startDate, endDate, listDateBasis]);

  useEffect(() => {
    const provider = paymentProvider.trim().toLowerCase();
    if (!provider) return;
    const installmentsNum = Math.max(1, Number.parseInt(installments || "1", 10) || 1);
    const fee = paymentFees.find(
      (x) =>
        x.is_active &&
        x.provider_name.trim().toLowerCase() === provider &&
        x.payment_method === paymentMethod &&
        x.installments === installmentsNum,
    );
    if (!fee) return;
    setFeePercent(String(fee.fee_percent));
    setFeeFixedAmount(String(fee.fee_fixed_amount));
  }, [paymentProvider, paymentMethod, installments, paymentFees]);

  useEffect(() => {
    if (paymentMethod === "cash") {
      setPaymentProvider("caixa");
    } else if (!showMachineField) {
      setPaymentProvider("");
    }
    if (!showMachineField) {
      setFeePercent("0");
      setFeeFixedAmount("0");
    }
    if (!showBankAccountField) {
      setFinanceAccountId("");
    }
    if (!showCreditCardField) {
      setCreditCardId("");
    }
    if (!showInstallmentsField) {
      setInstallments("1");
      setInstallmentIntervalMonths("1");
    }
  }, [paymentMethod, entryType, showMachineField, showBankAccountField, showCreditCardField, showInstallmentsField]);

  async function submitEntry(ev: FormEvent) {
    ev.preventDefault();
    if (!description.trim() || !amount.trim()) return;
    const amountNum = Number(amount);
    const installmentsNum = showInstallmentsField ? Number(installments || "1") : 1;
    const feeMatched = paymentFees.find(
      (x) =>
        x.is_active &&
        x.provider_name.trim().toLowerCase() === paymentProvider.trim().toLowerCase() &&
        x.payment_method === paymentMethod &&
        x.installments === installmentsNum,
    );
    const feePercentNum = feeMatched ? Number(feeMatched.fee_percent || 0) : Number(feePercent || "0");
    const feeFixedNum = feeMatched ? Number(feeMatched.fee_fixed_amount || 0) : Number(feeFixedAmount || "0");
    const feeCalculated = amountNum * (feePercentNum / 100) + feeFixedNum;
    const wa = digitsOnlyPhoneForApi(recipientWhatsapp);
    try {
      await createFinanceEntry({
        description: description.trim(),
        entry_type: entryType,
        amount: amountNum,
        payment_method: paymentMethod || null,
        payment_provider: paymentProvider.trim() || null,
        fee_percent: feePercentNum,
        fee_fixed_amount: feeFixedNum,
        fee_amount: feeCalculated,
        recipient_whatsapp: wa.length >= 10 ? wa : null,
        installments: installmentsNum,
        installment_interval_months: installmentsNum > 1 ? Number(installmentIntervalMonths || "1") : 1,
        finance_account_id: financeAccountId ? Number(financeAccountId) : null,
        credit_card_id: creditCardId ? Number(creditCardId) : null,
        due_date: dueDate,
        competence_date: isIncome ? competenceDate : undefined,
        ...(showMachineField ? { settlement_plan: settlementPlan } : {}),
        category_id: categoryId ? Number(categoryId) : null,
        status: entryStatus,
      });
      setDescription("");
      setAmount("");
      setCategoryId("");
      setEntryStatus("pending");
      setPaymentMethod("pix");
      setPaymentProvider("");
      setFeePercent("0");
      setFeeFixedAmount("0");
      setRecipientWhatsapp("");
      setInstallments("1");
      setInstallmentIntervalMonths("1");
      setFinanceAccountId("");
      setCreditCardId("");
      setShowNewEntry(false);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar lançamento.");
    }
  }

  async function markAsPaid(entry: FinanceEntryOut) {
    try {
      await patchFinanceEntry(entry.id, { status: "paid" });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível baixar lançamento.");
    }
  }

  async function markAsCancelled(entry: FinanceEntryOut) {
    try {
      await patchFinanceEntry(entry.id, { status: "cancelled" });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível cancelar lançamento.");
    }
  }

  async function removeEntry(entry: FinanceEntryOut) {
    if (!window.confirm(`Excluir "${entry.description}"?`)) return;
    try {
      await deleteFinanceEntry(entry.id);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível excluir lançamento.");
    }
  }

  function openEditModal(entry: FinanceEntryOut) {
    setEditingEntry(entry);
    setEditAmount(String(entry.amount ?? ""));
    setEditDueDate(entry.due_date);
    setEditStatus(entry.status);
    setEditScope("single");
  }

  async function submitEditEntry(ev: FormEvent) {
    ev.preventDefault();
    if (!editingEntry) return;
    try {
      await patchFinanceEntry(editingEntry.id, {
        amount: Number(editAmount),
        due_date: editDueDate,
        status: editStatus,
        edit_scope: editScope,
      });
      setEditingEntry(null);
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível atualizar lançamento.");
    }
  }

  function openChargeModal(entry: FinanceEntryOut) {
    if (!gateways?.asaas.connected) {
      setError("Conecte o Asaas antes de emitir cobrança.");
      return;
    }
    if (entry.gateway_payment_id) {
      setError("Este lançamento já está vinculado a uma cobrança Asaas.");
      return;
    }
    setChargeModalEntry(entry);
    setChargeCustomerId("");
    setChargeBillingType("PIX");
    setChargeResult(null);
  }

  function closeChargeModal() {
    if (chargeSubmitting) return;
    setChargeModalEntry(null);
    setChargeCustomerId("");
    setChargeBillingType("PIX");
    setChargeResult(null);
  }

  async function submitAsaasChargeModal(ev: FormEvent) {
    ev.preventDefault();
    if (!chargeModalEntry) return;
    if (!chargeCustomerId.trim()) {
      setError("Informe o customer_id do Asaas.");
      return;
    }
    setChargeSubmitting(true);
    setError(null);
    try {
      const r = await createFinanceEntryAsaasCharge(chargeModalEntry.id, {
        customer_id: chargeCustomerId.trim(),
        billing_type: chargeBillingType,
      });
      setChargeResult({ paymentId: r.payment_id, invoiceUrl: r.invoice_url });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível emitir cobrança.");
    } finally {
      setChargeSubmitting(false);
    }
  }

  const totals = useMemo(() => {
    let incomes = 0;
    let expenses = 0;
    let net = 0;
    for (const e of entries) {
      if (e.entry_type === "income") {
        incomes += Number(e.amount || 0);
        net += Number(e.net_amount || 0);
      } else {
        expenses += Number(e.amount || 0);
        net -= Number(e.net_amount || 0);
      }
    }
    return {
      incomes,
      expenses,
      gross: incomes + expenses,
      net,
    };
  }, [entries]);

  const groupedByDay = useMemo(() => {
    const map = new Map<string, FinanceEntryOut[]>();
    for (const e of entries) {
      const key = entryDateForListBasis(e, listDateBasis);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    const keys = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));
    return keys.map((k) => ({
      day: k,
      items: (map.get(k) ?? []).sort((a, b) => b.id - a.id),
    }));
  }, [entries, listDateBasis]);

  const listBasisHint =
    listDateBasis === "competence_date"
      ? "agrupando por data de competência (receita)"
      : listDateBasis === "expected_settlement_date"
        ? "agrupando por previsão de crédito no caixa"
        : "agrupando por vencimento";

  function applyRangePreset(preset: "month" | "quarter" | "year") {
    const base = new Date();
    if (preset === "month") {
      setStartDate(toDateInput(new Date(base.getFullYear(), base.getMonth(), 1)));
      setEndDate(toDateInput(new Date(base.getFullYear(), base.getMonth() + 1, 0)));
      return;
    }
    if (preset === "quarter") {
      const qStart = Math.floor(base.getMonth() / 3) * 3;
      setStartDate(toDateInput(new Date(base.getFullYear(), qStart, 1)));
      setEndDate(toDateInput(new Date(base.getFullYear(), qStart + 3, 0)));
      return;
    }
    setStartDate(toDateInput(new Date(base.getFullYear(), 0, 1)));
    setEndDate(toDateInput(new Date(base.getFullYear(), 11, 31)));
  }

function formatDayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function entryDateForListBasis(e: FinanceEntryOut, basis: FinanceEntryDateBasis): string {
  if (basis === "competence_date") return e.competence_date ?? e.due_date;
  if (basis === "expected_settlement_date") return e.expected_settlement_date ?? e.due_date;
  return e.due_date;
}

function shortIso(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <div>
            <h1>Financeiro</h1>
            <p>
              Contas a receber e a pagar, taxas de maquininha e visão por período. Integrações com gateways (Asaas,
              Mercado Pago) e conciliação automática entram na evolução do modo{" "}
              <strong>Gestão completa</strong> — use categorias e lembretes por WhatsApp nos modos superiores.
            </p>
            <p className={styles.planPill}>
              Plano do workspace: <strong>{tenant.active_plan}</strong>
            </p>
          </div>
          {settings ? (
            <div className={styles.badgeRow}>
              <span className={styles.modeBadge}>Modo ativo: {modeLabel(settings.effective_mode)}</span>
            </div>
          ) : null}
        </div>
      </header>

      <div className={styles.topConfigHint}>
        <p className={styles.muted}>
          Configurações, gateways, taxas de maquininha (Stone) e lembretes foram movidos para a página dedicada.
        </p>
        <Link to="/app/finance/settings" className={styles.inlineConfigLink}>
          Abrir Configurações do Financeiro
        </Link>
      </div>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {settings && !settings.finance_enabled ? (
        <section className={styles.panel}>
          <p className={styles.locked}>
            O financeiro está desativado. Ative em <strong>Configurações do Financeiro</strong>.
          </p>
        </section>
      ) : null}

      {settings?.finance_enabled !== false ? (
        <>
          <section className={styles.filtersBar}>
            <div className={styles.filterQuickActions}>
              <button type="button" className={styles.presetBtn} onClick={() => applyRangePreset("month")}>
                Mês
              </button>
              <button type="button" className={styles.presetBtn} onClick={() => applyRangePreset("quarter")}>
                Trimestre
              </button>
              <button type="button" className={styles.presetBtn} onClick={() => applyRangePreset("year")}>
                Anual
              </button>
            </div>
            <div className={styles.row2}>
              <label className={styles.field}>
                <span>De</span>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </label>
              <label className={styles.field}>
                <span>Até</span>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </label>
            </div>
            <label className={styles.field} style={{ maxWidth: "100%" }}>
              <span>Período por</span>
              <select
                value={listDateBasis}
                onChange={(e) => setListDateBasis(e.target.value as FinanceEntryDateBasis)}
                aria-label="Critério de data do período"
              >
                <option value="due_date">Vencimento</option>
                <option value="competence_date">Competência (receita)</option>
                <option value="expected_settlement_date">Previsão de caixa (compensação)</option>
              </select>
            </label>
          </section>

          <div className={styles.cards}>
            <article className={`${styles.card} ${styles.cardIncome}`}>
              <span className={styles.cardLabel}>Entradas</span>
              <span className={styles.cardValue}>{money(totals.incomes)}</span>
            </article>
            <article className={`${styles.card} ${styles.cardExpense}`}>
              <span className={styles.cardLabel}>Saídas</span>
              <span className={styles.cardValue}>{money(totals.expenses)}</span>
            </article>
            <article className={styles.card}>
              <span className={styles.cardLabel}>Total bruto</span>
              <span className={styles.cardValue}>{money(totals.gross)}</span>
            </article>
            <article className={`${styles.card} ${styles.cardNet}`}>
              <span className={styles.cardLabel}>Total líquido</span>
              <span className={styles.cardValue}>{money(totals.net)}</span>
            </article>
          </div>

          <div className={styles.actionsRow}>
            <button
              type="button"
              className={styles.primaryActionBtn}
              onClick={() => {
                setCompetenceDate(dueDate);
                setSettlementPlan("same_as_due");
                setShowNewEntry(true);
              }}
            >
              Novo lançamento
            </button>
            <Link to="/app/finance/settings" className={styles.inlineConfigLink}>
              Categoria e configurações
            </Link>
          </div>

          <section className={styles.entriesSection}>
            <div className={styles.entriesHead}>
              <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
                Movimentações (entradas e saídas)
              </h2>
              {loading ? <span className={styles.muted}>Atualizando…</span> : null}
            </div>
            <p className={styles.muted} style={{ marginTop: "0.25rem" }}>
              {listBasisHint}
            </p>
            {groupedByDay.length === 0 ? (
              <p className={styles.emptyHint}>Sem movimentações no período selecionado.</p>
            ) : (
              <div className={styles.dayGroups}>
                {groupedByDay.map((group) => (
                  <div key={group.day} className={styles.dayGroup}>
                    <h3 className={styles.dayTitle}>{formatDayLabel(group.day)}</h3>
                    <ul className={styles.entries}>
                      {group.items.map((e) => (
                        <li key={e.id} className={styles.entryRow}>
                          <div className={styles.entryMain}>
                            <strong>{e.description}</strong>
                            <div className={styles.entryMeta}>
                              <span className={`${styles.statusBadge} ${statusBadgeClass(e.status)}`}>{statusLabel(e.status)}</span>
                              <span>{e.entry_type === "income" ? "Entrada" : "Saída"}</span>
                              <span>{e.category_name ?? "Sem categoria"}</span>
                              <span>{e.payment_method ?? "—"}</span>
                              {e.payment_provider ? <span>{e.payment_provider}</span> : null}
                              {e.finance_account_id ? <span>Conta #{e.finance_account_id}</span> : null}
                              {e.credit_card_id ? <span>Cartão #{e.credit_card_id}</span> : null}
                              {e.recipient_whatsapp ? <span>WhatsApp: {formatPhoneBrDisplay(e.recipient_whatsapp)}</span> : null}
                              {e.gateway_payment_id ? <span>Asaas: {e.gateway_payment_id}</span> : null}
                              {e.competence_date ? <span>Competência {shortIso(e.competence_date)}</span> : null}
                              {e.expected_settlement_date ? <span>Caixa prev. {shortIso(e.expected_settlement_date)}</span> : null}
                              {(e.installment_total ?? 1) > 1 ? (
                                <span>
                                  Parcela {e.installment_number ?? 1}/{e.installment_total ?? 1}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className={styles.entryAmount}>
                            <strong className={e.entry_type === "income" ? styles.amountIncome : styles.amountExpense}>
                              {e.entry_type === "income" ? "+" : "-"} {money(e.amount)}
                            </strong>
                            <span>Líquido {money(e.net_amount)}</span>
                          </div>
                          <div className={styles.entryActions}>
                            {e.entry_type === "income" && !e.gateway_payment_id && gateways?.asaas.connected ? (
                              <button type="button" onClick={() => openChargeModal(e)}>
                                Cobrar Asaas
                              </button>
                            ) : null}
                            <button type="button" onClick={() => openEditModal(e)}>
                              Editar
                            </button>
                            {e.status !== "paid" ? (
                              <button type="button" onClick={() => void markAsPaid(e)}>
                                Baixar
                              </button>
                            ) : null}
                            {e.status !== "cancelled" ? (
                              <button type="button" onClick={() => void markAsCancelled(e)}>
                                Cancelar
                              </button>
                            ) : null}
                            <button type="button" className={styles.btnDanger} onClick={() => void removeEntry(e)}>
                              Excluir
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}

      {showNewEntry ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Novo lançamento financeiro">
          <div className={styles.modalCard}>
            <header className={styles.modalHeader}>
              <h3>Novo lançamento</h3>
              <button type="button" className={styles.modalClose} onClick={() => setShowNewEntry(false)}>
                Fechar
              </button>
            </header>
            <p className={styles.modalIntro}>
              Preencha os dados do lançamento. Os campos mudam automaticamente conforme o meio de pagamento.
            </p>
            <form className={styles.modalForm} onSubmit={submitEntry}>
              <label className={styles.modalField}>
                <span>Descrição</span>
                <input
                  placeholder="Ex.: Manutenção mensal cliente XPTO"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  autoComplete="off"
                  autoFocus
                />
              </label>
              <div className={styles.row2}>
                <label className={styles.modalField}>
                  <span>Tipo (entrada/saída)</span>
                  <select value={entryType} onChange={(e) => setEntryType(e.target.value as FinanceEntryType)}>
                    <option value="income">Entrada (receita)</option>
                    <option value="expense">Saída (despesa)</option>
                  </select>
                </label>
                <label className={styles.modalField}>
                  <span>Valor bruto (R$)</span>
                  <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </label>
              </div>
              <div className={styles.row2}>
                <label className={styles.modalField}>
                  <span>Vencimento (1ª parcela)</span>
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </label>
                <label className={styles.modalField}>
                  <span>Status inicial</span>
                  <select value={entryStatus} onChange={(e) => setEntryStatus(e.target.value as FinanceEntryStatus)}>
                    <option value="pending">Pendente</option>
                    <option value="paid">Pago</option>
                    <option value="overdue">Vencido</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </label>
              </div>
              {isIncome ? (
                <label className={styles.modalField}>
                  <span>Data competência (reconhecimento da receita)</span>
                  <input type="date" value={competenceDate} onChange={(e) => setCompetenceDate(e.target.value)} />
                </label>
              ) : null}
              <div className={styles.row2}>
                <label className={styles.modalField}>
                  <span>Meio de pagamento</span>
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    <option value="pix">PIX</option>
                    <option value="cash">Dinheiro</option>
                    <option value="credit_card">Cartão de crédito</option>
                    <option value="debit_card">Cartão de débito</option>
                    <option value="boleto">Boleto</option>
                  </select>
                </label>
                {showMachineField ? (
                  <label className={styles.modalField}>
                    <span>Maquininha</span>
                    <input
                      placeholder="Ex.: Stone"
                      value={paymentProvider}
                      list="provider-suggestions"
                      onChange={(e) => setPaymentProvider(e.target.value)}
                    />
                  </label>
                ) : (
                  <div />
                )}
              </div>
              <datalist id="provider-suggestions">
                {providerSuggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              {showMachineField ? (
                <>
                  <label className={styles.modalField}>
                    <span>Previsão de compensação (caixa)</span>
                    <select value={settlementPlan} onChange={(e) => setSettlementPlan(e.target.value as typeof settlementPlan)}>
                      <option value="same_as_due">No dia do vencimento da parcela</option>
                      <option value="next_business_day">D+1 útil após o vencimento da parcela</option>
                    </select>
                  </label>
                  <p className={styles.muted}>Taxa calculada automaticamente pela maquininha e parcelas. Valor bruto e taxas são divididos entre as parcelas.</p>
                </>
              ) : null}
              {showInstallmentsField ? (
                <div className={styles.row2}>
                  <label className={styles.modalField}>
                    <span>Parcelas</span>
                    <input type="number" min="1" max="24" step="1" value={installments} onChange={(e) => setInstallments(e.target.value)} />
                  </label>
                  <label className={styles.modalField}>
                    <span>Intervalo entre parcelas (meses)</span>
                    <input type="number" min="1" max="12" step="1" value={installmentIntervalMonths} onChange={(e) => setInstallmentIntervalMonths(e.target.value)} />
                  </label>
                </div>
              ) : null}
              {showBankAccountField || showCreditCardField ? (
                <div className={styles.row2}>
                  {showBankAccountField ? (
                    <label className={styles.modalField}>
                      <span>{isIncome ? "Banco de recebimento" : "Conta de saída"}</span>
                      <select value={financeAccountId} onChange={(e) => setFinanceAccountId(e.target.value)}>
                        <option value="">Selecionar conta</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={String(a.id)}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <div />
                  )}
                  {showCreditCardField ? (
                    <label className={styles.modalField}>
                      <span>Cartão do banco (saída)</span>
                      <select value={creditCardId} onChange={(e) => setCreditCardId(e.target.value)}>
                        <option value="">Selecionar cartão</option>
                        {cards.map((c) => (
                          <option key={c.id} value={String(c.id)}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <div />
                  )}
                </div>
              ) : null}
              <div className={styles.row2}>
                <label className={styles.modalField}>
                  <span>Categoria (gerenciar em Configurações)</span>
                  <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                    <option value="">Sem categoria</option>
                    {categories.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.modalField}>
                  <span>WhatsApp do cliente (opcional)</span>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={recipientWhatsapp}
                    onChange={(e) => setRecipientWhatsapp(formatPhoneBrInput(e.target.value))}
                    autoComplete="tel"
                    placeholder="(11) 9xxxx-xxxx"
                  />
                </label>
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.modalBtnGhost} onClick={() => setShowNewEntry(false)}>
                  Cancelar
                </button>
                <button type="submit" className={styles.modalBtnPrimary}>
                  Salvar lançamento
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {chargeModalEntry ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Emitir cobrança Asaas">
          <div className={styles.modalCard}>
            <header className={styles.modalHeader}>
              <h3>Emitir cobranca Asaas</h3>
              <button type="button" className={styles.modalClose} onClick={closeChargeModal} disabled={chargeSubmitting}>
                Fechar
              </button>
            </header>
            <p className={styles.modalIntro}>
              Lancamento: <strong>{chargeModalEntry.description}</strong> ({money(chargeModalEntry.amount)})
            </p>
            <form className={styles.modalForm} onSubmit={submitAsaasChargeModal}>
              <label className={styles.modalField}>
                <span>customer_id no Asaas</span>
                <input
                  value={chargeCustomerId}
                  onChange={(e) => setChargeCustomerId(e.target.value)}
                  placeholder="cus_000000000000"
                  autoFocus
                  disabled={chargeSubmitting}
                />
              </label>
              <label className={styles.modalField}>
                <span>Tipo de cobranca</span>
                <select
                  value={chargeBillingType}
                  onChange={(e) => setChargeBillingType(e.target.value as "PIX" | "BOLETO")}
                  disabled={chargeSubmitting}
                >
                  <option value="PIX">PIX</option>
                  <option value="BOLETO">Boleto</option>
                </select>
              </label>
              <div className={styles.modalActions}>
                <button type="button" className={styles.modalBtnGhost} onClick={closeChargeModal} disabled={chargeSubmitting}>
                  Cancelar
                </button>
                <button type="submit" className={styles.modalBtnPrimary} disabled={chargeSubmitting}>
                  {chargeSubmitting ? "Emitindo..." : "Emitir cobranca"}
                </button>
              </div>
            </form>
            {chargeResult ? (
              <div className={styles.modalResult}>
                <p>
                  Cobranca criada: <strong>{chargeResult.paymentId}</strong>
                </p>
                {chargeResult.invoiceUrl ? (
                  <p>
                    <a href={chargeResult.invoiceUrl} target="_blank" rel="noreferrer">
                      Abrir link da cobranca
                    </a>
                  </p>
                ) : (
                  <p className={styles.muted}>Sem URL publica retornada para este tipo de cobranca.</p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {editingEntry ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Editar lançamento">
          <div className={styles.modalCard}>
            <header className={styles.modalHeader}>
              <h3>Editar lançamento</h3>
              <button type="button" className={styles.modalClose} onClick={() => setEditingEntry(null)}>
                Fechar
              </button>
            </header>
            <form className={styles.modalForm} onSubmit={submitEditEntry}>
              <div className={styles.row2}>
                <label className={styles.modalField}>
                  <span>Valor</span>
                  <input type="number" min="0" step="0.01" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
                </label>
                <label className={styles.modalField}>
                  <span>Vencimento</span>
                  <input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} />
                </label>
              </div>
              <div className={styles.row2}>
                <label className={styles.modalField}>
                  <span>Status</span>
                  <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as FinanceEntryStatus)}>
                    <option value="pending">Pendente</option>
                    <option value="paid">Pago</option>
                    <option value="overdue">Vencido</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </label>
                {(editingEntry.installment_total ?? 1) > 1 ? (
                  <label className={styles.modalField}>
                    <span>Aplicar em</span>
                    <select value={editScope} onChange={(e) => setEditScope(e.target.value as "single" | "future" | "all")}>
                      <option value="single">Somente esta parcela</option>
                      <option value="future">Esta e futuras</option>
                      <option value="all">Todas as parcelas</option>
                    </select>
                  </label>
                ) : (
                  <div />
                )}
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.modalBtnGhost} onClick={() => setEditingEntry(null)}>
                  Cancelar
                </button>
                <button type="submit" className={styles.modalBtnPrimary}>
                  Salvar alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
