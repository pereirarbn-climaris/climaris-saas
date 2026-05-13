import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createFinanceCategory,
  createFinanceEntry,
  createFinanceEntryAsaasCharge,
  createFinanceEntryMercadoPagoPixCharge,
  createFinanceEntryMercadoPagoBoletoCharge,
  createFinanceEntryMercadoPagoPreference,
  deleteFinanceEntry,
  getFinanceBalanceSnapshot,
  getFinanceGateways,
  getFinanceSettings,
  listFinanceAccounts,
  listFinanceCreditCards,
  listFinancePaymentFees,
  listFinanceCategories,
  listFinanceEntries,
  patchFinanceEntry,
  type FinanceBalanceSnapshotOut,
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
import { NavIconX } from "../../components/dashboard/NavIcons";
import { mercadoPagoPreferenceCheckoutUrl } from "../../lib/mercadopagoHostedCheckout";
import {
  amountToCurrencyBrlInput,
  formatCurrencyBrlInput,
  parseCurrencyBrlInput,
} from "../../lib/brMask";
import styles from "./FinancePage.module.css";

function toDateInput(v: Date): string {
  return v.toISOString().slice(0, 10);
}

function money(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);
}

function shortIsoDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatIsoDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function basisShortLabel(basis: string): string {
  if (basis === "competence_date") return "competência";
  if (basis === "expected_settlement_date") return "previsão de caixa";
  return "vencimento";
}

function accountChipTooltip(
  accountName: string,
  snapshot: FinanceBalanceSnapshotOut,
  current: number,
  projected: number,
): string {
  const basis = basisShortLabel(snapshot.date_basis);
  return `${accountName}: saldo realizado até ${shortIsoDate(snapshot.as_of)} (${basis}) — ${money(current)} · projetado até ${shortIsoDate(snapshot.period_end)} — ${money(projected)}`;
}

export function FinancePage() {
  const navigate = useNavigate();
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
  const [amountDisplay, setAmountDisplay] = useState("");
  const [dueDate, setDueDate] = useState(toDateInput(now));
  const [listDateBasis, setListDateBasis] = useState<FinanceEntryDateBasis>("due_date");
  const [categoryId, setCategoryId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [paymentProvider, setPaymentProvider] = useState("");
  const [feePercent, setFeePercent] = useState("0");
  const [feeFixedAmount, setFeeFixedAmount] = useState("0");
  const [installments, setInstallments] = useState("1");
  const [financeAccountId, setFinanceAccountId] = useState("");
  const [creditCardId, setCreditCardId] = useState("");

  const [settings, setSettings] = useState<FinanceSettingsOut | null>(null);
  const [balanceSnapshot, setBalanceSnapshot] = useState<FinanceBalanceSnapshotOut | null>(null);
  /** Novo lançamento: marcar como já pago em vez de selector com 4 status */
  const [newEntryMarkPaid, setNewEntryMarkPaid] = useState(false);
  const [showNewEntry, setShowNewEntry] = useState(false);

  const [gateways, setGateways] = useState<FinanceGatewaysOut | null>(null);
  const [paymentFees, setPaymentFees] = useState<FinancePaymentFeeOut[]>([]);
  const [chargeModalEntry, setChargeModalEntry] = useState<FinanceEntryOut | null>(null);
  const [chargeCustomerId, setChargeCustomerId] = useState("");
  const [chargeBillingType, setChargeBillingType] = useState<"PIX" | "BOLETO">("PIX");
  const [chargeSubmitting, setChargeSubmitting] = useState(false);
  const [chargeResult, setChargeResult] = useState<{ paymentId: string; invoiceUrl: string | null } | null>(null);
  const [mpChargeModalEntry, setMpChargeModalEntry] = useState<FinanceEntryOut | null>(null);
  const [mpPayerEmail, setMpPayerEmail] = useState("");
  const [mpPayerFirstName, setMpPayerFirstName] = useState("");
  const [mpPayerLastName, setMpPayerLastName] = useState("");
  const [mpChargeSubmitting, setMpChargeSubmitting] = useState(false);
  const [mpChargeResult, setMpChargeResult] = useState<{
    paymentId: string;
    paymentStatus: string;
    ticketUrl: string | null;
    pixCopyPaste: string | null;
  } | null>(null);
  const [mpBoletoModalEntry, setMpBoletoModalEntry] = useState<FinanceEntryOut | null>(null);
  const [mpBoletoEmail, setMpBoletoEmail] = useState("");
  const [mpBoletoCpf, setMpBoletoCpf] = useState("");
  const [mpBoletoFirstName, setMpBoletoFirstName] = useState("");
  const [mpBoletoLastName, setMpBoletoLastName] = useState("");
  const [mpBoletoSubmitting, setMpBoletoSubmitting] = useState(false);
  const [mpBoletoResult, setMpBoletoResult] = useState<{
    paymentId: string;
    paymentStatus: string;
    ticketUrl: string | null;
  } | null>(null);
  const [mpPrefModalEntry, setMpPrefModalEntry] = useState<FinanceEntryOut | null>(null);
  const [mpPrefMode, setMpPrefMode] = useState<"checkout_pro" | "payment_link" | "subscription">("checkout_pro");
  const [mpPrefEmail, setMpPrefEmail] = useState("");
  const [mpPrefSuccessUrl, setMpPrefSuccessUrl] = useState("");
  const [mpPrefSubmitting, setMpPrefSubmitting] = useState(false);
  const [clearMpPrefSubmittingEntryId, setClearMpPrefSubmittingEntryId] = useState<number | null>(null);
  const [mpPrefResult, setMpPrefResult] = useState<{
    checkoutUrl: string;
    preferenceId: string;
    sandbox: boolean;
  } | null>(null);
  const [editingEntry, setEditingEntry] = useState<FinanceEntryOut | null>(null);
  const [editDeletePhase, setEditDeletePhase] = useState<"idle" | "choose-scope">("idle");
  const [editDescription, setEditDescription] = useState("");
  const [editAmountDisplay, setEditAmountDisplay] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editCompetenceDate, setEditCompetenceDate] = useState("");
  const [editStatus, setEditStatus] = useState<FinanceEntryStatus>("pending");
  const [editPaymentMethod, setEditPaymentMethod] = useState("pix");
  const [editPaymentProvider, setEditPaymentProvider] = useState("");
  const [editFinanceAccountId, setEditFinanceAccountId] = useState("");
  const [editCreditCardId, setEditCreditCardId] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editScope, setEditScope] = useState<"single" | "future" | "all">("single");
  const isIncome = entryType === "income";
  const showMachineField = isIncome && (paymentMethod === "credit_card" || paymentMethod === "debit_card");
  const showBankAccountField =
    paymentMethod === "pix" ||
    (isIncome && paymentMethod === "boleto") ||
    (!isIncome && paymentMethod === "debit_card");
  const showCreditCardField = !isIncome && paymentMethod === "credit_card";
  const showInstallmentsField = paymentMethod === "credit_card" || paymentMethod === "boleto";

  const editEt = editingEntry?.entry_type;
  const editInc = editEt === "income";
  const editShowMachineField = Boolean(editInc && (editPaymentMethod === "credit_card" || editPaymentMethod === "debit_card"));
  const editShowBankAccountField =
    editingEntry != null &&
    (editPaymentMethod === "pix" ||
      (editInc && editPaymentMethod === "boleto") ||
      (!editInc && editPaymentMethod === "debit_card"));
  const editShowCreditCardField = editingEntry != null && !editInc && editPaymentMethod === "credit_card";

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

  async function pickCategoryOption(raw: string, setField: (id: string) => void) {
    if (raw !== "__new__") {
      setField(raw);
      return;
    }
    const name = window.prompt("Nome da nova categoria");
    if (!name?.trim()) return;
    try {
      const created = await createFinanceCategory({ name: name.trim() });
      setCategories((prev) =>
        [...prev.filter((c) => c.id !== created.id), { id: created.id, name: created.name }].sort((a, b) =>
          a.name.localeCompare(b.name, "pt-BR"),
        ),
      );
      setField(String(created.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível criar categoria.");
    }
  }

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
        setBalanceSnapshot(null);
        return;
      }
      const [e, c, gw, fees, accs, ccs, snap] = await Promise.all([
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
        getFinanceBalanceSnapshot({ end_date: endDate, date_basis: listDateBasis }),
      ]);
      setGateways(gw);
      setEntries(e);
      setCategories(c.map((x) => ({ id: x.id, name: x.name })));
      setPaymentFees(fees);
      setAccounts(accs);
      setCards(ccs);
      setBalanceSnapshot(snap);
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
    if (!editShowMachineField) return;
    setEditPaymentProvider((prev) => (prev.trim().toLowerCase() === "caixa" ? "" : prev));
  }, [editPaymentMethod, editShowMachineField]);

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
    } else {
      setPaymentProvider((prev) => (prev.trim().toLowerCase() === "caixa" ? "" : prev));
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
    }
  }, [paymentMethod, entryType, showMachineField, showBankAccountField, showCreditCardField, showInstallmentsField]);

  async function submitEntry(ev: FormEvent) {
    ev.preventDefault();
    const amountNum = parseCurrencyBrlInput(amountDisplay);
    if (!description.trim() || !(amountNum > 0)) return;
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
        recipient_whatsapp: null,
        installments: installmentsNum,
        installment_interval_months: 1,
        finance_account_id: financeAccountId ? Number(financeAccountId) : null,
        credit_card_id: creditCardId ? Number(creditCardId) : null,
        due_date: dueDate,
        competence_date: isIncome ? dueDate : undefined,
        category_id: categoryId ? Number(categoryId) : null,
        status: newEntryMarkPaid ? "paid" : "pending",
      });
      setDescription("");
      setAmountDisplay("");
      setCategoryId("");
      setNewEntryMarkPaid(false);
      setPaymentMethod("pix");
      setPaymentProvider("");
      setFeePercent("0");
      setFeeFixedAmount("0");
      setInstallments("1");
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

  function closeEditModal() {
    setEditingEntry(null);
    setEditDeletePhase("idle");
  }

  function openEditModal(entry: FinanceEntryOut) {
    setEditDeletePhase("idle");
    setEditingEntry(entry);
    setEditDescription(entry.description ?? "");
    setEditAmountDisplay(amountToCurrencyBrlInput(Number(entry.amount ?? 0)));
    setEditDueDate(entry.due_date);
    setEditCompetenceDate(entry.competence_date ?? entry.due_date);
    setEditStatus(entry.status);
    setEditPaymentMethod((entry.payment_method || "pix").toLowerCase());
    setEditPaymentProvider(entry.payment_provider?.trim() ?? "");
    setEditFinanceAccountId(entry.finance_account_id != null ? String(entry.finance_account_id) : "");
    setEditCreditCardId(entry.credit_card_id != null ? String(entry.credit_card_id) : "");
    setEditCategoryId(entry.category_id != null ? String(entry.category_id) : "");
    setEditNotes(entry.notes?.trim() ?? "");
    setEditScope("single");
  }

  function handleDeleteClick() {
    if (!editingEntry) return;
    const total = editingEntry.installment_total ?? 1;
    if (total <= 1) {
      if (!window.confirm(`Excluir "${editingEntry.description}"? Esta ação não pode ser desfeita.`)) return;
      void runDeleteWithScope("single");
      return;
    }
    setEditDeletePhase("choose-scope");
  }

  async function runDeleteWithScope(scope: "single" | "future" | "all") {
    if (!editingEntry) return;
    setError(null);
    try {
      await deleteFinanceEntry(editingEntry.id, { edit_scope: scope });
      closeEditModal();
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível excluir lançamento.");
    }
  }

  async function submitEditEntry(ev: FormEvent) {
    ev.preventDefault();
    if (!editingEntry || editDeletePhase === "choose-scope") return;
    const amt = parseCurrencyBrlInput(editAmountDisplay);
    if (!(amt > 0)) {
      setError("Informe um valor válido.");
      return;
    }
    setError(null);
    try {
      await patchFinanceEntry(editingEntry.id, {
        description: editDescription.trim(),
        amount: amt,
        due_date: editDueDate,
        competence_date: editInc ? editCompetenceDate : undefined,
        status: editStatus,
        payment_method: editPaymentMethod || null,
        payment_provider: editShowMachineField ? editPaymentProvider.trim() || null : null,
        finance_account_id: editFinanceAccountId ? Number(editFinanceAccountId) : null,
        credit_card_id: editCreditCardId ? Number(editCreditCardId) : null,
        category_id: editCategoryId ? Number(editCategoryId) : null,
        recipient_whatsapp: null,
        notes: editNotes.trim() || null,
        edit_scope: editScope,
      });
      closeEditModal();
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
    if (entry.gateway_preference_id) {
      setError(
        "Este lançamento possui checkout Mercado Pago pendente. Remova a preferência no lançamento ou conclua o pagamento antes de cobrar no Asaas.",
      );
      return;
    }
    if (entry.gateway_payment_id) {
      setError("Este lançamento já está vinculado a uma cobrança.");
      return;
    }
    setChargeModalEntry(entry);
    setChargeCustomerId("");
    setChargeBillingType("PIX");
    setChargeResult(null);
  }

  function openMpChargeModal(entry: FinanceEntryOut) {
    if (!gateways?.mercadopago.connected) {
      setError("Conecte o Mercado Pago antes de emitir cobrança.");
      return;
    }
    if (!gateways.mercadopago.products?.pix) {
      setError('Ative "Recebimento via Pix" em Contas e carteiras → Configurar conta (Mercado Pago).');
      return;
    }
    if (entry.gateway_preference_id) {
      setError(
        "Este lançamento possui checkout Mercado Pago pendente. Remova a preferência no lançamento ou use outro lançamento para emitir PIX.",
      );
      return;
    }
    if (entry.gateway_payment_id) {
      setError("Este lançamento já está vinculado a uma cobrança.");
      return;
    }
    setMpChargeModalEntry(entry);
    setMpPayerEmail("");
    setMpPayerFirstName("");
    setMpPayerLastName("");
    setMpChargeResult(null);
  }

  function openMpBoletoChargeModal(entry: FinanceEntryOut) {
    if (!gateways?.mercadopago.connected) {
      setError("Conecte o Mercado Pago antes de emitir boleto.");
      return;
    }
    if (!gateways.mercadopago.products?.boleto) {
      setError('Ative "Boleto" em Contas e carteiras → Mercado Pago.');
      return;
    }
    if (entry.gateway_preference_id) {
      setError(
        "Este lançamento possui checkout Mercado Pago pendente. Remova a preferência no lançamento ou use outro lançamento para emitir boleto.",
      );
      return;
    }
    if (entry.gateway_payment_id) {
      setError("Este lançamento já está vinculado a uma cobrança.");
      return;
    }
    setMpBoletoModalEntry(entry);
    setMpBoletoEmail("");
    setMpBoletoCpf("");
    setMpBoletoFirstName("");
    setMpBoletoLastName("");
    setMpBoletoResult(null);
  }

  function openMpPreferenceModal(entry: FinanceEntryOut, mode: "checkout_pro" | "payment_link" | "subscription") {
    if (!gateways?.mercadopago.connected) {
      setError("Conecte o Mercado Pago antes de gerar o checkout.");
      return;
    }
    if (mode === "checkout_pro" && !gateways.mercadopago.products?.checkout_pro) {
      setError('Ative "Checkout Pro / Transparente" na conta Mercado Pago.');
      return;
    }
    if (mode === "payment_link" && !gateways.mercadopago.products?.payment_link) {
      setError('Ative "Link de Pagamento" na conta Mercado Pago.');
      return;
    }
    if (mode === "subscription" && !gateways.mercadopago.products?.subscriptions) {
      setError('Ative "Assinaturas (recorrência)" na conta Mercado Pago.');
      return;
    }
    if (entry.gateway_payment_id) {
      setError(
        "Este lançamento já está vinculado a uma cobrança de gateway (ex.: PIX). Crie outro lançamento para usar checkout ou link.",
      );
      return;
    }
    setMpPrefModalEntry(entry);
    setMpPrefMode(mode);
    setMpPrefEmail("");
    setMpPrefSuccessUrl("");
    setMpPrefResult(null);
  }

  function closeChargeModal() {
    if (chargeSubmitting) return;
    setChargeModalEntry(null);
    setChargeCustomerId("");
    setChargeBillingType("PIX");
    setChargeResult(null);
  }

  function closeMpChargeModal() {
    if (mpChargeSubmitting) return;
    setMpChargeModalEntry(null);
    setMpPayerEmail("");
    setMpPayerFirstName("");
    setMpPayerLastName("");
    setMpChargeResult(null);
  }

  function closeMpBoletoChargeModal() {
    if (mpBoletoSubmitting) return;
    setMpBoletoModalEntry(null);
    setMpBoletoEmail("");
    setMpBoletoCpf("");
    setMpBoletoFirstName("");
    setMpBoletoLastName("");
    setMpBoletoResult(null);
  }

  function closeMpPreferenceModal() {
    if (mpPrefSubmitting) return;
    setMpPrefModalEntry(null);
    setMpPrefEmail("");
    setMpPrefSuccessUrl("");
    setMpPrefResult(null);
  }

  async function removeMercadoPagoPreference(entry: FinanceEntryOut) {
    if (!entry.gateway_preference_id || entry.gateway_payment_id) return;
    setClearMpPrefSubmittingEntryId(entry.id);
    setError(null);
    try {
      await patchFinanceEntry(entry.id, { gateway_preference_id: null });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível remover a preferência.");
    } finally {
      setClearMpPrefSubmittingEntryId(null);
    }
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

  async function submitMpChargeModal(ev: FormEvent) {
    ev.preventDefault();
    if (!mpChargeModalEntry) return;
    if (!mpPayerEmail.trim()) {
      setError("Informe o e-mail do pagador (exigido pelo Mercado Pago para PIX).");
      return;
    }
    setMpChargeSubmitting(true);
    setError(null);
    try {
      const r = await createFinanceEntryMercadoPagoPixCharge(mpChargeModalEntry.id, {
        payer_email: mpPayerEmail.trim(),
        payer_first_name: mpPayerFirstName.trim() || null,
        payer_last_name: mpPayerLastName.trim() || null,
      });
      setMpChargeResult({
        paymentId: r.payment_id,
        paymentStatus: r.payment_status,
        ticketUrl: r.ticket_url,
        pixCopyPaste: r.pix_copy_paste,
      });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível emitir cobrança no Mercado Pago.");
    } finally {
      setMpChargeSubmitting(false);
    }
  }

  async function submitMpBoletoChargeModal(ev: FormEvent) {
    ev.preventDefault();
    if (!mpBoletoModalEntry) return;
    const digits = mpBoletoCpf.replace(/\D/g, "");
    if (digits.length !== 11) {
      setError("Informe um CPF válido (11 dígitos).");
      return;
    }
    if (!mpBoletoEmail.trim()) {
      setError("Informe o e-mail do pagador.");
      return;
    }
    setMpBoletoSubmitting(true);
    setError(null);
    try {
      const r = await createFinanceEntryMercadoPagoBoletoCharge(mpBoletoModalEntry.id, {
        payer_email: mpBoletoEmail.trim(),
        payer_cpf: digits,
        payer_first_name: mpBoletoFirstName.trim() || null,
        payer_last_name: mpBoletoLastName.trim() || null,
      });
      setMpBoletoResult({
        paymentId: r.payment_id,
        paymentStatus: r.payment_status,
        ticketUrl: r.ticket_url,
      });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível emitir boleto no Mercado Pago.");
    } finally {
      setMpBoletoSubmitting(false);
    }
  }

  async function submitMpPreferenceModal(ev: FormEvent) {
    ev.preventDefault();
    if (!mpPrefModalEntry) return;
    if (mpPrefMode === "subscription" && !mpPrefEmail.trim()) {
      setError("Assinatura: informe o e-mail do pagador.");
      return;
    }
    setMpPrefSubmitting(true);
    setError(null);
    try {
      const r = await createFinanceEntryMercadoPagoPreference(mpPrefModalEntry.id, {
        mode: mpPrefMode,
        payer_email: mpPrefEmail.trim() || null,
        success_url: mpPrefSuccessUrl.trim() || null,
        ...(mpPrefMode === "subscription"
          ? { subscription_frequency: 1, subscription_frequency_type: "months" as const }
          : {}),
      });
      setMpPrefResult({
        checkoutUrl: r.checkout_url,
        preferenceId: r.preference_id,
        sandbox: r.sandbox,
      });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível criar o checkout.");
    } finally {
      setMpPrefSubmitting(false);
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

  return (
    <section className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderRow}>
          <div>
            <h1 className={styles.pageTitle}>Financeiro</h1>
            {settings ? (
              <p className={styles.pageSub}>
                Modo <strong>{modeLabel(settings.effective_mode)}</strong> — entradas, saídas e saldos por período.
              </p>
            ) : (
              <p className={styles.pageSub}>Carregando…</p>
            )}
          </div>
        </div>
      </header>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {settings && !settings.finance_enabled ? (
        <section className={styles.panel}>
          <p className={styles.locked}>
            O financeiro está desativado. Ative em{" "}
            <Link to="/app/finance/settings" className={styles.inlineConfigLink}>
              Configurações do Financeiro
            </Link>
            .
          </p>
        </section>
      ) : null}

      {settings?.finance_enabled !== false ? (
        <>
          {balanceSnapshot ? (
            <section
              className={styles.balanceSection}
              aria-label="Saldos das contas"
              aria-busy={loading}
            >
              <div className={styles.balanceToolbar}>
                <h2 className={styles.balanceHeading}>Resumo de saldos</h2>
                <button
                  type="button"
                  className={styles.refreshBtn}
                  onClick={() => void loadAll()}
                  disabled={loading}
                  aria-busy={loading}
                  aria-label={loading ? "Atualizando dados financeiros" : "Atualizar saldos e movimentações"}
                >
                  {loading ? "Atualizando…" : "Atualizar"}
                </button>
              </div>
              {loading ? <div className={styles.loadingStrip} aria-hidden /> : null}
              <div className={styles.balanceMainCards}>
                <article
                  className={`${styles.balanceCard} ${styles.balanceCardCurrent}`}
                  title={`Saldo realizado: soma das contas com lançamentos já pagos até ${shortIsoDate(balanceSnapshot.as_of)}, usando ${basisShortLabel(balanceSnapshot.date_basis)} como data de referência.`}
                >
                  <span className={styles.balanceCardLabel}>Saldo em conta</span>
                  <span className={styles.balanceCardValue}>{money(balanceSnapshot.current_balance_total)}</span>
                  <span className={styles.balanceCardHint}>
                    Realizado até {shortIsoDate(balanceSnapshot.as_of)} (lançamentos pagos, critério:{" "}
                    {basisShortLabel(balanceSnapshot.date_basis)}).
                  </span>
                </article>
                <article
                  className={`${styles.balanceCard} ${styles.balanceCardProjected}`}
                  title={`Projeção até ${shortIsoDate(balanceSnapshot.period_end)}: inclui todos os lançamentos não cancelados cuja data (${basisShortLabel(balanceSnapshot.date_basis)}) cai até essa data — pagos ou pendentes.`}
                >
                  <span className={styles.balanceCardLabel}>Saldo projetado</span>
                  <span className={styles.balanceCardValue}>{money(balanceSnapshot.projected_balance_total)}</span>
                  <span className={styles.balanceCardHint}>
                    Inclui pendências e vencidas até {shortIsoDate(balanceSnapshot.period_end)} — mesmo critério de data do
                    período.
                  </span>
                </article>
              </div>
              {balanceSnapshot.accounts.length > 0 ? (
                <div className={styles.accountBalances}>
                  <span className={styles.accountBalancesTitle}>Por conta</span>
                  <div className={styles.accountBalancesScroll}>
                    {balanceSnapshot.accounts.map((a) => (
                      <div
                        key={a.id}
                        className={styles.accountBalanceChip}
                        title={accountChipTooltip(a.name, balanceSnapshot, a.current_balance, a.projected_balance)}
                      >
                        <span className={styles.accountBalanceName}>{a.name}</span>
                        <span className={styles.accountBalanceValues}>
                          <span className={styles.accountBalanceMono}>{money(a.current_balance)}</span>
                          <span className={styles.accountBalanceArrow} aria-hidden>
                            →
                          </span>
                          <span className={styles.accountBalanceMono}>{money(a.projected_balance)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

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

          <section className={styles.entriesSection}>
            <div className={styles.entriesHead}>
              <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
                Movimentações (entradas e saídas)
              </h2>
              {loading ? <span className={styles.muted}>Atualizando…</span> : null}
            </div>
            <div className={styles.filtersBar} role="group" aria-label="Filtros do período das movimentações">
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
              <div className={styles.filtersDates}>
                <label className={styles.fieldCompact}>
                  <span>De</span>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </label>
                <label className={styles.fieldCompact}>
                  <span>Até</span>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </label>
              </div>
              <label className={`${styles.fieldCompact} ${styles.fieldPeriod}`}>
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
              <div className={styles.filtersBarAction}>
                <button
                  type="button"
                  className={styles.filtersBarNewBtn}
                  onClick={() => {
                    setShowNewEntry(true);
                  }}
                >
                  Novo lançamento
                </button>
              </div>
            </div>
            <p className={styles.muted} style={{ marginTop: "0.35rem" }}>
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
                          <button
                            type="button"
                            className={styles.entryClickArea}
                            onClick={() => openEditModal(e)}
                            aria-label={`Editar lançamento: ${e.description}`}
                          >
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
                                {e.gateway_payment_id ? (
                                  <span>
                                    {e.payment_provider === "mercadopago" ? "Mercado Pago" : "Gateway"}: {e.gateway_payment_id}
                                  </span>
                                ) : null}
                                {e.gateway_preference_id ? (
                                  <span>Preferência MP: {e.gateway_preference_id}</span>
                                ) : null}
                                {e.mercadopago_archived_preference_id ? (
                                  <span className={styles.muted}>Preferência MP (arquivada): {e.mercadopago_archived_preference_id}</span>
                                ) : null}
                                {e.mercadopago_preapproval_id ? (
                                  <span className={styles.muted}>Assinatura MP: {e.mercadopago_preapproval_id}</span>
                                ) : null}
                                {e.competence_date ? <span>Competência {shortIsoDate(e.competence_date)}</span> : null}
                                {e.expected_settlement_date ? <span>Caixa prev. {shortIsoDate(e.expected_settlement_date)}</span> : null}
                                {(e.installment_total ?? 1) > 1 ? (
                                  <span>
                                    Parcela {e.installment_number ?? 1}/{e.installment_total ?? 1}
                                  </span>
                                ) : null}
                              </div>
                              {e.mp_reversal_at ? (
                                <p className={styles.mpReversalNote} role="status">
                                  {e.mp_reversal_status === "in_mediation" ? (
                                    <>
                                      Contestação em análise no Mercado Pago desde {formatIsoDateTime(e.mp_reversal_at)}. O
                                      lançamento permanece <strong>pago</strong> até o desfecho; acompanhe no painel do MP.
                                    </>
                                  ) : e.mp_reversal_status === "partially_refunded" ? (
                                    <>
                                      Devolução parcial registrada pelo Mercado Pago em {formatIsoDateTime(e.mp_reversal_at)}.
                                      Confira o valor no MP e reconcilie com o extrato antes de ajustar manualmente o
                                      lançamento.
                                    </>
                                  ) : (
                                    <>
                                      Estorno ou devolução registrada pelo Mercado Pago em {formatIsoDateTime(e.mp_reversal_at)}
                                      {e.mp_reversal_status ? ` (${e.mp_reversal_status}).` : "."} Confira no MP; se o valor foi
                                      restituído, use <strong>Baixar</strong> apenas após reconciliar com o extrato, ou marque
                                      manualmente conforme sua política interna.
                                    </>
                                  )}
                                </p>
                              ) : null}
                            </div>
                            <div className={styles.entryAmount}>
                              <strong className={e.entry_type === "income" ? styles.amountIncome : styles.amountExpense}>
                                {e.entry_type === "income" ? "+" : "-"} {money(e.amount)}
                              </strong>
                              <span>Líquido {money(e.net_amount)}</span>
                            </div>
                          </button>
                          {e.entry_type === "income" && !e.gateway_payment_id && (gateways?.asaas.connected || gateways?.mercadopago.connected) ? (
                            <div className={styles.entryQuickActions}>
                              {e.gateway_preference_id ? (
                                <button
                                  type="button"
                                  disabled={clearMpPrefSubmittingEntryId === e.id}
                                  onClick={() => void removeMercadoPagoPreference(e)}
                                >
                                  Remover preferência MP
                                </button>
                              ) : null}
                              {e.gateway_preference_id && gateways?.mercadopago.connected ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const u = mercadoPagoPreferenceCheckoutUrl(
                                        e.gateway_preference_id!,
                                        Boolean(gateways.mercadopago.sandbox),
                                      );
                                      window.open(u, "_blank", "noopener,noreferrer");
                                    }}
                                  >
                                    MP — nova aba
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigate(
                                        `/app/finance/mercadopago-wallet?preference_id=${encodeURIComponent(e.gateway_preference_id!)}`,
                                      );
                                    }}
                                  >
                                    MP — pagar no site (Wallet)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const u = mercadoPagoPreferenceCheckoutUrl(
                                        e.gateway_preference_id!,
                                        Boolean(gateways.mercadopago.sandbox),
                                      );
                                      navigate(`/app/finance/mercadopago-checkout?checkout_url=${encodeURIComponent(u)}`);
                                    }}
                                  >
                                    MP — página com iframe
                                  </button>
                                </>
                              ) : null}
                              {gateways?.asaas.connected ? (
                                <button type="button" onClick={() => openChargeModal(e)}>
                                  Cobrar Asaas
                                </button>
                              ) : null}
                              {gateways?.mercadopago.connected && gateways.mercadopago.products?.pix ? (
                                <button type="button" onClick={() => openMpChargeModal(e)}>
                                  Cobrar MP (Pix)
                                </button>
                              ) : null}
                              {gateways?.mercadopago.connected && gateways.mercadopago.products?.boleto ? (
                                <button type="button" onClick={() => openMpBoletoChargeModal(e)}>
                                  Cobrar MP (Boleto)
                                </button>
                              ) : null}
                              {gateways?.mercadopago.connected && gateways.mercadopago.products?.checkout_pro ? (
                                <button type="button" onClick={() => openMpPreferenceModal(e, "checkout_pro")}>
                                  Checkout MP
                                </button>
                              ) : null}
                              {gateways?.mercadopago.connected && gateways.mercadopago.products?.payment_link ? (
                                <button type="button" onClick={() => openMpPreferenceModal(e, "payment_link")}>
                                  Link MP
                                </button>
                              ) : null}
                              {gateways?.mercadopago.connected && gateways.mercadopago.products?.subscriptions ? (
                                <button type="button" onClick={() => openMpPreferenceModal(e, "subscription")}>
                                  Assinatura MP
                                </button>
                              ) : null}
                              {e.status !== "paid" ? (
                                <button type="button" onClick={() => void markAsPaid(e)}>
                                  Baixar
                                </button>
                              ) : null}
                            </div>
                          ) : e.status !== "paid" ? (
                            <div className={styles.entryQuickActions}>
                              <button type="button" onClick={() => void markAsPaid(e)}>
                                Baixar
                              </button>
                            </div>
                          ) : null}
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
          <div className={`${styles.modalCard} ${styles.modalCardFinance}`}>
            <header className={styles.modalHeader}>
              <div className={styles.modalTitleBlock}>
                <h3>Novo lançamento</h3>
                <p className={styles.modalSubtitle}>Registre valores que entram ou saem das contas do workspace.</p>
              </div>
              <button type="button" className={styles.modalClose} onClick={() => setShowNewEntry(false)}>
                Fechar
              </button>
            </header>
            <form className={styles.modalFormFinance} onSubmit={submitEntry}>
              <div className={styles.modalSection}>
                <div className={styles.modalSectionLabel}>Dados principais</div>
                <label className={styles.modalField}>
                  <span>Descrição</span>
                  <input
                    placeholder="Ex.: OS #12 — manutenção contrato mensal"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    autoComplete="off"
                    autoFocus
                  />
                </label>
                <div className={styles.modalGridTipoPaid}>
                  <label className={styles.modalField}>
                    <span>Tipo</span>
                    <select value={entryType} onChange={(e) => setEntryType(e.target.value as FinanceEntryType)}>
                      <option value="income">Receita</option>
                      <option value="expense">Despesa</option>
                    </select>
                  </label>
                  <label className={styles.modalCheck}>
                    <input
                      type="checkbox"
                      checked={newEntryMarkPaid}
                      onChange={(e) => setNewEntryMarkPaid(e.target.checked)}
                    />
                    <span>Já está pago ou liquidado</span>
                  </label>
                </div>
                <div className={styles.modalValorVencGrid}>
                  <div className={styles.modalField}>
                    <span>Valor</span>
                    <div className={styles.moneyInputWrap}>
                      <span className={styles.moneyPrefix}>R$</span>
                      <input
                        inputMode="numeric"
                        value={amountDisplay}
                        onChange={(e) => setAmountDisplay(formatCurrencyBrlInput(e.target.value))}
                        aria-label="Valor em reais"
                      />
                    </div>
                  </div>
                  <label className={styles.modalField}>
                    <span>Vencimento</span>
                    <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </label>
                </div>
              </div>

              <div className={styles.modalSection}>
                <div className={styles.modalSectionLabel}>Pagamento</div>
                <div className={styles.row2}>
                  <label className={styles.modalField}>
                    <span>Meio</span>
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
                      <select value={paymentProvider} onChange={(e) => setPaymentProvider(e.target.value)}>
                        <option value="">Selecionar</option>
                        {paymentProvider && !providerSuggestions.some((n) => n === paymentProvider) ? (
                          <option value={paymentProvider}>{paymentProvider}</option>
                        ) : null}
                        {providerSuggestions.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <div />
                  )}
                </div>
                {showMachineField ? (
                  <p className={styles.modalHintLine}>
                    {providerSuggestions.length === 0
                      ? "Nenhuma maquininha nas taxas ainda. Cadastre taxas por provedor em Financeiro para preencher a lista."
                      : "Taxas e parcelas seguem o cadastro de cada maquininha."}
                  </p>
                ) : null}
                {showInstallmentsField ? (
                  <label className={styles.modalField}>
                    <span>Parcelas</span>
                    <input type="number" min="1" max="24" step="1" value={installments} onChange={(e) => setInstallments(e.target.value)} />
                  </label>
                ) : null}
                {showBankAccountField || showCreditCardField ? (
                  <div className={styles.row2}>
                    {showBankAccountField ? (
                      <label className={styles.modalField}>
                        <span>{isIncome ? "Conta de recebimento" : "Conta de saída"}</span>
                        <select value={financeAccountId} onChange={(e) => setFinanceAccountId(e.target.value)}>
                          <option value="">Selecionar</option>
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
                        <span>Cartão</span>
                        <select value={creditCardId} onChange={(e) => setCreditCardId(e.target.value)}>
                          <option value="">Selecionar</option>
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
                <label className={styles.modalField}>
                  <span>Categoria</span>
                  <select
                    value={categoryId}
                    onChange={(e) => void pickCategoryOption(e.target.value, setCategoryId)}
                  >
                    <option value="">Nenhuma</option>
                    <option value="__new__">+ Nova categoria…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className={styles.modalActions}>
                <button type="button" className={styles.modalBtnGhost} onClick={() => setShowNewEntry(false)}>
                  Descartar
                </button>
                <button type="submit" className={styles.modalBtnPrimary}>
                  Salvar
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

      {mpChargeModalEntry ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Emitir cobrança Mercado Pago PIX">
          <div className={styles.modalCard}>
            <header className={styles.modalHeader}>
              <h3>Cobrança Mercado Pago (PIX)</h3>
              <button type="button" className={styles.modalClose} onClick={closeMpChargeModal} disabled={mpChargeSubmitting}>
                Fechar
              </button>
            </header>
            <p className={styles.modalIntro}>
              Lançamento: <strong>{mpChargeModalEntry.description}</strong> ({money(mpChargeModalEntry.amount)})
            </p>
            <form className={styles.modalForm} onSubmit={submitMpChargeModal}>
              <label className={styles.modalField}>
                <span>E-mail do pagador</span>
                <input
                  type="email"
                  value={mpPayerEmail}
                  onChange={(e) => setMpPayerEmail(e.target.value)}
                  placeholder="cliente@email.com"
                  autoFocus
                  disabled={mpChargeSubmitting}
                  autoComplete="email"
                />
              </label>
              <label className={styles.modalField}>
                <span>Nome (opcional)</span>
                <input
                  value={mpPayerFirstName}
                  onChange={(e) => setMpPayerFirstName(e.target.value)}
                  placeholder="Nome"
                  disabled={mpChargeSubmitting}
                />
              </label>
              <label className={styles.modalField}>
                <span>Sobrenome (opcional)</span>
                <input
                  value={mpPayerLastName}
                  onChange={(e) => setMpPayerLastName(e.target.value)}
                  placeholder="Sobrenome"
                  disabled={mpChargeSubmitting}
                />
              </label>
              <div className={styles.modalActions}>
                <button type="button" className={styles.modalBtnGhost} onClick={closeMpChargeModal} disabled={mpChargeSubmitting}>
                  Cancelar
                </button>
                <button type="submit" className={styles.modalBtnPrimary} disabled={mpChargeSubmitting}>
                  {mpChargeSubmitting ? "Emitindo..." : "Emitir PIX"}
                </button>
              </div>
            </form>
            {mpChargeResult ? (
              <div className={styles.modalResult}>
                <p>
                  Pagamento: <strong>{mpChargeResult.paymentId}</strong> ({mpChargeResult.paymentStatus})
                </p>
                {mpChargeResult.ticketUrl ? (
                  <p>
                    <a href={mpChargeResult.ticketUrl} target="_blank" rel="noreferrer">
                      Abrir página do PIX
                    </a>
                  </p>
                ) : null}
                {mpChargeResult.pixCopyPaste ? (
                  <div>
                    <p className={styles.muted}>Copia e cola (PIX)</p>
                    <pre className={styles.pixPayload}>{mpChargeResult.pixCopyPaste}</pre>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {mpBoletoModalEntry ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Emitir boleto Mercado Pago">
          <div className={styles.modalCard}>
            <header className={styles.modalHeader}>
              <h3>Cobrança Mercado Pago (Boleto)</h3>
              <button type="button" className={styles.modalClose} onClick={closeMpBoletoChargeModal} disabled={mpBoletoSubmitting}>
                Fechar
              </button>
            </header>
            <p className={styles.modalIntro}>
              Lançamento: <strong>{mpBoletoModalEntry.description}</strong> ({money(mpBoletoModalEntry.amount)})
            </p>
            <p className={styles.muted} style={{ marginTop: 0 }}>
              Vencimento do boleto: data de vencimento do lançamento (ou +3 dias se já estiver vencida).
            </p>
            <form className={styles.modalForm} onSubmit={submitMpBoletoChargeModal}>
              <label className={styles.modalField}>
                <span>E-mail do pagador</span>
                <input
                  type="email"
                  value={mpBoletoEmail}
                  onChange={(e) => setMpBoletoEmail(e.target.value)}
                  placeholder="cliente@email.com"
                  autoFocus
                  disabled={mpBoletoSubmitting}
                  autoComplete="email"
                />
              </label>
              <label className={styles.modalField}>
                <span>CPF do pagador</span>
                <input
                  value={mpBoletoCpf}
                  onChange={(e) => setMpBoletoCpf(e.target.value)}
                  placeholder="000.000.000-00"
                  disabled={mpBoletoSubmitting}
                  autoComplete="off"
                />
              </label>
              <label className={styles.modalField}>
                <span>Nome (opcional)</span>
                <input
                  value={mpBoletoFirstName}
                  onChange={(e) => setMpBoletoFirstName(e.target.value)}
                  placeholder="Nome"
                  disabled={mpBoletoSubmitting}
                />
              </label>
              <label className={styles.modalField}>
                <span>Sobrenome (opcional)</span>
                <input
                  value={mpBoletoLastName}
                  onChange={(e) => setMpBoletoLastName(e.target.value)}
                  placeholder="Sobrenome"
                  disabled={mpBoletoSubmitting}
                />
              </label>
              <div className={styles.modalActions}>
                <button type="button" className={styles.modalBtnGhost} onClick={closeMpBoletoChargeModal} disabled={mpBoletoSubmitting}>
                  Cancelar
                </button>
                <button type="submit" className={styles.modalBtnPrimary} disabled={mpBoletoSubmitting}>
                  {mpBoletoSubmitting ? "Emitindo..." : "Emitir boleto"}
                </button>
              </div>
            </form>
            {mpBoletoResult ? (
              <div className={styles.modalResult}>
                <p>
                  Pagamento: <strong>{mpBoletoResult.paymentId}</strong> ({mpBoletoResult.paymentStatus})
                </p>
                {mpBoletoResult.ticketUrl ? (
                  <p>
                    <a href={mpBoletoResult.ticketUrl} target="_blank" rel="noreferrer">
                      Abrir PDF do boleto
                    </a>
                  </p>
                ) : (
                  <p className={styles.muted}>Sem URL de boleto retornada.</p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {mpPrefModalEntry ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Checkout Mercado Pago">
          <div className={styles.modalCard}>
            <header className={styles.modalHeader}>
              <h3>
                {mpPrefMode === "payment_link"
                  ? "Link de pagamento Mercado Pago"
                  : mpPrefMode === "subscription"
                    ? "Assinatura Mercado Pago (recorrente)"
                    : "Checkout Pro Mercado Pago"}
              </h3>
              <button type="button" className={styles.modalClose} onClick={closeMpPreferenceModal} disabled={mpPrefSubmitting}>
                Fechar
              </button>
            </header>
            <p className={styles.modalIntro}>
              Lançamento: <strong>{mpPrefModalEntry.description}</strong> ({money(mpPrefModalEntry.amount)})
            </p>
            <p className={styles.muted} style={{ marginTop: 0 }}>
              Gera uma preferência com o mesmo <code>external_reference</code> do financeiro; ao pagar, o webhook pode baixar o
              lançamento automaticamente.
              {mpPrefMode === "subscription" ? " Assinatura: cobrança mensal no valor do lançamento (1× por mês)." : ""}
            </p>
            <form className={styles.modalForm} onSubmit={submitMpPreferenceModal}>
              <label className={styles.modalField}>
                <span>E-mail do pagador {mpPrefMode === "subscription" ? "(obrigatório)" : "(opcional)"}</span>
                <input
                  type="email"
                  value={mpPrefEmail}
                  onChange={(e) => setMpPrefEmail(e.target.value)}
                  placeholder="cliente@email.com"
                  disabled={mpPrefSubmitting}
                  autoComplete="email"
                />
              </label>
              <label className={styles.modalField}>
                <span>URL de retorno após pagamento aprovado (opcional)</span>
                <input
                  value={mpPrefSuccessUrl}
                  onChange={(e) => setMpPrefSuccessUrl(e.target.value)}
                  placeholder="https://seusite.com.br/obrigado"
                  disabled={mpPrefSubmitting}
                />
              </label>
              <div className={styles.modalActions}>
                <button type="button" className={styles.modalBtnGhost} onClick={closeMpPreferenceModal} disabled={mpPrefSubmitting}>
                  Cancelar
                </button>
                <button type="submit" className={styles.modalBtnPrimary} disabled={mpPrefSubmitting}>
                  {mpPrefSubmitting ? "Gerando..." : "Gerar link"}
                </button>
              </div>
            </form>
            {mpPrefResult ? (
              <div className={styles.modalResult}>
                <p>
                  Preferência: <strong>{mpPrefResult.preferenceId}</strong>
                  {mpPrefResult.sandbox ? " (sandbox)" : ""}
                </p>
                <p>
                  <a href={mpPrefResult.checkoutUrl} target="_blank" rel="noreferrer">
                    Abrir checkout / compartilhar link
                  </a>
                </p>
                <p>
                  <button
                    type="button"
                    className={styles.modalBtnGhost}
                    onClick={() => {
                      const enc = encodeURIComponent(mpPrefResult.checkoutUrl);
                      navigate(`/app/finance/mercadopago-checkout?checkout_url=${enc}`);
                    }}
                  >
                    Abrir checkout nesta página (iframe)
                  </button>
                </p>
                <p className={styles.muted} style={{ fontSize: "0.8rem" }}>
                  Copie o endereço do link se precisar enviar por WhatsApp ou e-mail.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {editingEntry ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Editar lançamento">
          <div className={`${styles.modalCard} ${styles.modalCardFinance}`}>
            <header className={styles.modalHeader}>
              <div className={styles.modalTitleBlock}>
                <h3>Editar lançamento</h3>
                {(editingEntry.installment_total ?? 1) > 1 ? (
                  <p className={styles.modalSubtitle}>
                    Parcela {editingEntry.installment_number ?? 1} de {editingEntry.installment_total}
                  </p>
                ) : (
                  <p className={styles.modalSubtitle}>Altere os campos e salve.</p>
                )}
              </div>
              <button type="button" className={styles.modalIconClose} onClick={closeEditModal} aria-label="Fechar">
                <NavIconX />
              </button>
            </header>
            <form className={styles.modalFormFinance} onSubmit={submitEditEntry}>
              <div className={styles.modalSection}>
                <div className={styles.modalSectionLabel}>Lançamento</div>
                <label className={styles.modalField}>
                  <span>Descrição</span>
                  <input
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    autoComplete="off"
                  />
                </label>
                <div className={styles.modalValorVencGrid}>
                  <div className={styles.modalField}>
                    <span>Valor</span>
                    <div className={styles.moneyInputWrap}>
                      <span className={styles.moneyPrefix}>R$</span>
                      <input
                        inputMode="numeric"
                        value={editAmountDisplay}
                        onChange={(e) => setEditAmountDisplay(formatCurrencyBrlInput(e.target.value))}
                        aria-label="Valor em reais"
                      />
                    </div>
                  </div>
                  <label className={styles.modalField}>
                    <span>Vencimento</span>
                    <input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} />
                  </label>
                </div>
                <label className={styles.modalField}>
                  <span>Status</span>
                  <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as FinanceEntryStatus)}>
                    <option value="pending">Pendente</option>
                    <option value="paid">Pago</option>
                    <option value="overdue">Vencido</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </label>
                {editInc ? (
                  <label className={styles.modalField}>
                    <span>Competência (receita)</span>
                    <input type="date" value={editCompetenceDate} onChange={(e) => setEditCompetenceDate(e.target.value)} />
                  </label>
                ) : null}
              </div>

              <div className={styles.modalSection}>
                <div className={styles.modalSectionLabel}>Pagamento</div>
                <div className={styles.row2}>
                  <label className={styles.modalField}>
                    <span>Meio</span>
                    <select value={editPaymentMethod} onChange={(e) => setEditPaymentMethod(e.target.value)}>
                      <option value="pix">PIX</option>
                      <option value="cash">Dinheiro</option>
                      <option value="credit_card">Cartão de crédito</option>
                      <option value="debit_card">Cartão de débito</option>
                      <option value="boleto">Boleto</option>
                    </select>
                  </label>
                  {editShowMachineField ? (
                    <label className={styles.modalField}>
                      <span>Maquininha</span>
                      <select value={editPaymentProvider} onChange={(e) => setEditPaymentProvider(e.target.value)}>
                        <option value="">Selecionar</option>
                        {editPaymentProvider && !providerSuggestions.some((n) => n === editPaymentProvider) ? (
                          <option value={editPaymentProvider}>{editPaymentProvider}</option>
                        ) : null}
                        {providerSuggestions.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <div />
                  )}
                </div>
                {editShowMachineField ? (
                  <p className={styles.modalHintLine}>
                    {providerSuggestions.length === 0
                      ? "Nenhuma maquininha nas taxas ainda. Cadastre taxas por provedor em Financeiro para preencher a lista."
                      : "Taxas e parcelas seguem o cadastro de cada maquininha."}
                  </p>
                ) : null}
                {editShowBankAccountField || editShowCreditCardField ? (
                  <div className={styles.row2}>
                    {editShowBankAccountField ? (
                      <label className={styles.modalField}>
                        <span>{editInc ? "Conta de recebimento" : "Conta de saída"}</span>
                        <select value={editFinanceAccountId} onChange={(e) => setEditFinanceAccountId(e.target.value)}>
                          <option value="">Selecionar</option>
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
                    {editShowCreditCardField ? (
                      <label className={styles.modalField}>
                        <span>Cartão</span>
                        <select value={editCreditCardId} onChange={(e) => setEditCreditCardId(e.target.value)}>
                          <option value="">Selecionar</option>
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
                <label className={styles.modalField}>
                  <span>Categoria</span>
                  <select
                    value={editCategoryId}
                    onChange={(e) => void pickCategoryOption(e.target.value, setEditCategoryId)}
                  >
                    <option value="">Nenhuma</option>
                    <option value="__new__">+ Nova categoria…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className={styles.modalField}>
                <span>Observações</span>
                <textarea
                  className={styles.modalTextarea}
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Opcional"
                />
              </label>

              {(editingEntry.installment_total ?? 1) > 1 ? (
                <div className={styles.modalScopeBanner}>
                  <label className={styles.modalField} style={{ margin: 0 }}>
                    <span>Alterações aplicam a</span>
                    <select value={editScope} onChange={(e) => setEditScope(e.target.value as "single" | "future" | "all")}>
                      <option value="single">Somente esta parcela</option>
                      <option value="future">Esta e parcelas futuras</option>
                      <option value="all">Todas as parcelas</option>
                    </select>
                  </label>
                </div>
              ) : null}

              {editDeletePhase === "choose-scope" ? (
                <div className={styles.modalDeleteScope}>
                  <p className={styles.modalHintLineStrong}>Este lançamento tem várias parcelas. O que deseja excluir?</p>
                  <div className={styles.modalDeleteScopeBtns}>
                    <button type="button" className={styles.modalBtnGhost} onClick={() => setEditDeletePhase("idle")}>
                      Voltar
                    </button>
                    <button type="button" className={styles.modalBtnDangerGhost} onClick={() => void runDeleteWithScope("single")}>
                      Só esta parcela
                    </button>
                    <button type="button" className={styles.modalBtnDangerGhost} onClick={() => void runDeleteWithScope("future")}>
                      Esta e futuras
                    </button>
                    <button type="button" className={styles.modalBtnDanger} onClick={() => void runDeleteWithScope("all")}>
                      Todas
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.modalEditFooter}>
                  <button type="button" className={styles.modalBtnDanger} onClick={handleDeleteClick}>
                    Excluir
                  </button>
                  <button type="submit" className={styles.modalBtnPrimary}>
                    Salvar alterações
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
