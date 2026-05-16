import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import {
  createFinanceCategory,
  createFinanceEntry,
  createFinanceEntryAsaasCharge,
  createFinanceEntryMercadoPagoPixCharge,
  createFinanceEntryStonePixCharge,
  createFinanceEntryStoneBoletoCharge,
  createFinanceEntryStoneCardCharge,
  createFinanceEntryMercadoPagoBoletoCharge,
  createFinanceEntryMercadoPagoPreference,
  deleteFinanceEntry,
  getFinanceBalanceSnapshot,
  getFinanceGateways,
  getFinanceSettings,
  listFinanceAccounts,
  listFinanceBankCatalog,
  listFinanceCreditCards,
  listFinancePaymentFees,
  listFinanceCategories,
  listFinanceEntries,
  patchFinanceEntry,
  getFinanceEntryStoneBoletoArtifacts,
  type FinanceBalanceSnapshotOut,
  type FinanceBankCatalogRow,
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
import { FinanceAccountBankMark } from "../../components/finance/FinanceAccountBankMark";
import { FinanceAccountCombobox } from "../../components/finance/FinanceAccountCombobox";
import { NavIconX } from "../../components/dashboard/NavIcons";
import { mercadoPagoPreferenceCheckoutUrl } from "../../lib/mercadopagoHostedCheckout";
import { createPagarmeCardToken } from "../../lib/pagarmeCardToken";
import {
  amountToCurrencyBrlInput,
  formatCurrencyBrlInput,
  formatPhoneBrInput,
  parseCurrencyBrlInput,
  whatsappMeUrl,
} from "../../lib/brMask";
import formLayout from "../formLayout.module.css";
import styles from "./FinancePage.module.css";

function toDateInput(v: Date): string {
  return v.toISOString().slice(0, 10);
}

function money(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);
}

function stoneBoletoShareMessage(opts: {
  description: string;
  amountLabel: string;
  orderId: string;
  ticketUrl: string | null;
  digitableLine: string | null;
}): string {
  const lines = [
    "Olá!",
    "",
    `Segue o boleto — ${opts.description}`,
    `Valor: ${opts.amountLabel}`,
  ];
  if (opts.digitableLine) {
    lines.push("", "Linha digitável:", opts.digitableLine);
  }
  if (opts.ticketUrl) {
    lines.push("", "Abrir o PDF do boleto:", opts.ticketUrl);
  }
  lines.push("", `Referência Pagar.me: ${opts.orderId}`);
  return lines.join("\n");
}

function mailtoStoneBoletoHref(customerEmail: string, subject: string, body: string): string {
  const max = 1800;
  const clipped = body.length > max ? `${body.slice(0, max)}\n…` : body;
  const to = encodeURIComponent(customerEmail.trim());
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(clipped)}`;
}

function whatsappStoneBoletoHref(phoneMasked: string, body: string): string | null {
  const base = whatsappMeUrl(phoneMasked);
  if (!base) return null;
  const max = 3500;
  const t = body.length > max ? `${body.slice(0, max)}…` : body;
  return `${base}?text=${encodeURIComponent(t)}`;
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

const STANDARD_FINANCE_PAYMENT_METHOD_SET = new Set<string>(["pix", "cash", "credit_card", "debit_card", "boleto"]);

/** Normaliza meio de pagamento para comparações (Stone, taxas, labels). */
function normalizedFinancePaymentMethod(raw: string | null | undefined): string {
  let p = (raw ?? "").trim().toLowerCase();
  if (p === "ticket" || p === "bank_slip" || p === "bolbradesco") p = "boleto";
  return p;
}

function isStandardFinancePaymentMethodValue(v: string): boolean {
  return STANDARD_FINANCE_PAYMENT_METHOD_SET.has(v);
}

/**
 * Valor controlado do <select> de meio: deve coincidir com uma <option>.
 * Evita estado inválido (espaços, aliases) que no React impede trocar o meio.
 */
function financePaymentMethodSelectValue(raw: string | null | undefined): string {
  let p = normalizedFinancePaymentMethod(raw);
  if (!p) p = "pix";
  if (STANDARD_FINANCE_PAYMENT_METHOD_SET.has(p)) return p;
  return p;
}

/** Rótulo do botão Stone conforme o meio de pagamento cadastrado no lançamento. */
function stoneEntryChargeLabel(paymentMethod: string | null | undefined): string {
  const p = normalizedFinancePaymentMethod(paymentMethod);
  if (p === "boleto") return "Emitir boleto (Stone)";
  if (p === "credit_card") return "Cobrar cartão (Stone)";
  if (p === "debit_card") return "Cobrar no cartão (Stone)";
  if (p === "pix") return "Emitir PIX (Stone)";
  if (p === "cash") return "Stone (indisponível)";
  return "Cobrar (Stone)";
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
  const [bankCatalog, setBankCatalog] = useState<FinanceBankCatalogRow[] | null>(null);
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
  const [stoneChargeModalEntry, setStoneChargeModalEntry] = useState<FinanceEntryOut | null>(null);
  const [stoneCustomerEmail, setStoneCustomerEmail] = useState("");
  const [stoneCustomerName, setStoneCustomerName] = useState("");
  const [stoneCustomerDocument, setStoneCustomerDocument] = useState("");
  const [stoneChargeSubmitting, setStoneChargeSubmitting] = useState(false);
  const [stoneChargeResult, setStoneChargeResult] = useState<{
    orderId: string;
    pixCopyPaste: string | null;
    qrCodeUrl: string | null;
  } | null>(null);
  const [stoneBoletoModalEntry, setStoneBoletoModalEntry] = useState<FinanceEntryOut | null>(null);
  const [stoneBoletoEmail, setStoneBoletoEmail] = useState("");
  const [stoneBoletoName, setStoneBoletoName] = useState("");
  const [stoneBoletoDocument, setStoneBoletoDocument] = useState("");
  const [stoneBoletoInstructions, setStoneBoletoInstructions] = useState("");
  const [stoneBoletoSubmitting, setStoneBoletoSubmitting] = useState(false);
  const [stoneBoletoResult, setStoneBoletoResult] = useState<{
    orderId: string;
    ticketUrl: string | null;
    digitableLine: string | null;
    barcode: string | null;
  } | null>(null);
  const [stoneBoletoShareWhatsapp, setStoneBoletoShareWhatsapp] = useState("");
  const [stoneBoletoCopyLineHint, setStoneBoletoCopyLineHint] = useState("");
  const [stoneCardModalEntry, setStoneCardModalEntry] = useState<FinanceEntryOut | null>(null);
  const [stoneCardEmail, setStoneCardEmail] = useState("");
  const [stoneCardName, setStoneCardName] = useState("");
  const [stoneCardDocument, setStoneCardDocument] = useState("");
  const [stoneCardToken, setStoneCardToken] = useState("");
  const [stoneCardNumber, setStoneCardNumber] = useState("");
  const [stoneCardHolderName, setStoneCardHolderName] = useState("");
  const [stoneCardExpMonth, setStoneCardExpMonth] = useState("");
  const [stoneCardExpYear, setStoneCardExpYear] = useState("");
  const [stoneCardCvv, setStoneCardCvv] = useState("");
  const [stoneCardInstallments, setStoneCardInstallments] = useState("1");
  const [stoneCardSubmitting, setStoneCardSubmitting] = useState(false);
  const [stoneCardResult, setStoneCardResult] = useState<{ orderId: string } | null>(null);
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
  const [editStoneBoletoBusy, setEditStoneBoletoBusy] = useState(false);
  const [editStoneBoletoErr, setEditStoneBoletoErr] = useState<string | null>(null);
  const [editStoneBoletoData, setEditStoneBoletoData] = useState<{
    orderId: string;
    ticketUrl: string | null;
    digitableLine: string | null;
    barcode: string | null;
  } | null>(null);
  const [financeBoletoPdfOverlayUrl, setFinanceBoletoPdfOverlayUrl] = useState<string | null>(null);
  const [editStoneBoletoShareWhatsapp, setEditStoneBoletoShareWhatsapp] = useState("");
  const [editStoneBoletoCopyLineHint, setEditStoneBoletoCopyLineHint] = useState("");
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

  const stoneBoletoShareBody = useMemo(() => {
    if (!stoneBoletoResult || !stoneBoletoModalEntry) return "";
    return stoneBoletoShareMessage({
      description: stoneBoletoModalEntry.description,
      amountLabel: money(stoneBoletoModalEntry.amount),
      orderId: stoneBoletoResult.orderId,
      ticketUrl: stoneBoletoResult.ticketUrl,
      digitableLine: stoneBoletoResult.digitableLine,
    });
  }, [stoneBoletoResult, stoneBoletoModalEntry]);

  const stoneBoletoMailtoHref =
    stoneBoletoResult && stoneBoletoModalEntry && stoneBoletoEmail.trim() && stoneBoletoShareBody
      ? mailtoStoneBoletoHref(
          stoneBoletoEmail.trim(),
          `Boleto — ${stoneBoletoModalEntry.description}`.slice(0, 180),
          stoneBoletoShareBody,
        )
      : null;

  const stoneBoletoWhatsappHref =
    stoneBoletoShareBody && stoneBoletoShareWhatsapp.trim()
      ? whatsappStoneBoletoHref(stoneBoletoShareWhatsapp, stoneBoletoShareBody)
      : null;

  useEffect(() => {
    if (editPaymentMethod !== "boleto") {
      setEditStoneBoletoData(null);
      setEditStoneBoletoErr(null);
      setFinanceBoletoPdfOverlayUrl(null);
      setEditStoneBoletoCopyLineHint("");
    }
  }, [editPaymentMethod]);

  useEffect(() => {
    if (!financeBoletoPdfOverlayUrl) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setFinanceBoletoPdfOverlayUrl(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [financeBoletoPdfOverlayUrl]);

  const editStoneBoletoToolsVisible = useMemo(() => {
    if (!editingEntry || !editInc) return false;
    if (editPaymentMethod !== "boleto") return false;
    if ((editingEntry.payment_provider || "").trim().toLowerCase() !== "stone") return false;
    return Boolean((editingEntry.gateway_payment_id || "").trim());
  }, [editingEntry, editInc, editPaymentMethod]);

  const editStoneBoletoShareText = useMemo(() => {
    if (!editingEntry || !editStoneBoletoData) return "";
    return stoneBoletoShareMessage({
      description: editingEntry.description,
      amountLabel: money(editingEntry.amount),
      orderId: editStoneBoletoData.orderId,
      ticketUrl: editStoneBoletoData.ticketUrl,
      digitableLine: editStoneBoletoData.digitableLine,
    });
  }, [editingEntry, editStoneBoletoData]);

  const editStoneBoletoMailtoHref =
    editStoneBoletoToolsVisible &&
    editStoneBoletoShareText &&
    (editingEntry?.linked_payer_email || "").trim()
      ? mailtoStoneBoletoHref(
          (editingEntry!.linked_payer_email || "").trim(),
          `Boleto — ${editingEntry!.description}`.slice(0, 180),
          editStoneBoletoShareText,
        )
      : null;

  const editStoneBoletoWhatsappHref =
    editStoneBoletoShareText && editStoneBoletoShareWhatsapp.trim()
      ? whatsappStoneBoletoHref(editStoneBoletoShareWhatsapp, editStoneBoletoShareText)
      : null;

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
        setBankCatalog(null);
        return;
      }
      const [e, c, gw, fees, accs, ccs, snap, bankCat] = await Promise.all([
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
        listFinanceBankCatalog().catch(() => [] as FinanceBankCatalogRow[]),
      ]);
      setGateways(gw);
      setEntries(e);
      setCategories(c.map((x) => ({ id: x.id, name: x.name })));
      setPaymentFees(fees);
      setAccounts(accs);
      setCards(ccs);
      setBalanceSnapshot(snap);
      setBankCatalog(bankCat.length ? bankCat : null);
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
    setEditStoneBoletoBusy(false);
    setEditStoneBoletoErr(null);
    setEditStoneBoletoData(null);
    setFinanceBoletoPdfOverlayUrl(null);
    setEditStoneBoletoShareWhatsapp("");
    setEditStoneBoletoCopyLineHint("");
  }

  function openEditModal(entry: FinanceEntryOut) {
    setEditDeletePhase("idle");
    setEditingEntry(entry);
    setEditDescription(entry.description ?? "");
    setEditAmountDisplay(amountToCurrencyBrlInput(Number(entry.amount ?? 0)));
    setEditDueDate(entry.due_date);
    setEditCompetenceDate(entry.competence_date ?? entry.due_date);
    setEditStatus(entry.status);
    setEditPaymentMethod(financePaymentMethodSelectValue(entry.payment_method));
    setEditPaymentProvider(entry.payment_provider?.trim() ?? "");
    setEditFinanceAccountId(entry.finance_account_id != null ? String(entry.finance_account_id) : "");
    setEditCreditCardId(entry.credit_card_id != null ? String(entry.credit_card_id) : "");
    setEditCategoryId(entry.category_id != null ? String(entry.category_id) : "");
    setEditNotes(entry.notes?.trim() ?? "");
    setEditScope("single");
    setEditStoneBoletoBusy(false);
    setEditStoneBoletoErr(null);
    setEditStoneBoletoData(null);
    setFinanceBoletoPdfOverlayUrl(null);
    setEditStoneBoletoCopyLineHint("");
    setEditStoneBoletoShareWhatsapp(
      entry.recipient_whatsapp?.trim() ? formatPhoneBrInput(String(entry.recipient_whatsapp)) : "",
    );
  }

  async function loadEditStoneBoletoArtifacts(opts?: { openPdf?: boolean }) {
    if (!editingEntry?.id) return;
    setEditStoneBoletoBusy(true);
    setEditStoneBoletoErr(null);
    try {
      const r = await getFinanceEntryStoneBoletoArtifacts(editingEntry.id);
      setEditStoneBoletoData({
        orderId: r.order_id,
        ticketUrl: r.ticket_url,
        digitableLine: r.digitable_line,
        barcode: r.barcode,
      });
      if (opts?.openPdf && r.ticket_url) {
        setFinanceBoletoPdfOverlayUrl(r.ticket_url);
      }
    } catch (e) {
      setEditStoneBoletoErr(e instanceof Error ? e.message : "Não foi possível carregar o boleto.");
      setEditStoneBoletoData(null);
    } finally {
      setEditStoneBoletoBusy(false);
    }
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
        payment_method: normalizedFinancePaymentMethod(editPaymentMethod) || null,
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

  function openStoneChargeForEntry(entry: FinanceEntryOut) {
    const p = normalizedFinancePaymentMethod(entry.payment_method);
    if (p === "cash") {
      setError(
        "Este lançamento está como dinheiro. Altere o meio para PIX, boleto ou cartão no lançamento para cobrar pela Stone, ou use «Baixar» quando receber em espécie.",
      );
      return;
    }
    if (p === "boleto") {
      openStoneBoletoChargeModal(entry);
      return;
    }
    if (p === "credit_card" || p === "debit_card") {
      openStoneCardChargeModal(entry);
      return;
    }
    openStoneChargeModal(entry);
  }

  function openStoneChargeModal(entry: FinanceEntryOut) {
    if (!gateways?.stone.connected) {
      setError("Conecte Stone / Pagar.me em Contas e carteiras antes de emitir cobrança.");
      return;
    }
    if (entry.gateway_preference_id) {
      setError(
        "Este lançamento possui checkout Mercado Pago pendente. Remova a preferência ou use outro lançamento para cobrar via Stone / Pagar.me.",
      );
      return;
    }
    if (entry.gateway_payment_id) {
      setError("Este lançamento já está vinculado a uma cobrança.");
      return;
    }
    setStoneChargeModalEntry(entry);
    setStoneCustomerEmail(entry.linked_payer_email ?? "");
    setStoneCustomerName(entry.linked_payer_name ?? "");
    setStoneCustomerDocument(entry.linked_payer_document ?? "");
    setStoneChargeResult(null);
  }

  function closeStoneChargeModal() {
    if (stoneChargeSubmitting) return;
    setStoneChargeModalEntry(null);
    setStoneCustomerEmail("");
    setStoneCustomerName("");
    setStoneCustomerDocument("");
    setStoneChargeResult(null);
  }

  async function submitStoneChargeModal(ev: FormEvent) {
    ev.preventDefault();
    if (!stoneChargeModalEntry) return;
    if (!stoneCustomerEmail.trim()) {
      setError("Informe o e-mail do pagador (cadastro no Pagar.me).");
      return;
    }
    setStoneChargeSubmitting(true);
    setError(null);
    try {
      const r = await createFinanceEntryStonePixCharge(stoneChargeModalEntry.id, {
        customer_email: stoneCustomerEmail.trim(),
        customer_name: stoneCustomerName.trim() || null,
        payer_document: stoneCustomerDocument.trim() || null,
      });
      setStoneChargeResult({
        orderId: r.order_id,
        pixCopyPaste: r.pix_copy_paste,
        qrCodeUrl: r.qr_code_url,
      });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível emitir cobrança Stone / Pagar.me.");
    } finally {
      setStoneChargeSubmitting(false);
    }
  }

  function openStoneBoletoChargeModal(entry: FinanceEntryOut) {
    if (!gateways?.stone.connected) {
      setError("Conecte Stone / Pagar.me em Contas e carteiras antes de emitir cobrança.");
      return;
    }
    if (entry.gateway_preference_id) {
      setError(
        "Este lançamento possui checkout Mercado Pago pendente. Remova a preferência ou use outro lançamento para cobrar via Stone / Pagar.me.",
      );
      return;
    }
    if (entry.gateway_payment_id) {
      setError("Este lançamento já está vinculado a uma cobrança.");
      return;
    }
    setError(null);
    setFinanceBoletoPdfOverlayUrl(null);
    setStoneBoletoShareWhatsapp("");
    setStoneBoletoCopyLineHint("");
    setStoneBoletoModalEntry(entry);
    setStoneBoletoEmail(entry.linked_payer_email ?? "");
    setStoneBoletoName(entry.linked_payer_name ?? "");
    setStoneBoletoDocument(entry.linked_payer_document ?? "");
    setStoneBoletoInstructions("");
    setStoneBoletoResult(null);
  }

  function closeStoneBoletoChargeModal() {
    if (stoneBoletoSubmitting) return;
    setError(null);
    setFinanceBoletoPdfOverlayUrl(null);
    setStoneBoletoShareWhatsapp("");
    setStoneBoletoCopyLineHint("");
    setStoneBoletoModalEntry(null);
    setStoneBoletoEmail("");
    setStoneBoletoName("");
    setStoneBoletoDocument("");
    setStoneBoletoInstructions("");
    setStoneBoletoResult(null);
  }

  async function submitStoneBoletoChargeModal(ev: FormEvent) {
    ev.preventDefault();
    if (!stoneBoletoModalEntry) return;
    if (!stoneBoletoEmail.trim()) {
      setError("Informe o e-mail do pagador.");
      return;
    }
    const docDigits = stoneBoletoDocument.replace(/\D/g, "");
    if (docDigits.length !== 11 && docDigits.length !== 14) {
      setError("Informe CPF (11 dígitos) ou CNPJ (14 dígitos) do pagador.");
      return;
    }
    setStoneBoletoSubmitting(true);
    setError(null);
    try {
      const r = await createFinanceEntryStoneBoletoCharge(stoneBoletoModalEntry.id, {
        customer_email: stoneBoletoEmail.trim(),
        customer_name: stoneBoletoName.trim() || null,
        payer_document: stoneBoletoDocument,
        instructions: stoneBoletoInstructions.trim() || null,
      });
      setStoneBoletoResult({
        orderId: r.order_id,
        ticketUrl: r.ticket_url,
        digitableLine: r.digitable_line,
        barcode: r.barcode,
      });
      setStoneBoletoShareWhatsapp(
        stoneBoletoModalEntry.recipient_whatsapp?.trim()
          ? formatPhoneBrInput(String(stoneBoletoModalEntry.recipient_whatsapp))
          : "",
      );
      setStoneBoletoCopyLineHint("");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível emitir boleto Stone / Pagar.me.");
    } finally {
      setStoneBoletoSubmitting(false);
    }
  }

  function openStoneCardChargeModal(entry: FinanceEntryOut) {
    if (!gateways?.stone.connected) {
      setError("Conecte Stone / Pagar.me em Contas e carteiras antes de emitir cobrança.");
      return;
    }
    if (entry.gateway_preference_id) {
      setError(
        "Este lançamento possui checkout Mercado Pago pendente. Remova a preferência ou use outro lançamento para cobrar via Stone / Pagar.me.",
      );
      return;
    }
    if (entry.gateway_payment_id) {
      setError("Este lançamento já está vinculado a uma cobrança.");
      return;
    }
    setStoneCardModalEntry(entry);
    setStoneCardEmail(entry.linked_payer_email ?? "");
    setStoneCardName(entry.linked_payer_name ?? "");
    setStoneCardDocument(entry.linked_payer_document ?? "");
    setStoneCardToken("");
    setStoneCardNumber("");
    setStoneCardHolderName("");
    setStoneCardExpMonth("");
    setStoneCardExpYear("");
    setStoneCardCvv("");
    setStoneCardInstallments("1");
    setStoneCardResult(null);
  }

  function closeStoneCardChargeModal() {
    if (stoneCardSubmitting) return;
    setStoneCardModalEntry(null);
    setStoneCardEmail("");
    setStoneCardName("");
    setStoneCardDocument("");
    setStoneCardToken("");
    setStoneCardNumber("");
    setStoneCardHolderName("");
    setStoneCardExpMonth("");
    setStoneCardExpYear("");
    setStoneCardCvv("");
    setStoneCardInstallments("1");
    setStoneCardResult(null);
  }

  async function submitStoneCardChargeModal(ev: FormEvent) {
    ev.preventDefault();
    if (!stoneCardModalEntry) return;
    if (!stoneCardEmail.trim()) {
      setError("Informe o e-mail do pagador.");
      return;
    }
    const docDigits = stoneCardDocument.replace(/\D/g, "");
    if (docDigits.length !== 11 && docDigits.length !== 14) {
      setError("Informe CPF (11 dígitos) ou CNPJ (14 dígitos) do pagador.");
      return;
    }
    const pk = gateways?.stone?.public_key?.trim();
    let cardToken = stoneCardToken.trim();
    if (!cardToken) {
      if (!pk) {
        setError(
          "Cadastre a chave pública (pk_…) em Contas e carteiras → Stone, ou cole um card_token já gerado com tokenização Pagar.me.",
        );
        return;
      }
      if (!stoneCardNumber.trim() || !stoneCardExpMonth.trim() || !stoneCardExpYear.trim() || !stoneCardCvv.trim()) {
        setError("Preencha número, validade e CVV do cartão, ou cole um card_token.");
        return;
      }
    }
    let inst = Number.parseInt(stoneCardInstallments, 10);
    if (!Number.isFinite(inst) || inst < 1) inst = 1;
    if (inst > 12) inst = 12;
    setStoneCardSubmitting(true);
    setError(null);
    try {
      if (!cardToken && pk) {
        cardToken = await createPagarmeCardToken({
          publicKey: pk,
          number: stoneCardNumber,
          holderName: stoneCardHolderName.trim() || stoneCardName.trim() || stoneCardEmail.split("@", 1)[0] || "Cliente",
          expMonth: stoneCardExpMonth,
          expYear: stoneCardExpYear,
          cvv: stoneCardCvv,
          holderDocumentDigits: docDigits,
        });
      }
      const r = await createFinanceEntryStoneCardCharge(stoneCardModalEntry.id, {
        customer_email: stoneCardEmail.trim(),
        customer_name: stoneCardName.trim() || null,
        payer_document: stoneCardDocument,
        card_token: cardToken,
        installments: inst,
      });
      setStoneCardResult({ orderId: r.order_id });
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível cobrar no cartão via Stone / Pagar.me.");
    } finally {
      setStoneCardSubmitting(false);
    }
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

      {error && !stoneBoletoModalEntry ? (
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
                    {balanceSnapshot.accounts.map((a) => {
                      const accRow = accounts.find((x) => x.id === a.id);
                      return (
                      <div
                        key={a.id}
                        className={styles.accountBalanceChip}
                        title={accountChipTooltip(a.name, balanceSnapshot, a.current_balance, a.projected_balance)}
                      >
                        <div className={styles.accountBalanceChipHead}>
                          {accRow ? (
                            <FinanceAccountBankMark
                              account={accRow}
                              gateways={gateways}
                              catalog={bankCatalog}
                              variant="inline"
                            />
                          ) : null}
                          <span className={styles.accountBalanceName}>{a.name}</span>
                        </div>
                        <span className={styles.accountBalanceValues}>
                          <span className={styles.accountBalanceMono}>{money(a.current_balance)}</span>
                          <span className={styles.accountBalanceArrow} aria-hidden>
                            →
                          </span>
                          <span className={styles.accountBalanceMono}>{money(a.projected_balance)}</span>
                        </span>
                      </div>
                    );
                    })}
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
                <label className={`${formLayout.field} ${styles.fieldCompact}`}>
                  <span>De</span>
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </label>
                <label className={`${formLayout.field} ${styles.fieldCompact}`}>
                  <span>Até</span>
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </label>
              </div>
              <label className={`${formLayout.field} ${styles.fieldCompact} ${styles.fieldPeriod}`}>
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
                                    {e.payment_provider === "mercadopago"
                                      ? "Mercado Pago"
                                      : e.payment_provider === "stone"
                                        ? "Stone"
                                        : "Gateway"}
                                    : {e.gateway_payment_id}
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
                          {e.entry_type === "income" && !e.gateway_payment_id && (gateways?.asaas.connected || gateways?.mercadopago.connected || gateways?.stone.connected) ? (
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
                              {gateways?.stone?.connected ? (
                                <button type="button" onClick={() => openStoneChargeForEntry(e)}>
                                  {stoneEntryChargeLabel(e.payment_method)}
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
                <label className={`${formLayout.field} ${styles.modalField}`}>
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
                  <label className={`${formLayout.field} ${styles.modalField}`}>
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
                  <div className={`${formLayout.field} ${styles.modalField}`}>
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
                  <label className={`${formLayout.field} ${styles.modalField}`}>
                    <span>Vencimento</span>
                    <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </label>
                </div>
              </div>

              <div className={styles.modalSection}>
                <div className={styles.modalSectionLabel}>Pagamento</div>
                <div className={styles.row2}>
                  <label className={`${formLayout.field} ${styles.modalField}`}>
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
                    <label className={`${formLayout.field} ${styles.modalField}`}>
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
                  <label className={`${formLayout.field} ${styles.modalField}`}>
                    <span>Parcelas</span>
                    <input type="number" min="1" max="24" step="1" value={installments} onChange={(e) => setInstallments(e.target.value)} />
                  </label>
                ) : null}
                {showBankAccountField || showCreditCardField ? (
                  <div className={styles.row2}>
                    {showBankAccountField ? (
                      <label className={`${formLayout.field} ${styles.modalField}`}>
                        <span>{isIncome ? "Conta de recebimento" : "Conta de saída"}</span>
                        <FinanceAccountCombobox
                          id="fin-new-entry-account"
                          accounts={accounts}
                          value={financeAccountId}
                          onChange={setFinanceAccountId}
                          gateways={gateways}
                          catalog={bankCatalog}
                          emptyOption
                          emptyLabel="Selecionar"
                        />
                      </label>
                    ) : (
                      <div />
                    )}
                    {showCreditCardField ? (
                      <label className={`${formLayout.field} ${styles.modalField}`}>
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
                <label className={`${formLayout.field} ${styles.modalField}`}>
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
              <label className={`${formLayout.field} ${styles.modalField}`}>
                <span>customer_id no Asaas</span>
                <input
                  value={chargeCustomerId}
                  onChange={(e) => setChargeCustomerId(e.target.value)}
                  placeholder="cus_000000000000"
                  autoFocus
                  disabled={chargeSubmitting}
                />
              </label>
              <label className={`${formLayout.field} ${styles.modalField}`}>
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
              <label className={`${formLayout.field} ${styles.modalField}`}>
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
              <label className={`${formLayout.field} ${styles.modalField}`}>
                <span>Nome (opcional)</span>
                <input
                  value={mpPayerFirstName}
                  onChange={(e) => setMpPayerFirstName(e.target.value)}
                  placeholder="Nome"
                  disabled={mpChargeSubmitting}
                />
              </label>
              <label className={`${formLayout.field} ${styles.modalField}`}>
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

      {stoneChargeModalEntry ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Emitir cobrança Stone PIX">
          <div className={styles.modalCard}>
            <header className={styles.modalHeader}>
              <h3>Cobrança Stone / Pagar.me (PIX)</h3>
              <button type="button" className={styles.modalClose} onClick={closeStoneChargeModal} disabled={stoneChargeSubmitting}>
                Fechar
              </button>
            </header>
            <p className={styles.modalIntro}>
              Lançamento: <strong>{stoneChargeModalEntry.description}</strong> ({money(stoneChargeModalEntry.amount)})
            </p>
            {stoneChargeModalEntry.service_order_id ? (
              <p className={styles.muted} style={{ marginTop: 0 }}>
                Dados do pagador preenchidos a partir do <strong>cliente da OS #{stoneChargeModalEntry.service_order_id}</strong> quando
                existirem no cadastro; você pode ajustar antes de emitir.
              </p>
            ) : null}
            <form className={styles.modalForm} onSubmit={submitStoneChargeModal}>
              <label className={`${formLayout.field} ${styles.modalField}`}>
                <span>E-mail do pagador</span>
                <input
                  type="email"
                  value={stoneCustomerEmail}
                  onChange={(e) => setStoneCustomerEmail(e.target.value)}
                  placeholder="cliente@email.com"
                  autoFocus
                  disabled={stoneChargeSubmitting}
                  autoComplete="email"
                />
              </label>
              <label className={`${formLayout.field} ${styles.modalField}`}>
                <span>Nome (opcional)</span>
                <input
                  value={stoneCustomerName}
                  onChange={(e) => setStoneCustomerName(e.target.value)}
                  placeholder="Nome para o cadastro no Pagar.me"
                  disabled={stoneChargeSubmitting}
                />
              </label>
              <label className={`${formLayout.field} ${styles.modalField}`}>
                <span>CPF ou CNPJ do pagador (recomendado)</span>
                <input
                  value={stoneCustomerDocument}
                  onChange={(e) => setStoneCustomerDocument(e.target.value)}
                  placeholder="Somente números — muitas contas Pagar.me exigem para PIX"
                  disabled={stoneChargeSubmitting}
                  autoComplete="off"
                />
              </label>
              <div className={styles.modalActions}>
                <button type="button" className={styles.modalBtnGhost} onClick={closeStoneChargeModal} disabled={stoneChargeSubmitting}>
                  Cancelar
                </button>
                <button type="submit" className={styles.modalBtnPrimary} disabled={stoneChargeSubmitting}>
                  {stoneChargeSubmitting ? "Emitindo..." : "Emitir PIX"}
                </button>
              </div>
            </form>
            {stoneChargeResult ? (
              <div className={styles.modalResult}>
                <p>
                  Pedido Pagar.me: <strong>{stoneChargeResult.orderId}</strong>
                </p>
                {stoneChargeResult.qrCodeUrl ? (
                  <p>
                    <a href={stoneChargeResult.qrCodeUrl} target="_blank" rel="noreferrer">
                      Abrir QR no Pagar.me
                    </a>
                  </p>
                ) : null}
                {stoneChargeResult.pixCopyPaste ? (
                  <div>
                    <p className={styles.muted}>Copia e cola (PIX)</p>
                    <pre className={styles.pixPayload}>{stoneChargeResult.pixCopyPaste}</pre>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {stoneBoletoModalEntry ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Emitir boleto Stone Pagar.me">
          <div className={`${styles.modalCard} ${styles.modalCardStoneBoleto}`}>
            <header className={styles.modalHeader}>
              <h3>Cobrança Stone / Pagar.me (Boleto)</h3>
              <button type="button" className={styles.modalClose} onClick={closeStoneBoletoChargeModal} disabled={stoneBoletoSubmitting}>
                Fechar
              </button>
            </header>
            <p className={styles.modalIntro}>
              Lançamento: <strong>{stoneBoletoModalEntry.description}</strong> ({money(stoneBoletoModalEntry.amount)})
            </p>
            {stoneBoletoModalEntry.service_order_id ? (
              <p className={styles.muted} style={{ marginTop: 0 }}>
                E-mail, nome e documento podem vir do <strong>cliente da OS #{stoneBoletoModalEntry.service_order_id}</strong>.
              </p>
            ) : null}
            <p className={styles.muted} style={{ marginTop: 0 }}>
              Vencimento do boleto: data de vencimento do lançamento (ou +3 dias se já estiver vencida), como no fluxo Mercado Pago.
            </p>
            <form className={styles.modalForm} onSubmit={submitStoneBoletoChargeModal}>
              <label className={`${formLayout.field} ${styles.modalField}`}>
                <span>E-mail do pagador</span>
                <input
                  type="email"
                  value={stoneBoletoEmail}
                  onChange={(e) => setStoneBoletoEmail(e.target.value)}
                  placeholder="cliente@email.com"
                  autoFocus
                  disabled={stoneBoletoSubmitting}
                  autoComplete="email"
                />
              </label>
              <label className={`${formLayout.field} ${styles.modalField}`}>
                <span>Nome (opcional)</span>
                <input
                  value={stoneBoletoName}
                  onChange={(e) => setStoneBoletoName(e.target.value)}
                  placeholder="Nome no boleto"
                  disabled={stoneBoletoSubmitting}
                />
              </label>
              <label className={`${formLayout.field} ${styles.modalField}`}>
                <span>CPF ou CNPJ do pagador</span>
                <input
                  value={stoneBoletoDocument}
                  onChange={(e) => setStoneBoletoDocument(e.target.value)}
                  placeholder="Somente números ou com máscara"
                  disabled={stoneBoletoSubmitting}
                  autoComplete="off"
                />
              </label>
              <label className={`${formLayout.field} ${styles.modalField}`}>
                <span>Instruções (opcional)</span>
                <input
                  value={stoneBoletoInstructions}
                  onChange={(e) => setStoneBoletoInstructions(e.target.value)}
                  placeholder="Até 256 caracteres"
                  maxLength={256}
                  disabled={stoneBoletoSubmitting}
                />
              </label>
              {error ? (
                <p className={styles.error} role="alert" style={{ margin: 0 }}>
                  {error}
                </p>
              ) : null}
              <div className={styles.modalActions}>
                <button type="button" className={styles.modalBtnGhost} onClick={closeStoneBoletoChargeModal} disabled={stoneBoletoSubmitting}>
                  Cancelar
                </button>
                <button type="submit" className={styles.modalBtnPrimary} disabled={stoneBoletoSubmitting}>
                  {stoneBoletoSubmitting ? "Emitindo..." : "Emitir boleto"}
                </button>
              </div>
            </form>
            {stoneBoletoResult ? (
              <div className={styles.modalResult}>
                <p>
                  Pedido Pagar.me: <strong>{stoneBoletoResult.orderId}</strong>
                </p>
                {stoneBoletoResult.ticketUrl ? (
                  <div className={styles.modalShareRow}>
                    <button
                      type="button"
                      className={styles.modalBtnPrimary}
                      onClick={() => {
                        const u = stoneBoletoResult.ticketUrl;
                        if (u) setFinanceBoletoPdfOverlayUrl(u);
                      }}
                    >
                      Visualizar PDF
                    </button>
                    <a
                      className={styles.modalBtnGhost}
                      href={stoneBoletoResult.ticketUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir PDF (nova aba)
                    </a>
                  </div>
                ) : null}
                {stoneBoletoResult.digitableLine ? (
                  <div>
                    <p className={styles.muted}>Linha digitável</p>
                    <pre className={styles.pixPayload}>{stoneBoletoResult.digitableLine}</pre>
                    <div className={styles.modalShareRow}>
                      <button
                        type="button"
                        className={styles.modalBtnGhost}
                        onClick={() => {
                          const line = stoneBoletoResult.digitableLine;
                          if (!line) return;
                          void navigator.clipboard.writeText(line).then(
                            () => {
                              setStoneBoletoCopyLineHint("Copiado.");
                              window.setTimeout(() => setStoneBoletoCopyLineHint(""), 2500);
                            },
                            () => {
                              setStoneBoletoCopyLineHint("Copie manualmente (Ctrl+C) no campo acima.");
                              window.setTimeout(() => setStoneBoletoCopyLineHint(""), 5000);
                            },
                          );
                        }}
                      >
                        Copiar linha digitável
                      </button>
                      {stoneBoletoCopyLineHint ? (
                        <span className={styles.muted} style={{ fontSize: "0.8rem" }}>
                          {stoneBoletoCopyLineHint}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {stoneBoletoResult.barcode ? (
                  <p className={styles.muted}>
                    Código de barras: <code>{stoneBoletoResult.barcode}</code>
                  </p>
                ) : null}
                <p className={styles.muted} style={{ marginTop: "0.5rem" }}>
                  Envie o boleto ao cliente pelo app de e-mail ou WhatsApp (abre em nova aba com a mensagem pronta).
                </p>
                <label className={`${formLayout.field} ${styles.modalField} ${styles.modalShareField}`}>
                  <span>WhatsApp do cliente (com DDD)</span>
                  <input
                    type="tel"
                    value={stoneBoletoShareWhatsapp}
                    onChange={(e) => setStoneBoletoShareWhatsapp(formatPhoneBrInput(e.target.value))}
                    placeholder="(34) 99999-9999"
                    autoComplete="tel"
                  />
                </label>
                <div className={styles.modalShareRow}>
                  {stoneBoletoMailtoHref ? (
                    <a className={styles.modalBtnGhost} href={stoneBoletoMailtoHref} rel="noreferrer">
                      Enviar por e-mail
                    </a>
                  ) : (
                    <button type="button" className={styles.modalBtnGhost} disabled title="Preencha o e-mail do pagador acima">
                      Enviar por e-mail
                    </button>
                  )}
                  {stoneBoletoWhatsappHref ? (
                    <a
                      className={styles.modalBtnPrimary}
                      href={stoneBoletoWhatsappHref}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir WhatsApp
                    </a>
                  ) : (
                    <button
                      type="button"
                      className={styles.modalBtnPrimary}
                      disabled
                      title="Informe o celular com DDD (10 ou 11 dígitos) para montar o link do WhatsApp"
                    >
                      Abrir WhatsApp
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {stoneCardModalEntry ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-label="Cobrar cartão Stone Pagar.me">
          <div className={styles.modalCard}>
            <header className={styles.modalHeader}>
              <h3>Cobrança Stone / Pagar.me (cartão)</h3>
              <button type="button" className={styles.modalClose} onClick={closeStoneCardChargeModal} disabled={stoneCardSubmitting}>
                Fechar
              </button>
            </header>
            <p className={styles.modalIntro}>
              Lançamento: <strong>{stoneCardModalEntry.description}</strong> ({money(stoneCardModalEntry.amount)})
            </p>
            {stoneCardModalEntry.service_order_id ? (
              <p className={styles.muted} style={{ marginTop: 0 }}>
                E-mail, nome e documento podem vir do <strong>cliente da OS #{stoneCardModalEntry.service_order_id}</strong>.
              </p>
            ) : null}
            <p className={styles.muted} style={{ marginTop: 0 }}>
              {gateways?.stone?.public_key ? (
                <>
                  Com a chave pública cadastrada, os dados do cartão são enviados direto ao Pagar.me para gerar um token
                  (veja{" "}
                  <a href="https://docs.pagar.me/reference/criar-token-cart%C3%A3o-1" target="_blank" rel="noreferrer">
                    Criar token cartão
                  </a>
                  ). Cadastre o domínio do app no painel Pagar.me. Sem chave pública, use o campo <strong>card_token</strong>{" "}
                  abaixo.
                </>
              ) : (
                <>
                  Cadastre a chave pública <strong>pk_…</strong> em Contas e carteiras para preencher o cartão aqui, ou cole
                  um <strong>card_token</strong> já gerado. Consulte a{" "}
                  <a href="https://docs.pagar.me/reference/cart%C3%A3o-de-cr%C3%A9dito-1" target="_blank" rel="noreferrer">
                    documentação de cartão
                  </a>
                  .
                </>
              )}
            </p>
            <form className={styles.modalForm} onSubmit={submitStoneCardChargeModal}>
              <label className={`${formLayout.field} ${styles.modalField}`}>
                <span>E-mail do pagador</span>
                <input
                  type="email"
                  value={stoneCardEmail}
                  onChange={(e) => setStoneCardEmail(e.target.value)}
                  placeholder="cliente@email.com"
                  autoFocus
                  disabled={stoneCardSubmitting}
                  autoComplete="email"
                />
              </label>
              <label className={`${formLayout.field} ${styles.modalField}`}>
                <span>Nome (opcional)</span>
                <input
                  value={stoneCardName}
                  onChange={(e) => setStoneCardName(e.target.value)}
                  disabled={stoneCardSubmitting}
                />
              </label>
              <label className={`${formLayout.field} ${styles.modalField}`}>
                <span>CPF ou CNPJ do pagador</span>
                <input
                  value={stoneCardDocument}
                  onChange={(e) => setStoneCardDocument(e.target.value)}
                  disabled={stoneCardSubmitting}
                  autoComplete="off"
                />
              </label>
              {gateways?.stone?.public_key ? (
                <>
                  <label className={`${formLayout.field} ${styles.modalField}`}>
                    <span>Nome impresso no cartão</span>
                    <input
                      value={stoneCardHolderName}
                      onChange={(e) => setStoneCardHolderName(e.target.value)}
                      placeholder="Como no cartão"
                      disabled={stoneCardSubmitting}
                      autoComplete="cc-name"
                    />
                  </label>
                  <label className={`${formLayout.field} ${styles.modalField}`}>
                    <span>Número do cartão</span>
                    <input
                      inputMode="numeric"
                      value={stoneCardNumber}
                      onChange={(e) => setStoneCardNumber(e.target.value)}
                      placeholder="Somente números"
                      disabled={stoneCardSubmitting}
                      autoComplete="cc-number"
                    />
                  </label>
                  <div className={styles.modalGridTipoPaid}>
                    <label className={`${formLayout.field} ${styles.modalField}`}>
                      <span>Mês (MM)</span>
                      <input
                        inputMode="numeric"
                        value={stoneCardExpMonth}
                        onChange={(e) => setStoneCardExpMonth(e.target.value.replace(/\D/g, "").slice(0, 2))}
                        placeholder="MM"
                        disabled={stoneCardSubmitting}
                        autoComplete="cc-exp-month"
                      />
                    </label>
                    <label className={`${formLayout.field} ${styles.modalField}`}>
                      <span>Ano (AA ou AAAA)</span>
                      <input
                        inputMode="numeric"
                        value={stoneCardExpYear}
                        onChange={(e) => setStoneCardExpYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        placeholder="AA"
                        disabled={stoneCardSubmitting}
                        autoComplete="cc-exp-year"
                      />
                    </label>
                  </div>
                  <label className={`${formLayout.field} ${styles.modalField}`}>
                    <span>CVV</span>
                    <input
                      type="password"
                      inputMode="numeric"
                      value={stoneCardCvv}
                      onChange={(e) => setStoneCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="•••"
                      disabled={stoneCardSubmitting}
                      autoComplete="cc-csc"
                    />
                  </label>
                </>
              ) : null}
              <label className={`${formLayout.field} ${styles.modalField}`}>
                <span>Parcelas (1 a 12)</span>
                <input
                  inputMode="numeric"
                  value={stoneCardInstallments}
                  onChange={(e) => setStoneCardInstallments(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  disabled={stoneCardSubmitting}
                />
              </label>
              <label className={`${formLayout.field} ${styles.modalField}`}>
                <span>card_token (alternativa se não usar campos do cartão)</span>
                <input
                  value={stoneCardToken}
                  onChange={(e) => setStoneCardToken(e.target.value)}
                  placeholder={gateways?.stone?.public_key ? "Opcional se preencher o cartão acima" : "Token da tokenização"}
                  disabled={stoneCardSubmitting}
                  autoComplete="off"
                />
              </label>
              <div className={styles.modalActions}>
                <button type="button" className={styles.modalBtnGhost} onClick={closeStoneCardChargeModal} disabled={stoneCardSubmitting}>
                  Cancelar
                </button>
                <button type="submit" className={styles.modalBtnPrimary} disabled={stoneCardSubmitting}>
                  {stoneCardSubmitting ? "Processando..." : "Cobrar cartão"}
                </button>
              </div>
            </form>
            {stoneCardResult ? (
              <div className={styles.modalResult}>
                <p>
                  Pedido Pagar.me (pago ou em análise): <strong>{stoneCardResult.orderId}</strong>
                </p>
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
              <label className={`${formLayout.field} ${styles.modalField}`}>
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
              <label className={`${formLayout.field} ${styles.modalField}`}>
                <span>CPF do pagador</span>
                <input
                  value={mpBoletoCpf}
                  onChange={(e) => setMpBoletoCpf(e.target.value)}
                  placeholder="000.000.000-00"
                  disabled={mpBoletoSubmitting}
                  autoComplete="off"
                />
              </label>
              <label className={`${formLayout.field} ${styles.modalField}`}>
                <span>Nome (opcional)</span>
                <input
                  value={mpBoletoFirstName}
                  onChange={(e) => setMpBoletoFirstName(e.target.value)}
                  placeholder="Nome"
                  disabled={mpBoletoSubmitting}
                />
              </label>
              <label className={`${formLayout.field} ${styles.modalField}`}>
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
              <label className={`${formLayout.field} ${styles.modalField}`}>
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
              <label className={`${formLayout.field} ${styles.modalField}`}>
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
                <label className={`${formLayout.field} ${styles.modalField}`}>
                  <span>Descrição</span>
                  <input
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    autoComplete="off"
                  />
                </label>
                <div className={styles.modalValorVencGrid}>
                  <div className={`${formLayout.field} ${styles.modalField}`}>
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
                  <label className={`${formLayout.field} ${styles.modalField}`}>
                    <span>Vencimento</span>
                    <input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} />
                  </label>
                </div>
                <label className={`${formLayout.field} ${styles.modalField}`}>
                  <span>Status</span>
                  <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as FinanceEntryStatus)}>
                    <option value="pending">Pendente</option>
                    <option value="paid">Pago</option>
                    <option value="overdue">Vencido</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </label>
                {editInc ? (
                  <label className={`${formLayout.field} ${styles.modalField}`}>
                    <span>Competência (receita)</span>
                    <input type="date" value={editCompetenceDate} onChange={(e) => setEditCompetenceDate(e.target.value)} />
                  </label>
                ) : null}
              </div>

              <div className={styles.modalSection}>
                <div className={styles.modalSectionLabel}>Pagamento</div>
                <div className={styles.row2}>
                  <label className={`${formLayout.field} ${styles.modalField}`}>
                    <span>Meio</span>
                    <select value={editPaymentMethod} onChange={(e) => setEditPaymentMethod(e.target.value)}>
                      {!isStandardFinancePaymentMethodValue(editPaymentMethod) ? (
                        <option value={editPaymentMethod}>Outro: {editPaymentMethod}</option>
                      ) : null}
                      <option value="pix">PIX</option>
                      <option value="cash">Dinheiro</option>
                      <option value="credit_card">Cartão de crédito</option>
                      <option value="debit_card">Cartão de débito</option>
                      <option value="boleto">Boleto</option>
                    </select>
                  </label>
                  {editShowMachineField ? (
                    <label className={`${formLayout.field} ${styles.modalField}`}>
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
                      <label className={`${formLayout.field} ${styles.modalField}`}>
                        <span>{editInc ? "Conta de recebimento" : "Conta de saída"}</span>
                        <FinanceAccountCombobox
                          id="fin-edit-entry-account"
                          accounts={accounts}
                          value={editFinanceAccountId}
                          onChange={setEditFinanceAccountId}
                          gateways={gateways}
                          catalog={bankCatalog}
                          emptyOption
                          emptyLabel="Selecionar"
                        />
                      </label>
                    ) : (
                      <div />
                    )}
                    {editShowCreditCardField ? (
                      <label className={`${formLayout.field} ${styles.modalField}`}>
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
                {editStoneBoletoToolsVisible ? (
                  <div className={styles.editBoletoStonePanel}>
                    <div className={styles.editBoletoStoneHead}>
                      <span className={styles.editBoletoStoneTitle}>Boleto Stone</span>
                      <span className={styles.editBoletoStoneBadge}>Emitido</span>
                    </div>
                    <p className={styles.editBoletoStoneHint}>
                      PDF e linha digitável vêm do Pagar.me. Use o leitor em tela cheia ou reenvie ao cliente.
                    </p>
                    <div className={styles.editBoletoStoneToolbar}>
                      <button
                        type="button"
                        className={styles.modalBtnGhost}
                        disabled={editStoneBoletoBusy}
                        onClick={() => void loadEditStoneBoletoArtifacts({ openPdf: true })}
                      >
                        {editStoneBoletoBusy ? "Carregando…" : "Ver boleto"}
                      </button>
                      <button
                        type="button"
                        className={styles.modalBtnGhost}
                        disabled={editStoneBoletoBusy}
                        onClick={() => void loadEditStoneBoletoArtifacts({ openPdf: false })}
                      >
                        {editStoneBoletoBusy ? "Carregando…" : "Atualizar dados"}
                      </button>
                      <button
                        type="button"
                        className={styles.modalBtnPrimary}
                        disabled={!editStoneBoletoData?.ticketUrl}
                        onClick={() => {
                          const u = editStoneBoletoData?.ticketUrl;
                          if (u) setFinanceBoletoPdfOverlayUrl(u);
                        }}
                      >
                        Visualizar PDF
                      </button>
                      {editStoneBoletoData?.ticketUrl ? (
                        <a
                          className={styles.modalBtnGhost}
                          href={editStoneBoletoData.ticketUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Abrir PDF (nova aba)
                        </a>
                      ) : null}
                    </div>
                    {editStoneBoletoErr ? (
                      <p className={styles.error} role="alert" style={{ margin: "0.4rem 0 0", fontSize: "0.82rem" }}>
                        {editStoneBoletoErr}
                      </p>
                    ) : null}
                    {editStoneBoletoData ? (
                      <div className={styles.editBoletoStoneBody}>
                        <p className={styles.editBoletoStoneMeta}>
                          Pedido: <code>{editStoneBoletoData.orderId}</code>
                          {!editingEntry?.linked_payer_email?.trim() ? (
                            <span className={styles.muted}> — sem e-mail no cliente da OS (use WhatsApp).</span>
                          ) : null}
                        </p>
                        {editStoneBoletoData.digitableLine ? (
                          <details className={styles.editBoletoDetails}>
                            <summary>Linha digitável</summary>
                            <pre className={styles.pixPayload}>{editStoneBoletoData.digitableLine}</pre>
                            <div className={styles.modalShareRow}>
                              <button
                                type="button"
                                className={styles.modalBtnGhost}
                                onClick={() => {
                                  const line = editStoneBoletoData.digitableLine;
                                  if (!line) return;
                                  void navigator.clipboard.writeText(line).then(
                                    () => {
                                      setEditStoneBoletoCopyLineHint("Copiado.");
                                      window.setTimeout(() => setEditStoneBoletoCopyLineHint(""), 2500);
                                    },
                                    () => {
                                      setEditStoneBoletoCopyLineHint("Copie manualmente (Ctrl+C).");
                                      window.setTimeout(() => setEditStoneBoletoCopyLineHint(""), 4000);
                                    },
                                  );
                                }}
                              >
                                Copiar linha
                              </button>
                              {editStoneBoletoCopyLineHint ? (
                                <span className={styles.muted} style={{ fontSize: "0.8rem" }}>
                                  {editStoneBoletoCopyLineHint}
                                </span>
                              ) : null}
                            </div>
                          </details>
                        ) : null}
                        {editStoneBoletoData.barcode ? (
                          <details className={styles.editBoletoDetails}>
                            <summary>Código de barras</summary>
                            <p className={styles.muted}>
                              <code>{editStoneBoletoData.barcode}</code>
                            </p>
                          </details>
                        ) : null}
                        <label className={`${formLayout.field} ${styles.modalField} ${styles.modalShareField}`}>
                          <span>WhatsApp do cliente (DDD + número)</span>
                          <input
                            type="tel"
                            value={editStoneBoletoShareWhatsapp}
                            onChange={(e) => setEditStoneBoletoShareWhatsapp(formatPhoneBrInput(e.target.value))}
                            placeholder="(34) 99999-9999"
                            autoComplete="tel"
                          />
                        </label>
                        <div className={styles.modalShareRow}>
                          {editStoneBoletoMailtoHref ? (
                            <a className={styles.modalBtnGhost} href={editStoneBoletoMailtoHref} rel="noreferrer">
                              E-mail ao cliente
                            </a>
                          ) : (
                            <button type="button" className={styles.modalBtnGhost} disabled title="Cadastre e-mail no cliente da OS">
                              E-mail ao cliente
                            </button>
                          )}
                          {editStoneBoletoWhatsappHref ? (
                            <a
                              className={styles.modalBtnPrimary}
                              href={editStoneBoletoWhatsappHref}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              WhatsApp
                            </a>
                          ) : (
                            <button
                              type="button"
                              className={styles.modalBtnPrimary}
                              disabled
                              title="Informe o celular com DDD (10 ou 11 dígitos)"
                            >
                              WhatsApp
                            </button>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <label className={`${formLayout.field} ${styles.modalField}`}>
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

              <label className={`${formLayout.field} ${styles.modalField}`}>
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
                  <label className={`${formLayout.field} ${styles.modalField}`} style={{ margin: 0 }}>
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

      {financeBoletoPdfOverlayUrl
        ? createPortal(
            <div
              className={styles.boletoPdfOverlay}
              role="dialog"
              aria-modal="true"
              aria-label="Visualizar boleto em PDF"
            >
              <button
                type="button"
                className={styles.boletoPdfOverlayBackdrop}
                aria-label="Fechar visualizador"
                onClick={() => setFinanceBoletoPdfOverlayUrl(null)}
              />
              <div className={styles.boletoPdfOverlayCard}>
                <header className={styles.boletoPdfOverlayHeader}>
                  <h3>Boleto (PDF)</h3>
                  <div className={styles.boletoPdfOverlayActions}>
                    <a
                      className={styles.modalBtnGhost}
                      href={financeBoletoPdfOverlayUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Abrir em nova aba
                    </a>
                    <button type="button" className={styles.modalBtnPrimary} onClick={() => setFinanceBoletoPdfOverlayUrl(null)}>
                      Fechar
                    </button>
                  </div>
                </header>
                <iframe title="Boleto PDF" src={financeBoletoPdfOverlayUrl} className={styles.boletoPdfOverlayFrame} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
