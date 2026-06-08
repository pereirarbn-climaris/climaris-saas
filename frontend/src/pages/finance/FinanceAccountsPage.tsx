import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  deleteFinanceAccount,
  deleteFinanceGatewayAsaas,
  deleteFinanceGatewayMercadoPago,
  deleteFinanceGatewayStone,
  getFinanceGateways,
  getFinanceBalanceSnapshot,
  listFinanceAccounts,
  listFinanceBankCatalog,
  listFinanceEntries,
  syncFinanceAccountBalances,
  patchFinanceEntry,
  patchFinanceGatewayMercadoPagoProducts,
  patchFinanceGatewayMercadoPagoWebhookSignature,
  testFinanceGatewayAsaas,
  testFinanceGatewayMercadoPago,
  testFinanceGatewayStone,
  upsertFinanceGatewayAsaas,
  upsertFinanceGatewayMercadoPago,
  upsertFinanceGatewayStone,
  applyFinanceOfxMatches,
  uploadFinanceOfxImport,
  type FinanceBankAccountOut,
  type FinanceOfxLineOut,
  type FinanceEntryOut,
  type FinanceBankCatalogRow,
  type FinanceGatewayMercadoPagoProducts,
  type FinanceGatewaysOut,
} from "../../api/finance";
import { AccountRegistrationWizard } from "../../components/finance/AccountRegistrationWizard";
import { FinanceCadastroPageShell } from "../../components/finance/FinanceCadastroPageShell";
import { FinanceAccountConfigModal } from "../../components/finance/FinanceAccountConfigModal";
import { FinanceAccountCard } from "../../components/finance/FinanceAccountCard";
import { financeAccountConfigProvider } from "../../components/finance/FinanceAccountBankMark";
import { Button } from "../../components/ui/button";
import { DeleteConfirmModal } from "../../components/ui/delete-confirm-modal";
import {
  Calendar,
  CheckCircle2,
  FileText,
  GitCompareArrows,
  Inbox,
  Loader2,
  Plus,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import styles from "./FinanceAccountsPage.module.css";

function money(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}

function formatDateBr(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function ofxAmountMatchesEntry(ofxAmount: number, entry: FinanceEntryOut): boolean {
  const tol = 0.02;
  const ea = Math.abs(Number(entry.amount || 0));
  const oa = Math.abs(ofxAmount);
  if (Math.abs(ea - oa) > tol) return false;
  if (ofxAmount > 0) return entry.entry_type === "income";
  if (ofxAmount < 0) return entry.entry_type === "expense";
  return false;
}

type OfxSuggestion = FinanceOfxLineOut["suggestions"][number];

function buildOfxMatchOptions(
  line: FinanceOfxLineOut,
  pendingEntries: FinanceEntryOut[],
): { auto: OfxSuggestion[]; manual: FinanceEntryOut[] } {
  const autoIds = new Set(line.suggestions.map((s) => s.id));
  const manual = pendingEntries.filter(
    (e) => !autoIds.has(e.id) && ofxAmountMatchesEntry(Number(line.amount), e),
  );
  return { auto: line.suggestions, manual };
}

type AccountsConfirmAction =
  | { kind: "delete_account"; account: FinanceBankAccountOut }
  | { kind: "remove_asaas" }
  | { kind: "remove_mp" }
  | { kind: "remove_stone" }
  | { kind: "clear_mp_webhook" };

function accountsConfirmCopy(action: AccountsConfirmAction): {
  title: string;
  description: string;
  confirmLabel: string;
  busyLabel: string;
  hint?: string;
} {
  switch (action.kind) {
    case "delete_account":
      return {
        title: "Excluir conta",
        description: `Deseja excluir a conta "${action.account.name}"?`,
        confirmLabel: "Excluir conta",
        busyLabel: "Excluindo…",
        hint: "Integrações de gateway vinculadas a esta conta serão removidas. Esta ação não pode ser desfeita.",
      };
    case "remove_asaas":
      return {
        title: "Remover integração Asaas",
        description: "A integração Asaas será desconectada deste workspace.",
        confirmLabel: "Remover",
        busyLabel: "Removendo…",
      };
    case "remove_mp":
      return {
        title: "Remover Mercado Pago",
        description: "A integração Mercado Pago será desconectada deste workspace.",
        confirmLabel: "Remover",
        busyLabel: "Removendo…",
      };
    case "remove_stone":
      return {
        title: "Remover Stone / Pagar.me",
        description: "A integração Stone / Pagar.me será desconectada deste workspace.",
        confirmLabel: "Remover",
        busyLabel: "Removendo…",
      };
    case "clear_mp_webhook":
      return {
        title: "Remover segredo do webhook",
        description:
          "O segredo de assinatura do webhook Mercado Pago será removido. Notificações deixarão de exigir x-signature até você configurar de novo.",
        confirmLabel: "Remover segredo",
        busyLabel: "Removendo…",
      };
    default:
      return {
        title: "Confirmar",
        description: "",
        confirmLabel: "Confirmar",
        busyLabel: "Aguarde…",
      };
  }
}

const CADASTRO_NAV = [
  { to: "/app/finance/settings/accounts", label: "Contas", active: true },
  { to: "/app/finance/settings/cards", label: "Cartões" },
  { to: "/app/finance/settings/machines", label: "Maquininhas" },
];

const MP_PRODUCTS_DEFAULT: FinanceGatewayMercadoPagoProducts = {
  checkout_pro: false,
  pix: false,
  boleto: false,
  subscriptions: false,
  payment_link: false,
};

export function FinanceAccountsPage() {
  const [accounts, setAccounts] = useState<FinanceBankAccountOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingBalances, setSyncingBalances] = useState(false);
  const [balancesByAccountId, setBalancesByAccountId] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [accountWizardOpen, setAccountWizardOpen] = useState(false);
  const [reconcileAccount, setReconcileAccount] = useState<FinanceBankAccountOut | null>(null);
  const [reconcileStart, setReconcileStart] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [reconcileEnd, setReconcileEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [reconcileRows, setReconcileRows] = useState<FinanceEntryOut[]>([]);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [ofxImportId, setOfxImportId] = useState<number | null>(null);
  const [ofxLines, setOfxLines] = useState<FinanceOfxLineOut[]>([]);
  const [ofxPicks, setOfxPicks] = useState<Record<number, string>>({});
  const [ofxUploading, setOfxUploading] = useState(false);
  const [ofxApplying, setOfxApplying] = useState(false);
  const [gateways, setGateways] = useState<FinanceGatewaysOut | null>(null);
  const [configAccount, setConfigAccount] = useState<FinanceBankAccountOut | null>(null);
  const [configProvider, setConfigProvider] = useState<"asaas" | "mercadopago" | "stone" | "none">("none");
  const [asaasApiKey, setAsaasApiKey] = useState("");
  const [asaasSandbox, setAsaasSandbox] = useState(false);
  const [mpPublicKey, setMpPublicKey] = useState("");
  const [mpAccessToken, setMpAccessToken] = useState("");
  const [mpSandbox, setMpSandbox] = useState(false);
  const [, setMpTestOk] = useState(false);
  const [mpProducts, setMpProducts] = useState<FinanceGatewayMercadoPagoProducts>(MP_PRODUCTS_DEFAULT);
  const [mpWebhookSigSecret, setMpWebhookSigSecret] = useState("");
  const [stoneSecretKey, setStoneSecretKey] = useState("");
  const [stonePublicKey, setStonePublicKey] = useState("");
  const [stoneSandbox, setStoneSandbox] = useState(false);
  const [stoneTesting, setStoneTesting] = useState(false);
  const [stoneSaving, setStoneSaving] = useState(false);
  const [bankCatalog, setBankCatalog] = useState<FinanceBankCatalogRow[] | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const stoneGatewayDeepLinkDone = useRef(false);
  const ofxFileInputRef = useRef<HTMLInputElement>(null);
  const [ofxFileLabel, setOfxFileLabel] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<AccountsConfirmAction | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  async function loadAccountBalances(accs: FinanceBankAccountOut[]) {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const snap = await getFinanceBalanceSnapshot({ end_date: today, date_basis: "due_date" });
      const map: Record<number, number> = {};
      for (const row of snap.accounts) {
        map[row.id] = row.current_balance;
      }
      setBalancesByAccountId(map);
    } catch {
      const fallback: Record<number, number> = {};
      for (const a of accs) {
        fallback[a.id] = Number(a.initial_balance || 0);
      }
      setBalancesByAccountId(fallback);
    }
  }

  async function loadAccounts() {
    setLoading(true);
    setError(null);
    try {
      const [accs, gws] = await Promise.all([listFinanceAccounts(), getFinanceGateways()]);
      setAccounts(accs);
      setGateways(gws);
      await loadAccountBalances(accs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar contas.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshBalances() {
    setSyncingBalances(true);
    setError(null);
    setMsg(null);
    try {
      const res = await syncFinanceAccountBalances();
      setAccounts(res.accounts);
      await loadAccountBalances(res.accounts);
      const mp = res.results.find((r) => r.provider === "mercadopago");
      if (mp?.ok && mp.balance != null) {
        setMsg(`Saldo Mercado Pago atualizado: ${money(mp.balance)}.`);
      } else if (res.results.some((r) => !r.ok)) {
        const err = res.results.find((r) => r.message)?.message;
        setMsg(err ? `Algumas integrações falharam: ${err}` : "Saldos recalculados a partir dos lançamentos.");
      } else {
        setMsg("Saldos atualizados.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar saldos.");
    } finally {
      setSyncingBalances(false);
    }
  }

  useEffect(() => {
    void loadAccounts();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listFinanceBankCatalog()
      .then((rows) => {
        if (!cancelled) setBankCatalog(rows);
      })
      .catch(() => {
        if (!cancelled) setBankCatalog(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cards = useMemo(() => accounts.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [accounts]);

  function openNew() {
    setAccountWizardOpen(true);
    setMsg(null);
    setError(null);
  }

  function requestDeleteAccount(row: FinanceBankAccountOut) {
    setConfirmAction({ kind: "delete_account", account: row });
  }

  async function runConfirmAction() {
    if (!confirmAction) return;
    const action = confirmAction;
    setConfirmBusy(true);
    setError(null);
    try {
      switch (action.kind) {
        case "delete_account":
          await deleteFinanceAccount(action.account.id);
          setMsg(`Conta "${action.account.name}" excluída.`);
          await loadAccounts();
          break;
        case "remove_asaas":
          await deleteFinanceGatewayAsaas();
          await loadAccounts();
          setMsg("Integração Asaas removida.");
          break;
        case "remove_mp":
          await deleteFinanceGatewayMercadoPago();
          await loadAccounts();
          setMsg("Integração Mercado Pago removida.");
          setConfigAccount(null);
          break;
        case "remove_stone":
          await deleteFinanceGatewayStone();
          await loadAccounts();
          setMsg("Integração Stone / Pagar.me removida.");
          setConfigAccount(null);
          break;
        case "clear_mp_webhook": {
          const res = await patchFinanceGatewayMercadoPagoWebhookSignature({ clear_webhook_signature_secret: true });
          setGateways((g) => (g ? { ...g, asaas: res.asaas, mercadopago: res.mercadopago, stone: res.stone } : g));
          setMpWebhookSigSecret("");
          setMsg("Segredo de assinatura removido.");
          break;
        }
        default:
          break;
      }
      setConfirmAction(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível concluir a ação.");
    } finally {
      setConfirmBusy(false);
    }
  }

  function closeReconcileModal() {
    setReconcileAccount(null);
    setReconcileRows([]);
    setOfxImportId(null);
    setOfxLines([]);
    setOfxPicks({});
    setOfxFileLabel(null);
  }

  function openReconcile(row: FinanceBankAccountOut) {
    setReconcileAccount(row);
    setReconcileRows([]);
    setOfxImportId(null);
    setOfxLines([]);
    setOfxPicks({});
    setOfxFileLabel(null);
    setMsg(null);
    setError(null);
  }

  useEffect(() => {
    if (!reconcileAccount) return;
    void loadReconcileRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carrega ao abrir o modal
  }, [reconcileAccount?.id]);

  useEffect(() => {
    if (!reconcileAccount) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeReconcileModal();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [reconcileAccount]);

  async function handleOfxFileSelected(file: File) {
    if (!reconcileAccount) return;
    setOfxUploading(true);
    setError(null);
    setOfxFileLabel(file.name);
    try {
      const res = await uploadFinanceOfxImport(reconcileAccount.id, file);
      setOfxImportId(res.import_id);
      setOfxLines(res.lines);
      const picks: Record<number, string> = {};
      for (const L of res.lines) {
        picks[L.id] = L.suggestions.length ? String(L.suggestions[0].id) : "";
      }
      setOfxPicks(picks);
      if (res.lines.length > 0) {
        const sortedDates = res.lines.map((l) => l.posted_at).sort();
        const start = addDaysIso(sortedDates[0], -30);
        const end = addDaysIso(sortedDates[sortedDates.length - 1], 30);
        setReconcileStart(start);
        setReconcileEnd(end);
        await loadReconcileRows(start, end);
      }
      const withSuggestions = res.lines.filter((l) => l.suggestions.length > 0).length;
      setMsg(
        `OFX importado: ${res.lines_count} linha(s)${res.truncated ? " (arquivo truncado no limite do servidor)" : ""}.` +
          (withSuggestions > 0
            ? ` ${withSuggestions} com sugestão automática.`
            : " Nenhuma sugestão automática — vincule manualmente aos lançamentos pendentes abaixo."),
      );
    } catch (e) {
      setOfxFileLabel(null);
      setError(e instanceof Error ? e.message : "Falha ao importar OFX.");
    } finally {
      setOfxUploading(false);
    }
  }

  async function loadReconcileRows(startOverride?: string, endOverride?: string) {
    if (!reconcileAccount) return;
    const start = startOverride ?? reconcileStart;
    const end = endOverride ?? reconcileEnd;
    setReconcileLoading(true);
    setError(null);
    try {
      const base = { start_date: start, end_date: end, limit: 200 };
      const [pending, overdue] = await Promise.all([
        listFinanceEntries({ ...base, status: "pending" }),
        listFinanceEntries({ ...base, status: "overdue" }),
      ]);
      const byId = new Map<number, FinanceEntryOut>();
      for (const r of [...pending, ...overdue]) byId.set(r.id, r);
      const filtered = [...byId.values()].filter((r) => {
        if (r.finance_account_id === reconcileAccount.id) return true;
        if (r.finance_account_id == null) return true;
        return (
          reconcileAccount.name.trim().toLowerCase() === "caixa" &&
          (r.payment_method || "").toLowerCase() === "cash"
        );
      });
      setReconcileRows(filtered.sort((a, b) => a.due_date.localeCompare(b.due_date)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar extrato para conciliação.");
    } finally {
      setReconcileLoading(false);
    }
  }

  const pendingForOfxMatch = useMemo(() => {
    if (!reconcileAccount) return [];
    return reconcileRows.filter(
      (r) =>
        (r.status === "pending" || r.status === "overdue") &&
        (r.finance_account_id === reconcileAccount.id || r.finance_account_id == null),
    );
  }, [reconcileRows, reconcileAccount]);

  async function reconcileAsPaid(row: FinanceEntryOut) {
    try {
      await patchFinanceEntry(row.id, { status: "paid" });
      await loadReconcileRows();
      setMsg(`Movimentação "${row.description}" conciliada como paga.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao conciliar movimentação.");
    }
  }

  function openConfig(row: FinanceBankAccountOut) {
    setConfigAccount(row);
    const provider = financeAccountConfigProvider(row, gateways);
    if (provider === "asaas") {
      setConfigProvider("asaas");
      setAsaasSandbox(Boolean(gateways?.asaas.sandbox));
    } else if (provider === "mercadopago") {
      setConfigProvider("mercadopago");
      setMpSandbox(Boolean(gateways?.mercadopago.sandbox));
      setMpPublicKey("");
      setMpAccessToken("");
      setMpTestOk(false);
      setMpWebhookSigSecret("");
      const p = gateways?.mercadopago?.products;
      setMpProducts(
        p
          ? {
              checkout_pro: Boolean(p.checkout_pro),
              pix: Boolean(p.pix),
              boleto: Boolean(p.boleto),
              subscriptions: Boolean(p.subscriptions),
              payment_link: Boolean(p.payment_link),
            }
          : { ...MP_PRODUCTS_DEFAULT },
      );
    } else if (provider === "stone") {
      setConfigProvider("stone");
      setStoneSandbox(Boolean(gateways?.stone.sandbox));
      setStoneSecretKey("");
      setStonePublicKey(gateways?.stone?.public_key ?? "");
    } else setConfigProvider("none");
  }

  useEffect(() => {
    if (loading || stoneGatewayDeepLinkDone.current) return;
    if (searchParams.get("gateway") !== "stone") return;
    if (!gateways) return;
    if (accounts.length === 0) {
      stoneGatewayDeepLinkDone.current = true;
      setMsg("Cadastre uma conta bancária em Contas e carteiras para vincular o Pagar.me.");
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete("gateway");
          return next;
        },
        { replace: true },
      );
      return;
    }
    stoneGatewayDeepLinkDone.current = true;
    const accId = gateways.stone.finance_bank_account_id;
    if (accId == null) {
      setMsg(
        "Para configurar o Pagar.me: abra o menu de configuração na conta bancária onde deseja vincular a integração.",
      );
    } else {
      const row = accounts.find((a) => a.id === accId);
      if (row) openConfig(row);
      else setMsg("Conta vinculada ao Pagar.me não foi encontrada. Verifique Contas e carteiras.");
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("gateway");
        return next;
      },
      { replace: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deep link once when lista + gateways carregam
  }, [loading, accounts, gateways, searchParams, setSearchParams]);

  async function testAsaasConfig() {
    if (!asaasApiKey.trim()) return;
    try {
      const r = await testFinanceGatewayAsaas({ api_key: asaasApiKey.trim(), sandbox: asaasSandbox });
      setMsg(r.ok ? "Asaas validado com sucesso." : r.error || "Falha ao validar Asaas.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao testar Asaas.");
    }
  }

  async function saveAsaasConfig() {
    if (!asaasApiKey.trim()) return;
    try {
      const res = await upsertFinanceGatewayAsaas({ api_key: asaasApiKey.trim(), sandbox: asaasSandbox });
      setAsaasApiKey("");
      setGateways((g) => (g ? { ...g, asaas: res.asaas, mercadopago: res.mercadopago, stone: res.stone } : g));
      await loadAccounts();
      setMsg("Integração Asaas salva.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar Asaas.");
    }
  }

  function removeAsaasConfig() {
    setConfirmAction({ kind: "remove_asaas" });
  }

  async function testMpCredentials() {
    if (!mpAccessToken.trim() || !mpPublicKey.trim()) {
      setError("Informe Public Key e Access Token.");
      return;
    }
    try {
      const r = await testFinanceGatewayMercadoPago({
        access_token: mpAccessToken.trim(),
        public_key: mpPublicKey.trim(),
        sandbox: mpSandbox,
      });
      setMpTestOk(Boolean(r.ok));
      setMsg(r.ok ? `Credenciais válidas${r.account_label ? ` (${r.account_label})` : ""}.` : r.error || "Falha na validação.");
      if (!r.ok) setError(r.error || "Token inválido.");
      else setError(null);
    } catch (e) {
      setMpTestOk(false);
      setError(e instanceof Error ? e.message : "Falha ao testar Mercado Pago.");
    }
  }

  async function saveMpGatewayFromConfig() {
    if (!configAccount) return;
    if (gateways?.mercadopago?.connected && gateways.mercadopago.finance_bank_account_id != null) {
      if (gateways.mercadopago.finance_bank_account_id !== configAccount.id) {
        setError("As credenciais do Mercado Pago devem ser salvas na conta já vinculada à integração.");
        return;
      }
    }
    if (!mpAccessToken.trim() || !mpPublicKey.trim()) {
      setError("Informe Public Key e Access Token para atualizar.");
      return;
    }
    try {
      const res = await upsertFinanceGatewayMercadoPago({
        access_token: mpAccessToken.trim(),
        public_key: mpPublicKey.trim(),
        sandbox: mpSandbox,
        finance_bank_account_id: configAccount.id,
        products: mpProducts,
      });
      setGateways((g) => (g ? { ...g, asaas: res.asaas, mercadopago: res.mercadopago, stone: res.stone } : g));
      setMpPublicKey("");
      setMpAccessToken("");
      await loadAccounts();
      setMsg("Credenciais Mercado Pago atualizadas.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar Mercado Pago.");
    }
  }

  async function saveMpProductsFromConfig() {
    try {
      const res = await patchFinanceGatewayMercadoPagoProducts(mpProducts);
      setGateways((g) => (g ? { ...g, asaas: res.asaas, mercadopago: res.mercadopago, stone: res.stone } : g));
      setMsg("Produtos Mercado Pago salvos.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar produtos.");
    }
  }

  async function saveMpWebhookSignatureFromConfig() {
    if (!mpWebhookSigSecret.trim()) return;
    try {
      const res = await patchFinanceGatewayMercadoPagoWebhookSignature({
        webhook_signature_secret: mpWebhookSigSecret.trim(),
      });
      setGateways((g) => (g ? { ...g, asaas: res.asaas, mercadopago: res.mercadopago, stone: res.stone } : g));
      setMpWebhookSigSecret("");
      setMsg("Segredo de assinatura do webhook salvo.");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar o segredo.");
    }
  }

  function clearMpWebhookSignatureFromConfig() {
    setConfirmAction({ kind: "clear_mp_webhook" });
  }

  function removeMpConfig() {
    setConfirmAction({ kind: "remove_mp" });
  }

  function copyMpWebhook() {
    const u = gateways?.mercadopago?.webhook_url;
    if (!u) return;
    void navigator.clipboard.writeText(u).then(() => setMsg("URL do webhook copiada."));
  }

  async function testStoneCredentials() {
    if (!stoneSecretKey.trim()) {
      setError("Informe a chave secreta Pagar.me (sk_…).");
      return;
    }
    setStoneTesting(true);
    setError(null);
    setMsg(null);
    try {
      const r = await testFinanceGatewayStone({ secret_key: stoneSecretKey.trim() });
      setMsg(r.ok ? `Chave válida${r.account_label ? ` (${r.account_label})` : ""}.` : r.error || "Falha na validação.");
      if (!r.ok) setError(r.error || "Chave inválida.");
      else setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao testar Stone / Pagar.me.");
    } finally {
      setStoneTesting(false);
    }
  }

  async function saveStoneGatewayFromConfig() {
    if (!configAccount) return;
    if (gateways?.stone?.connected && gateways.stone.finance_bank_account_id != null) {
      if (gateways.stone.finance_bank_account_id !== configAccount.id) {
        setError("A chave Stone / Pagar.me deve ser salva na conta já vinculada à integração.");
        return;
      }
    }
    if (!stoneSecretKey.trim() && !gateways?.stone?.connected) {
      setError("Informe a chave secreta para conectar (cole de novo se o campo parecer preenchido mas o botão não reagir — o autocompletar do navegador às vezes não grava o valor).");
      return;
    }
    setStoneSaving(true);
    setError(null);
    setMsg(null);
    try {
      const res = await upsertFinanceGatewayStone({
        secret_key: stoneSecretKey.trim(),
        sandbox: stoneSandbox,
        finance_bank_account_id: configAccount.id,
        public_key: stonePublicKey.trim(),
      });
      setGateways((g) => (g ? { ...g, asaas: res.asaas, mercadopago: res.mercadopago, stone: res.stone } : g));
      setStoneSecretKey("");
      setStonePublicKey(res.stone.public_key ?? "");
      await loadAccounts();
      setMsg("Integração Stone / Pagar.me salva. Configure o mesmo URL de webhook no painel Pagar.me.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar Stone / Pagar.me.");
    } finally {
      setStoneSaving(false);
    }
  }

  function removeStoneConfig() {
    setConfirmAction({ kind: "remove_stone" });
  }

  function copyStoneWebhook() {
    const u = gateways?.stone?.webhook_url;
    if (!u) return;
    void navigator.clipboard.writeText(u).then(() => setMsg("URL do webhook Stone copiada."));
  }

  return (
    <FinanceCadastroPageShell
      breadcrumb="Financeiro · Cadastros · Contas"
      title="Contas e carteiras"
      subtitle="Gerencie bancos, gateways e saldos do seu caixa."
      navLinks={CADASTRO_NAV}
      error={!configAccount && !reconcileAccount ? error : null}
      msg={!configAccount && !reconcileAccount ? msg : null}
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => void refreshBalances()}
            disabled={loading || syncingBalances}
            aria-busy={syncingBalances}
          >
            <RefreshCw size={18} strokeWidth={2.25} aria-hidden className={syncingBalances ? styles.spinIcon : undefined} />
            {syncingBalances ? "Atualizando…" : "Atualizar saldos"}
          </Button>
          <Button type="button" onClick={openNew}>
            <Plus size={18} strokeWidth={2.25} aria-hidden />
            Adicionar conta
          </Button>
        </>
      }
    >
      {loading ? (
        <div className={styles.cardsGrid} aria-busy="true" aria-label="Carregando contas">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className={styles.cardSkeleton} />
          ))}
        </div>
      ) : null}
      {!loading ? (
        <div className={styles.cardsGrid}>
          {cards.map((a) => {
            const provider = financeAccountConfigProvider(a, gateways);
            return (
              <FinanceAccountCard
                key={a.id}
                account={a}
                gateways={gateways}
                catalog={bankCatalog}
                displayBalance={balancesByAccountId[a.id]}
                showGatewayReconciliation={provider === "mercadopago" || provider === "stone"}
                onReconcile={() => openReconcile(a)}
                onConfigure={() => openConfig(a)}
                onDelete={() => requestDeleteAccount(a)}
              />
            );
          })}
        </div>
      ) : null}

      <AccountRegistrationWizard
        open={accountWizardOpen}
        accounts={accounts}
        onClose={() => setAccountWizardOpen(false)}
        onSaved={(message) => setMsg(message)}
        onError={setError}
        onGatewaysChange={(patch) => setGateways((g) => (g ? { ...g, ...patch } : g))}
        reloadAccounts={loadAccounts}
      />

      {reconcileAccount ? (
        <div
          className={styles.reconcileOverlay}
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeReconcileModal();
          }}
        >
          <div
            className={styles.reconcileDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reconcile-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className={styles.reconcileDialogHeader}>
              <div className={styles.reconcileDialogTitleWrap}>
                <span className={styles.reconcileDialogIcon} aria-hidden>
                  <GitCompareArrows size={22} strokeWidth={2} />
                </span>
                <div>
                  <h2 id="reconcile-dialog-title" className={styles.reconcileDialogTitle}>
                    Conciliação bancária
                  </h2>
                  <p className={styles.reconcileDialogSubtitle}>{reconcileAccount.name}</p>
                </div>
              </div>
              <button
                type="button"
                className={styles.reconcileDialogClose}
                onClick={closeReconcileModal}
                aria-label="Fechar conciliação"
              >
                <X size={20} strokeWidth={2} aria-hidden />
              </button>
            </header>

            <div className={styles.reconcileDialogBody}>
              {error && reconcileAccount ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
              {msg && reconcileAccount ? (
                <p className={styles.msg} role="status">
                  {msg}
                </p>
              ) : null}

              <section className={styles.reconcilePanel}>
                <h3 className={styles.reconcilePanelTitle}>
                  <Calendar size={16} strokeWidth={2} aria-hidden />
                  Período do extrato
                </h3>
                <div className={styles.reconcileFilters}>
                  <label className={styles.reconcileDateField}>
                    <span>De</span>
                    <input
                      type="date"
                      value={reconcileStart}
                      onChange={(e) => setReconcileStart(e.target.value)}
                    />
                  </label>
                  <label className={styles.reconcileDateField}>
                    <span>Até</span>
                    <input
                      type="date"
                      value={reconcileEnd}
                      onChange={(e) => setReconcileEnd(e.target.value)}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void loadReconcileRows()}
                    disabled={reconcileLoading}
                    aria-busy={reconcileLoading}
                  >
                    {reconcileLoading ? (
                      <Loader2 size={16} className={styles.spinIcon} aria-hidden />
                    ) : (
                      <RefreshCw size={16} aria-hidden />
                    )}
                    {reconcileLoading ? "Carregando…" : "Atualizar extrato"}
                  </Button>
                </div>
                <p className={styles.reconcilePeriodHint}>
                  {formatDateBr(reconcileStart)} — {formatDateBr(reconcileEnd)}
                </p>
              </section>

              <section className={styles.reconcilePanel}>
                <h3 className={styles.reconcilePanelTitle}>
                  <Upload size={16} strokeWidth={2} aria-hidden />
                  Importar OFX
                </h3>
                <p className={styles.reconcilePanelDesc}>
                  Envie o extrato exportado pelo banco ou carteira (Stone, Nubank, Itaú, Infinitay, etc.). O sistema
                  sugere lançamentos por valor e data — revise antes de confirmar.
                </p>
                <input
                  ref={ofxFileInputRef}
                  type="file"
                  accept=".ofx,.OFX"
                  className={styles.ofxFileInputHidden}
                  disabled={ofxUploading}
                  onChange={(ev) => {
                    const f = ev.target.files?.[0];
                    ev.target.value = "";
                    if (!f) return;
                    void handleOfxFileSelected(f);
                  }}
                />
                <button
                  type="button"
                  className={`${styles.ofxDropZone} ${ofxUploading ? styles.ofxDropZoneBusy : ""}`}
                  disabled={ofxUploading}
                  onClick={() => ofxFileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const f = e.dataTransfer.files?.[0];
                    if (f) void handleOfxFileSelected(f);
                  }}
                >
                  {ofxUploading ? (
                    <Loader2 size={28} className={styles.spinIcon} aria-hidden />
                  ) : (
                    <FileText size={28} strokeWidth={1.5} aria-hidden />
                  )}
                  <span className={styles.ofxDropZoneTitle}>
                    {ofxUploading ? "Processando arquivo…" : "Clique para escolher o arquivo .ofx"}
                  </span>
                  <span className={styles.ofxDropZoneHint}>
                    {ofxFileLabel ?? "ou arraste o arquivo para esta área"}
                  </span>
                </button>
                {ofxImportId != null && ofxLines.length > 0 ? (
                  <div className={styles.reconcileOfxActions}>
                    <span className={styles.reconcileOfxCount}>
                      {ofxLines.length} linha(s) importada(s)
                    </span>
                    <Button
                      type="button"
                      disabled={ofxApplying}
                      onClick={() => {
                        if (!reconcileAccount || ofxImportId == null) return;
                        const matches: { line_id: number; finance_entry_id: number }[] = [];
                        for (const L of ofxLines) {
                          if (L.matched_finance_entry_id) continue;
                          const v = (ofxPicks[L.id] || "").trim();
                          if (!v) continue;
                          matches.push({ line_id: L.id, finance_entry_id: Number(v) });
                        }
                        if (!matches.length) {
                          setError(
                            "Em cada linha do extrato, escolha um lançamento pendente no menu (ou deixe em «Ignorar»).",
                          );
                          return;
                        }
                        void (async () => {
                          setOfxApplying(true);
                          setError(null);
                          try {
                            await applyFinanceOfxMatches(reconcileAccount.id, ofxImportId, matches);
                            setMsg(`Conciliação OFX: ${matches.length} lançamento(s) marcados como pagos.`);
                            setOfxImportId(null);
                            setOfxLines([]);
                            setOfxPicks({});
                            setOfxFileLabel(null);
                            await loadReconcileRows();
                          } catch (e) {
                            setError(e instanceof Error ? e.message : "Falha ao aplicar conciliação OFX.");
                          } finally {
                            setOfxApplying(false);
                          }
                        })();
                      }}
                    >
                      {ofxApplying ? (
                        <>
                          <Loader2 size={16} className={styles.spinIcon} aria-hidden />
                          Aplicando…
                        </>
                      ) : (
                        "Aplicar conciliações selecionadas"
                      )}
                    </Button>
                  </div>
                ) : null}
                {ofxLines.length > 0 ? (
                  <div className={`${styles.reconcileList} ${styles.reconcileListOfx}`}>
                    {ofxLines.map((L) => {
                      const { auto, manual } = buildOfxMatchOptions(L, pendingForOfxMatch);
                      const hasOptions = auto.length > 0 || manual.length > 0;
                      return (
                      <div key={L.id} className={styles.reconcileRow}>
                        <div className={styles.reconcileRowMain}>
                          <strong>{L.payee || L.memo || "Movimentação OFX"}</strong>
                          <p className={styles.reconcileRowMeta}>
                            {formatDateBr(L.posted_at)} · FITID {L.fit_id}
                            {L.matched_finance_entry_id ? ` · vinculado #${L.matched_finance_entry_id}` : ""}
                          </p>
                          {!L.matched_finance_entry_id && !hasOptions ? (
                            <p className={styles.reconcileNoMatch}>
                              Nenhum lançamento pendente com este valor nesta conta. Cadastre em Financeiro ou amplie o
                              período acima.
                            </p>
                          ) : null}
                        </div>
                        <div className={styles.reconcileRowActions}>
                          <strong
                            className={
                              Number(L.amount) >= 0 ? styles.amountPositive : styles.amountNegative
                            }
                          >
                            {money(Number(L.amount))}
                          </strong>
                          {L.matched_finance_entry_id ? (
                            <span className={styles.reconcileBadgeOk}>
                              <CheckCircle2 size={14} aria-hidden />
                              Conciliado
                            </span>
                          ) : (
                            <select
                              className={styles.reconcileSelect}
                              value={ofxPicks[L.id] ?? ""}
                              onChange={(e) => setOfxPicks((p) => ({ ...p, [L.id]: e.target.value }))}
                              aria-label={`Vincular linha OFX ${L.id} a um lançamento`}
                            >
                              <option value="">Ignorar esta linha</option>
                              {auto.length > 0 ? (
                                <optgroup label="Sugestão automática">
                                  {auto.map((s) => (
                                    <option key={s.id} value={String(s.id)}>
                                      #{s.id} {s.description.slice(0, 32)}
                                      {s.description.length > 32 ? "…" : ""} · {money(s.amount)} ·{" "}
                                      {formatDateBr(s.due_date)}
                                    </option>
                                  ))}
                                </optgroup>
                              ) : null}
                              {manual.length > 0 ? (
                                <optgroup label="Outros pendentes (mesmo valor)">
                                  {manual.map((e) => (
                                    <option key={e.id} value={String(e.id)}>
                                      #{e.id} {e.description.slice(0, 32)}
                                      {e.description.length > 32 ? "…" : ""} · {money(Number(e.amount))} ·{" "}
                                      {formatDateBr(e.due_date)}
                                      {e.finance_account_id == null ? " · sem conta" : ""}
                                    </option>
                                  ))}
                                </optgroup>
                              ) : null}
                            </select>
                          )}
                        </div>
                      </div>
                    );
                    })}
                  </div>
                ) : null}
              </section>

              <section className={styles.reconcilePanel}>
                <h3 className={styles.reconcilePanelTitle}>
                  <Inbox size={16} strokeWidth={2} aria-hidden />
                  Lançamentos no Climaris
                  {reconcileRows.length > 0 ? (
                    <span className={styles.reconcileCountPill}>{reconcileRows.length}</span>
                  ) : null}
                </h3>
                <div className={styles.reconcileList}>
                  {reconcileLoading ? (
                    <div className={styles.reconcileEmpty}>
                      <Loader2 size={24} className={styles.spinIcon} aria-hidden />
                      <p>Carregando movimentações…</p>
                    </div>
                  ) : reconcileRows.length === 0 ? (
                    <div className={styles.reconcileEmpty}>
                      <Inbox size={28} strokeWidth={1.5} aria-hidden />
                      <p>Sem lançamentos pendentes neste período</p>
                      <span>
                        Cadastre receitas/despesas pendentes no Financeiro (conta {reconcileAccount.name}) ou amplie o
                        período. Após importar o OFX, o período é ajustado automaticamente ao extrato.
                      </span>
                    </div>
                  ) : (
                    reconcileRows.map((row) => (
                      <div key={row.id} className={styles.reconcileRow}>
                        <div className={styles.reconcileRowMain}>
                          <strong>{row.description}</strong>
                          <p className={styles.reconcileRowMeta}>
                            {formatDateBr(row.due_date)} ·{" "}
                            {row.entry_type === "income" ? "Entrada" : "Saída"} · {row.status}
                          </p>
                        </div>
                        <div className={styles.reconcileRowActions}>
                          <strong
                            className={
                              row.entry_type === "income" ? styles.amountPositive : styles.amountNegative
                            }
                          >
                            {money(Number(row.amount || 0))}
                          </strong>
                          {row.status !== "paid" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void reconcileAsPaid(row)}
                            >
                              Marcar como pago
                            </Button>
                          ) : (
                            <span className={styles.reconcileBadgeOk}>
                              <CheckCircle2 size={14} aria-hidden />
                              Conciliado
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            <footer className={styles.reconcileDialogFooter}>
              <Button type="button" variant="outline" onClick={closeReconcileModal}>
                Fechar
              </Button>
            </footer>
          </div>
        </div>
      ) : null}

      {configAccount ? (
        <FinanceAccountConfigModal
          account={configAccount}
          gateways={gateways}
          catalog={bankCatalog}
          displayBalance={balancesByAccountId[configAccount.id]}
          error={error}
          msg={msg}
          configProvider={configProvider}
          onConfigProviderChange={setConfigProvider}
          onClose={() => setConfigAccount(null)}
          asaasApiKey={asaasApiKey}
          onAsaasApiKeyChange={setAsaasApiKey}
          asaasSandbox={asaasSandbox}
          onAsaasSandboxChange={setAsaasSandbox}
          onTestAsaas={() => void testAsaasConfig()}
          onSaveAsaas={() => void saveAsaasConfig()}
          onRemoveAsaas={removeAsaasConfig}
          mpPublicKey={mpPublicKey}
          onMpPublicKeyChange={setMpPublicKey}
          mpAccessToken={mpAccessToken}
          onMpAccessTokenChange={setMpAccessToken}
          mpSandbox={mpSandbox}
          onMpSandboxChange={setMpSandbox}
          mpProducts={mpProducts}
          onMpProductsChange={setMpProducts}
          mpWebhookSigSecret={mpWebhookSigSecret}
          onMpWebhookSigSecretChange={setMpWebhookSigSecret}
          onTestMp={() => void testMpCredentials()}
          onSaveMpCredentials={() => void saveMpGatewayFromConfig()}
          onSaveMpProducts={() => void saveMpProductsFromConfig()}
          onSaveMpWebhookSig={() => void saveMpWebhookSignatureFromConfig()}
          onClearMpWebhookSig={clearMpWebhookSignatureFromConfig}
          onRemoveMp={removeMpConfig}
          onCopyMpWebhook={copyMpWebhook}
          stoneSecretKey={stoneSecretKey}
          onStoneSecretKeyChange={setStoneSecretKey}
          stonePublicKey={stonePublicKey}
          onStonePublicKeyChange={setStonePublicKey}
          stoneSandbox={stoneSandbox}
          onStoneSandboxChange={setStoneSandbox}
          stoneTesting={stoneTesting}
          stoneSaving={stoneSaving}
          onTestStone={() => void testStoneCredentials()}
          onSaveStone={() => void saveStoneGatewayFromConfig()}
          onRemoveStone={removeStoneConfig}
          onCopyStoneWebhook={copyStoneWebhook}
        />
      ) : null}

      {confirmAction ? (
        <DeleteConfirmModal
          open={confirmAction !== null}
          onOpenChange={(open) => {
            if (!open && !confirmBusy) setConfirmAction(null);
          }}
          title={accountsConfirmCopy(confirmAction).title}
          description={accountsConfirmCopy(confirmAction).description}
          hint={accountsConfirmCopy(confirmAction).hint}
          confirmLabel={accountsConfirmCopy(confirmAction).confirmLabel}
          busyLabel={accountsConfirmCopy(confirmAction).busyLabel}
          busy={confirmBusy}
          onConfirm={() => void runConfirmAction()}
          detail={
            confirmAction.kind === "delete_account" ? (
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--color-text)" }}>
                <strong>{confirmAction.account.name}</strong>
                {confirmAction.account.bank_name ? (
                  <span style={{ color: "var(--color-text-muted)" }}> · {confirmAction.account.bank_name}</span>
                ) : null}
              </p>
            ) : undefined
          }
        />
      ) : null}
    </FinanceCadastroPageShell>
  );
}
