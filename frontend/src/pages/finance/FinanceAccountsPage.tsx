import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  createFinanceAccount,
  deleteFinanceAccount,
  deleteFinanceGatewayAsaas,
  deleteFinanceGatewayMercadoPago,
  deleteFinanceGatewayStone,
  getFinanceGateways,
  listFinanceAccounts,
  listFinanceBankCatalog,
  listFinanceEntries,
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
import {
  FALLBACK_BANK_PICK,
  FinanceAccountBankMark,
  MP_BANK,
  SLUG_LOGOS,
  financeAccountConfigProvider,
  pickerImgSrc,
  type BankPickerEntry,
} from "../../components/finance/FinanceAccountBankMark";
import formLayout from "../formLayout.module.css";
import styles from "./FinanceAccountsPage.module.css";

type AccountKind = "checking" | "savings" | "investment" | "digital_wallet" | "cash" | "other";

type TypePickerKey = AccountKind | "mercadopago_integration";

type WizardFlow = "idle" | "pick_type" | "pick_bank" | "mp_creds" | "mp_products";

const KIND_LABEL: Record<AccountKind, string> = {
  checking: "Conta corrente",
  savings: "Conta poupança",
  investment: "Conta de investimento",
  digital_wallet: "Carteira digital",
  cash: "Caixa / dinheiro",
  other: "Outros",
};

const TYPE_ORDER: TypePickerKey[] = [
  "checking",
  "savings",
  "investment",
  "digital_wallet",
  "mercadopago_integration",
  "cash",
  "other",
];

function typeLabel(k: TypePickerKey): string {
  if (k === "mercadopago_integration") return "Mercado Pago";
  return KIND_LABEL[k];
}

const MP_PRODUCTS_DEFAULT: FinanceGatewayMercadoPagoProducts = {
  checkout_pro: false,
  pix: false,
  boleto: false,
  subscriptions: false,
  payment_link: false,
};

function money(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}

function sparklinePoints(seed: number): string {
  const base = Math.max(8, Math.min(72, seed));
  const vals = [12, 12, 13, 12, 14, 15, base];
  return vals.map((v, i) => `${i * 42},${84 - v}`).join(" ");
}

export function FinanceAccountsPage() {
  const [accounts, setAccounts] = useState<FinanceBankAccountOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [wizardFlow, setWizardFlow] = useState<WizardFlow>("idle");
  const [mpEntryPoint, setMpEntryPoint] = useState<"type" | "bank" | null>(null);
  const [kind, setKind] = useState<AccountKind>("checking");
  const [bankName, setBankName] = useState("");
  const [bankPickList, setBankPickList] = useState<BankPickerEntry[]>(FALLBACK_BANK_PICK);
  const [name, setName] = useState("");
  const [initialBalance, setInitialBalance] = useState("0");
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
  const [mpTestOk, setMpTestOk] = useState(false);
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

  async function loadAccounts() {
    setLoading(true);
    setError(null);
    try {
      const [accs, gws] = await Promise.all([listFinanceAccounts(), getFinanceGateways()]);
      setAccounts(accs);
      setGateways(gws);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar contas.");
    } finally {
      setLoading(false);
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

  useEffect(() => {
    if (wizardFlow !== "pick_bank") return;
    let cancelled = false;
    void listFinanceBankCatalog()
      .then((rows) => {
        if (cancelled) return;
        setBankPickList(
          rows.map((r) => ({
            bank: r.bank_name,
            label: r.slug === "stone" ? "Stone / Pagar.me" : r.display_label,
            slug: r.slug,
            logoUrl: r.logo_url,
            Logo: SLUG_LOGOS[r.slug] ?? SLUG_LOGOS.outros,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setBankPickList(FALLBACK_BANK_PICK);
      });
    return () => {
      cancelled = true;
    };
  }, [wizardFlow]);

  const cards = useMemo(() => accounts.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [accounts]);

  function openNew() {
    setWizardFlow("pick_type");
    setMpEntryPoint(null);
    setKind("checking");
    setBankName("");
    setName("");
    setInitialBalance("0");
    setMpPublicKey("");
    setMpAccessToken("");
    setMpSandbox(false);
    setMpTestOk(false);
    setMpProducts({ ...MP_PRODUCTS_DEFAULT });
    setMsg(null);
    setError(null);
  }

  function closeWizard() {
    setWizardFlow("idle");
    setMpEntryPoint(null);
  }

  async function submitAccount(ev: FormEvent) {
    ev.preventDefault();
    try {
      await createFinanceAccount({
        name: name.trim() || `${KIND_LABEL[kind]} ${bankName}`.trim(),
        bank_name: bankName.trim() || null,
        account_type: kind === "other" ? "other" : kind,
        initial_balance: Number(initialBalance || "0"),
        is_active: true,
      });
      closeWizard();
      setMsg("Conta cadastrada.");
      await loadAccounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar conta.");
    }
  }

  async function submitMpIntegration(ev: FormEvent) {
    ev.preventDefault();
    try {
      const acc = await createFinanceAccount({
        name: name.trim() || "Conta Mercado Pago",
        bank_name: MP_BANK,
        account_type: "digital_wallet",
        initial_balance: Number(initialBalance || "0"),
        is_active: true,
      });
      const res = await upsertFinanceGatewayMercadoPago({
        access_token: mpAccessToken.trim(),
        public_key: mpPublicKey.trim(),
        sandbox: mpSandbox,
        finance_bank_account_id: acc.id,
        products: mpProducts,
      });
      setGateways((g) => (g ? { ...g, asaas: res.asaas, mercadopago: res.mercadopago, stone: res.stone } : g));
      closeWizard();
      setMsg("Conta Mercado Pago conectada.");
      setMpPublicKey("");
      setMpAccessToken("");
      setMpTestOk(false);
      await loadAccounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar integração Mercado Pago.");
    }
  }

  async function removeAccount(row: FinanceBankAccountOut) {
    if (!window.confirm(`Excluir conta "${row.name}"?`)) return;
    try {
      await deleteFinanceAccount(row.id);
      await loadAccounts();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao excluir conta.");
    }
  }

  function closeReconcileModal() {
    setReconcileAccount(null);
    setReconcileRows([]);
    setOfxImportId(null);
    setOfxLines([]);
    setOfxPicks({});
  }

  function openReconcile(row: FinanceBankAccountOut) {
    setReconcileAccount(row);
    setReconcileRows([]);
    setOfxImportId(null);
    setOfxLines([]);
    setOfxPicks({});
    setMsg(null);
    setError(null);
  }

  async function loadReconcileRows() {
    if (!reconcileAccount) return;
    setReconcileLoading(true);
    setError(null);
    try {
      const rows = await listFinanceEntries({ start_date: reconcileStart, end_date: reconcileEnd });
      const filtered = rows.filter((r) => {
        if (r.finance_account_id === reconcileAccount.id) return true;
        return reconcileAccount.name.trim().toLowerCase() === "caixa" && (r.payment_method || "").toLowerCase() === "cash";
      });
      setReconcileRows(filtered.sort((a, b) => a.due_date.localeCompare(b.due_date)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar extrato para conciliação.");
    } finally {
      setReconcileLoading(false);
    }
  }

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

  async function removeAsaasConfig() {
    if (!window.confirm("Remover integração Asaas?")) return;
    try {
      await deleteFinanceGatewayAsaas();
      await loadAccounts();
      setMsg("Integração Asaas removida.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao remover Asaas.");
    }
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

  async function clearMpWebhookSignatureFromConfig() {
    if (!window.confirm("Remover o segredo? Notificações deixarão de exigir x-signature até você configurar de novo.")) return;
    try {
      const res = await patchFinanceGatewayMercadoPagoWebhookSignature({ clear_webhook_signature_secret: true });
      setGateways((g) => (g ? { ...g, asaas: res.asaas, mercadopago: res.mercadopago, stone: res.stone } : g));
      setMpWebhookSigSecret("");
      setMsg("Segredo de assinatura removido.");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao remover o segredo.");
    }
  }

  async function removeMpConfig() {
    if (!window.confirm("Remover integração Mercado Pago deste workspace?")) return;
    try {
      await deleteFinanceGatewayMercadoPago();
      await loadAccounts();
      setMsg("Integração Mercado Pago removida.");
      setConfigAccount(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao remover Mercado Pago.");
    }
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

  async function removeStoneConfig() {
    if (!window.confirm("Remover integração Stone / Pagar.me deste workspace?")) return;
    try {
      await deleteFinanceGatewayStone();
      await loadAccounts();
      setMsg("Integração Stone / Pagar.me removida.");
      setConfigAccount(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao remover.");
    }
  }

  function copyStoneWebhook() {
    const u = gateways?.stone?.webhook_url;
    if (!u) return;
    void navigator.clipboard.writeText(u).then(() => setMsg("URL do webhook Stone copiada."));
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <h1>Contas e carteiras</h1>
        <div className={styles.headerActions}>
          <button type="button" onClick={openNew}>
            + adicionar
          </button>
          <Link to="/app/finance/settings">Voltar às configurações</Link>
        </div>
      </header>

      {error && !configAccount ? <p className={styles.error}>{error}</p> : null}
      {msg && !configAccount ? <p className={styles.msg}>{msg}</p> : null}

      {loading ? <p>Carregando contas...</p> : null}
      {!loading ? (
        <div className={styles.cards}>
          {cards.map((a) => (
            <article key={a.id} className={styles.card}>
              <div className={styles.cardMain}>
                <div className={styles.cardHead}>
                  <FinanceAccountBankMark account={a} gateways={gateways} catalog={bankCatalog} />
                  <div>
                    <h3>{a.name}</h3>
                    <p>{a.bank_name || "Sem banco informado"}</p>
                  </div>
                </div>
                <strong>{money(Number(a.initial_balance || 0))}</strong>
                <span className={styles.smallLink}>Ver extrato</span>
                <svg className={styles.sparkline} viewBox="0 0 252 84" preserveAspectRatio="none" aria-hidden="true">
                  <polyline fill="none" stroke="currentColor" strokeWidth="2.5" points={sparklinePoints(Number(a.initial_balance || 0))} />
                </svg>
              </div>
              <div className={styles.cardActions}>
                <button type="button" className={styles.btnGhost} onClick={() => openReconcile(a)}>
                  Conciliar
                </button>
                <button type="button" className={styles.btnGhost} onClick={() => openConfig(a)}>
                  Configurar conta
                </button>
                {a.name.trim().toLowerCase() !== "caixa" ? (
                  <button type="button" className={styles.btnDanger} onClick={() => void removeAccount(a)}>
                    Excluir
                  </button>
                ) : (
                  <span className={styles.badge}>Obrigatória</span>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {wizardFlow === "pick_type" ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <header>
              <h2>Tipo de conta</h2>
              <button type="button" onClick={closeWizard}>
                x
              </button>
            </header>
            <div className={styles.typeList}>
              {TYPE_ORDER.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={styles.typeBtn}
                  onClick={() => {
                    if (k === "mercadopago_integration") {
                      setKind("digital_wallet");
                      setBankName(MP_BANK);
                      setMpEntryPoint("type");
                      setWizardFlow("mp_creds");
                      setName("");
                      setInitialBalance("0");
                      return;
                    }
                    setKind(k);
                    setWizardFlow("pick_bank");
                  }}
                >
                  {typeLabel(k)}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {wizardFlow === "pick_bank" ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <header>
              <h2>Selecione o banco</h2>
              <button type="button" onClick={() => setWizardFlow("pick_type")}>
                x
              </button>
            </header>
            <form className={`${formLayout.stack} ${styles.form}`} onSubmit={submitAccount}>
              <div className={styles.bankGrid}>
                {bankPickList.map(({ bank, label, slug, Logo, logoUrl }) => (
                  <button
                    key={slug}
                    type="button"
                    className={`${styles.bankItem} ${bankName === bank ? styles.bankItemActive : ""}`}
                    aria-pressed={bankName === bank}
                    onClick={() => {
                      setBankName(bank);
                      if (bank === MP_BANK && kind === "digital_wallet") {
                        setMpEntryPoint("bank");
                        setWizardFlow("mp_creds");
                      }
                    }}
                  >
                    <span className={styles.bankItemLogo} aria-hidden="true">
                      {pickerImgSrc(logoUrl) ? (
                        <img src={pickerImgSrc(logoUrl)} alt="" className={styles.bankItemImg} />
                      ) : (
                        <Logo />
                      )}
                    </span>
                    <span className={styles.bankItemLabel}>{label}</span>
                  </button>
                ))}
              </div>
              <div className={formLayout.field}>
                <label className={styles.fieldLabel} htmlFor="pick-bank-account-name">
                  Nome da conta (opcional)
                </label>
              <input id="pick-bank-account-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da conta (opcional)" />
              </div>
              <div className={formLayout.field}>
                <label className={styles.fieldLabel} htmlFor="pick-bank-initial-balance">
                  Saldo inicial
                </label>
              <input
                id="pick-bank-initial-balance"
                type="number"
                step="0.01"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                placeholder="Saldo inicial"
              />
              </div>
              <button type="submit">Salvar conta</button>
            </form>
          </div>
        </div>
      ) : null}

      {wizardFlow === "mp_creds" ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <header>
              <h2>Credenciais Mercado Pago</h2>
              <button
                type="button"
                onClick={() => {
                  if (mpEntryPoint === "bank") setWizardFlow("pick_bank");
                  else setWizardFlow("pick_type");
                }}
              >
                x
              </button>
            </header>
            <form
              className={`${formLayout.stack} ${styles.form}`}
              onSubmit={(e) => {
                e.preventDefault();
                if (!mpTestOk) {
                  setError("Valide as credenciais com o botão “Testar credenciais” antes de continuar.");
                  return;
                }
                setWizardFlow("mp_products");
              }}
            >
              <p className={styles.smallMuted}>
                As chaves ficam cifradas no servidor. A validação usa a API do Mercado Pago (usuário autenticado).
              </p>
              <div className={formLayout.field}>
                <label className={styles.fieldLabel} htmlFor="mp-wizard-public-key">
                  Public Key
                </label>
              <input
                id="mp-wizard-public-key"
                value={mpPublicKey}
                onChange={(e) => {
                  setMpPublicKey(e.target.value);
                  setMpTestOk(false);
                }}
                placeholder="APP_USR-… ou TEST-…"
                autoComplete="off"
              />
              </div>
              <div className={formLayout.field}>
                <label className={styles.fieldLabel} htmlFor="mp-wizard-access-token">
                  Access Token
                </label>
              <input
                id="mp-wizard-access-token"
                type="password"
                value={mpAccessToken}
                onChange={(e) => {
                  setMpAccessToken(e.target.value);
                  setMpTestOk(false);
                }}
                placeholder="Access token de produção ou teste"
                autoComplete="off"
              />
              </div>
              <label className={styles.smallLink}>
                <input type="checkbox" checked={mpSandbox} onChange={(e) => setMpSandbox(e.target.checked)} /> Ambiente de testes
                (sandbox)
              </label>
              <div className={formLayout.field}>
                <label className={styles.fieldLabel} htmlFor="mp-wizard-account-name">
                  Nome da conta
                </label>
              <input id="mp-wizard-account-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da conta (ex.: Conta Mercado Pago)" />
              </div>
              <div className={formLayout.field}>
                <label className={styles.fieldLabel} htmlFor="mp-wizard-initial-balance">
                  Saldo inicial (opcional)
                </label>
              <input
                id="mp-wizard-initial-balance"
                type="number"
                step="0.01"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                placeholder="Saldo inicial (opcional)"
              />
              </div>
              <div className={styles.rowActions}>
                <button type="button" onClick={() => void testMpCredentials()}>
                  Testar credenciais
                </button>
                <button type="submit" disabled={!mpTestOk}>
                  Continuar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {wizardFlow === "mp_products" ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <header>
              <h2>Ativação de produtos</h2>
              <button type="button" onClick={() => setWizardFlow("mp_creds")}>
                x
              </button>
            </header>
            <form className={`${formLayout.stack} ${styles.form}`} onSubmit={(e) => void submitMpIntegration(e)}>
              <p className={styles.smallMuted}>Escolha quais fluxos de pagamento deseja habilitar neste workspace.</p>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={mpProducts.checkout_pro}
                  onChange={(e) => setMpProducts((p) => ({ ...p, checkout_pro: e.target.checked }))}
                />
                Checkout Pro / Transparente
              </label>
              <label className={styles.toggleRow}>
                <input type="checkbox" checked={mpProducts.pix} onChange={(e) => setMpProducts((p) => ({ ...p, pix: e.target.checked }))} />
                Recebimento via Pix
              </label>
              <label className={styles.toggleRow}>
                <input type="checkbox" checked={mpProducts.boleto} onChange={(e) => setMpProducts((p) => ({ ...p, boleto: e.target.checked }))} />
                Boleto bancário
              </label>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={mpProducts.subscriptions}
                  onChange={(e) => setMpProducts((p) => ({ ...p, subscriptions: e.target.checked }))}
                />
                Assinaturas (recorrência)
              </label>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={mpProducts.payment_link}
                  onChange={(e) => setMpProducts((p) => ({ ...p, payment_link: e.target.checked }))}
                />
                Link de pagamento
              </label>
              <button type="submit">Salvar e conectar</button>
            </form>
          </div>
        </div>
      ) : null}

      {reconcileAccount ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modalWide}>
            <header>
              <h2>Conciliação - {reconcileAccount.name}</h2>
              <button type="button" onClick={closeReconcileModal}>
                x
              </button>
            </header>
            <div className={styles.reconcileFilters}>
              <input type="date" value={reconcileStart} onChange={(e) => setReconcileStart(e.target.value)} />
              <input type="date" value={reconcileEnd} onChange={(e) => setReconcileEnd(e.target.value)} />
              <button type="button" onClick={() => void loadReconcileRows()} disabled={reconcileLoading}>
                {reconcileLoading ? "Carregando..." : "Atualizar extrato"}
              </button>
            </div>
            <div className={styles.ofxBox}>
              <p className={styles.smallMuted}>
                Importe um arquivo <strong>.ofx</strong> exportado pelo seu banco ou carteira (ex.: Stone, Nubank, Itaú).
                Sugerimos lançamentos pendentes por valor e data; confira antes de aplicar.
              </p>
              <div className={styles.rowActions}>
                <input
                  type="file"
                  accept=".ofx,.OFX"
                  disabled={ofxUploading}
                  onChange={(ev) => {
                    const f = ev.target.files?.[0];
                    ev.target.value = "";
                    if (!f || !reconcileAccount) return;
                    void (async () => {
                      setOfxUploading(true);
                      setError(null);
                      try {
                        const res = await uploadFinanceOfxImport(reconcileAccount.id, f);
                        setOfxImportId(res.import_id);
                        setOfxLines(res.lines);
                        const picks: Record<number, string> = {};
                        for (const L of res.lines) {
                          picks[L.id] = L.suggestions.length ? String(L.suggestions[0].id) : "";
                        }
                        setOfxPicks(picks);
                        setMsg(
                          `OFX importado: ${res.lines_count} linha(s)${res.truncated ? " (arquivo truncado no limite do servidor)" : ""}.`,
                        );
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Falha ao importar OFX.");
                      } finally {
                        setOfxUploading(false);
                      }
                    })();
                  }}
                />
                {ofxImportId != null && ofxLines.length > 0 ? (
                  <button
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
                        setError("Selecione ao menos um lançamento sugerido para conciliar.");
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
                          await loadReconcileRows();
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Falha ao aplicar conciliação OFX.");
                        } finally {
                          setOfxApplying(false);
                        }
                      })();
                    }}
                  >
                    {ofxApplying ? "Aplicando..." : "Aplicar conciliações selecionadas"}
                  </button>
                ) : null}
              </div>
              {ofxLines.length > 0 ? (
                <div className={styles.reconcileList} style={{ marginTop: "0.75rem" }}>
                  {ofxLines.map((L) => (
                    <div key={L.id} className={styles.reconcileRow}>
                      <div>
                        <strong>{L.payee || L.memo || "Movimentação OFX"}</strong>
                        <p className={styles.smallMuted}>
                          {L.posted_at} · FITID {L.fit_id}
                          {L.matched_finance_entry_id ? ` · já vinculado ao #${L.matched_finance_entry_id}` : ""}
                        </p>
                      </div>
                      <div className={styles.reconcileRowActions}>
                        <strong>{money(Number(L.amount))}</strong>
                        {L.matched_finance_entry_id ? (
                          <span className={styles.badge}>Conciliado</span>
                        ) : (
                          <select
                            value={ofxPicks[L.id] ?? ""}
                            onChange={(e) => setOfxPicks((p) => ({ ...p, [L.id]: e.target.value }))}
                            aria-label={`Sugestão para linha OFX ${L.id}`}
                          >
                            <option value="">— ignorar —</option>
                            {L.suggestions.map((s) => (
                              <option key={s.id} value={String(s.id)}>
                                #{s.id} {s.description.slice(0, 40)}
                                {s.description.length > 40 ? "…" : ""} · {money(s.amount)} · venc. {s.due_date}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className={styles.reconcileList}>
              {reconcileRows.length === 0 ? (
                <p className={styles.smallLink}>Sem movimentações para este período.</p>
              ) : (
                reconcileRows.map((row) => (
                  <div key={row.id} className={styles.reconcileRow}>
                    <div>
                      <strong>{row.description}</strong>
                      <p>
                        {row.due_date} · {row.entry_type === "income" ? "Entrada" : "Saída"} · {row.status}
                      </p>
                    </div>
                    <div className={styles.reconcileRowActions}>
                      <strong>{money(Number(row.amount || 0))}</strong>
                      {row.status !== "paid" ? (
                        <button type="button" onClick={() => void reconcileAsPaid(row)}>
                          Conciliar (pago)
                        </button>
                      ) : (
                        <span className={styles.badge}>Conciliado</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}

      {configAccount ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <header>
              <h2>Configurar conta - {configAccount.name}</h2>
              <button type="button" onClick={() => setConfigAccount(null)}>
                x
              </button>
            </header>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            {msg ? (
              <p className={styles.msg} role="status">
                {msg}
              </p>
            ) : null}
            <div className={`${formLayout.stack} ${styles.form}`}>
              <div className={formLayout.field}>
                <label className={styles.fieldLabel} htmlFor="finance-config-provider">
                  Integração
                </label>
              <select
                id="finance-config-provider"
                value={configProvider}
                onChange={(e) => setConfigProvider(e.target.value as "asaas" | "mercadopago" | "stone" | "none")}
              >
                <option value="none">Sem integração API</option>
                <option value="asaas">Asaas</option>
                <option value="mercadopago">Mercado Pago</option>
                <option value="stone">Stone / Pagar.me</option>
              </select>
              </div>
              {configProvider === "asaas" ? (
                <>
                  <p className={styles.smallLink}>Status atual: {gateways?.asaas.connected ? "Conectado" : "Desconectado"}</p>
                  <div className={formLayout.field}>
                    <label className={styles.fieldLabel} htmlFor="config-asaas-api-key">
                      API Key Asaas
                    </label>
                  <input
                    id="config-asaas-api-key"
                    type="password"
                    value={asaasApiKey}
                    onChange={(e) => setAsaasApiKey(e.target.value)}
                    placeholder="API Key Asaas"
                  />
                  </div>
                  <label className={styles.smallLink}>
                    <input type="checkbox" checked={asaasSandbox} onChange={(e) => setAsaasSandbox(e.target.checked)} /> Sandbox
                  </label>
                  <div className={styles.rowActions}>
                    <button type="button" onClick={() => void testAsaasConfig()}>
                      Testar
                    </button>
                    <button type="button" onClick={() => void saveAsaasConfig()}>
                      Salvar
                    </button>
                    {gateways?.asaas.connected ? (
                      <button type="button" className={styles.btnDanger} onClick={() => void removeAsaasConfig()}>
                        Remover
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
              {configProvider === "mercadopago" ? (
                <>
                  <p className={styles.smallLink}>
                    Status: {gateways?.mercadopago.connected ? "Conectado" : "Desconectado"}
                    {gateways?.mercadopago.access_token_hint ? ` · Token ${gateways.mercadopago.access_token_hint}` : ""}
                    {gateways?.mercadopago.public_key_hint ? ` · Chave pública ${gateways.mercadopago.public_key_hint}` : ""}
                  </p>
                  {gateways?.mercadopago.webhook_url ? (
                    <div className={styles.webhookBox}>
                      <span className={styles.smallMuted}>URL do webhook (configure no painel do Mercado Pago)</span>
                      <code className={styles.webhookCode}>{gateways.mercadopago.webhook_url}</code>
                      <button type="button" className={styles.btnGhost} onClick={copyMpWebhook}>
                        Copiar URL
                      </button>
                    </div>
                  ) : (
                    <p className={styles.smallMuted}>
                      Defina <code>API_PUBLIC_BASE_URL</code> no backend (recomendado em produção), ou{" "}
                      <code>APP_PUBLIC_URL</code> em HTTPS no mesmo host que recebe <code>/api/v1</code>, para exibir a URL do
                      webhook e enviar <code>notification_url</code> ao Mercado Pago.
                    </p>
                  )}
                  {gateways?.mercadopago.connected &&
                  !gateways.mercadopago.sandbox &&
                  gateways.mercadopago.webhook_signature_enforced &&
                  !gateways.mercadopago.webhook_signature_configured ? (
                    <p className={styles.smallMuted} style={{ color: "var(--color-danger, #b00020)", marginTop: "0.5rem" }}>
                      Este servidor exige webhook assinado (<code>x-signature</code>) para contas de produção. Salve o segredo do
                      painel do Mercado Pago abaixo; sem isso as notificações retornam erro até ser configurado.
                    </p>
                  ) : null}
                  {gateways?.mercadopago.connected ? (
                    <div className={styles.webhookBox}>
                      <div className={formLayout.field}>
                      <span className={styles.smallMuted}>
                        Segredo para validar <code>x-signature</code> (Suas integrações → Webhooks → assinatura secreta).
                        {gateways.mercadopago.webhook_signature_configured ? " Atualmente configurado." : ""}
                      </span>
                      <input
                        type="password"
                        value={mpWebhookSigSecret}
                        onChange={(e) => setMpWebhookSigSecret(e.target.value)}
                        placeholder={
                          gateways.mercadopago.webhook_signature_configured
                            ? "Novo segredo (substitui o atual)"
                            : "Cole o segredo exibido no painel do Mercado Pago"
                        }
                        autoComplete="off"
                      />
                      </div>
                      <div className={styles.rowActions}>
                        <button type="button" disabled={!mpWebhookSigSecret.trim()} onClick={() => void saveMpWebhookSignatureFromConfig()}>
                          Salvar segredo
                        </button>
                        {gateways.mercadopago.webhook_signature_configured ? (
                          <button
                            type="button"
                            className={styles.btnGhost}
                            disabled={Boolean(
                              gateways.mercadopago.webhook_signature_enforced && !gateways.mercadopago.sandbox,
                            )}
                            title={
                              gateways.mercadopago.webhook_signature_enforced && !gateways.mercadopago.sandbox
                                ? "Remoção bloqueada: o servidor exige assinatura em produção."
                                : undefined
                            }
                            onClick={() => void clearMpWebhookSignatureFromConfig()}
                          >
                            Remover segredo
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <div className={formLayout.field}>
                    <label className={styles.fieldLabel} htmlFor="config-mp-public-key">
                      Public Key (nova)
                    </label>
                  <input
                    id="config-mp-public-key"
                    value={mpPublicKey}
                    onChange={(e) => setMpPublicKey(e.target.value)}
                    placeholder="Deixe em branco para manter a chave atual"
                    autoComplete="off"
                  />
                  </div>
                  <div className={formLayout.field}>
                    <label className={styles.fieldLabel} htmlFor="config-mp-access-token">
                      Access Token (novo)
                    </label>
                  <input
                    id="config-mp-access-token"
                    type="password"
                    value={mpAccessToken}
                    onChange={(e) => setMpAccessToken(e.target.value)}
                    placeholder="Deixe em branco para manter o token atual"
                    autoComplete="off"
                  />
                  </div>
                  <label className={styles.smallLink}>
                    <input type="checkbox" checked={mpSandbox} onChange={(e) => setMpSandbox(e.target.checked)} /> Sandbox
                  </label>
                  <h3 className={styles.subHeading}>Ativação de produtos</h3>
                  <label className={styles.toggleRow}>
                    <input
                      type="checkbox"
                      checked={mpProducts.checkout_pro}
                      onChange={(e) => setMpProducts((p) => ({ ...p, checkout_pro: e.target.checked }))}
                    />
                    Checkout Pro / Transparente
                  </label>
              <label className={styles.toggleRow}>
                <input type="checkbox" checked={mpProducts.pix} onChange={(e) => setMpProducts((p) => ({ ...p, pix: e.target.checked }))} />
                Recebimento via Pix
              </label>
              <label className={styles.toggleRow}>
                <input type="checkbox" checked={mpProducts.boleto} onChange={(e) => setMpProducts((p) => ({ ...p, boleto: e.target.checked }))} />
                Boleto bancário
              </label>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={mpProducts.subscriptions}
                      onChange={(e) => setMpProducts((p) => ({ ...p, subscriptions: e.target.checked }))}
                    />
                    Assinaturas (recorrência)
                  </label>
                  <label className={styles.toggleRow}>
                    <input
                      type="checkbox"
                      checked={mpProducts.payment_link}
                      onChange={(e) => setMpProducts((p) => ({ ...p, payment_link: e.target.checked }))}
                    />
                    Link de pagamento
                  </label>
                  <div className={styles.rowActions}>
                    <button type="button" onClick={() => void testMpCredentials()}>
                      Testar credenciais
                    </button>
                    <button type="button" onClick={() => void saveMpGatewayFromConfig()} disabled={!mpAccessToken.trim() || !mpPublicKey.trim()}>
                      Salvar credenciais
                    </button>
                    <button type="button" onClick={() => void saveMpProductsFromConfig()}>
                      Salvar produtos
                    </button>
                    {gateways?.mercadopago.connected ? (
                      <button type="button" className={styles.btnDanger} onClick={() => void removeMpConfig()}>
                        Remover integração
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
              {configProvider === "stone" ? (
                <>
                  <p className={styles.smallLink}>
                    Use a chave secreta <strong>Pagar.me</strong> (Stone) para emitir <strong>PIX, boleto ou cartão</strong>{" "}
                    nos lançamentos (em Financeiro). Ao receber o pagamento, o webhook marca o lançamento como pago e
                    vincula à conta deste cartão (conciliação com o extrato).
                  </p>
                  <p className={styles.smallMuted}>
                    O Climaris chama a API de cobrança do <strong>Pagar.me</strong> (chave <code>sk_…</code>). Em geral
                    você copia essa chave no painel Pagar.me vinculado à Stone. Se a Stone pedir o local de integração ao
                    criar uma chave em <strong>conta Stone → Chaves de autenticação</strong>, escolha{" "}
                    <strong>Plataforma de e-commerce</strong> (integração do seu sistema com pagamentos online).{" "}
                    <strong>Sistema TEF</strong> é para maquininha/TEF; <strong>API de conciliação Stone</strong> é outro
                    produto (extrato/conciliação no modelo da conta), não é o que este campo usa.
                  </p>
                  <p className={styles.smallLink}>
                    Status: {gateways?.stone.connected ? "Conectado" : "Desconectado"}
                    {gateways?.stone.secret_key_hint ? ` · sk ${gateways.stone.secret_key_hint}` : ""}
                    {gateways?.stone.public_key_hint ? ` · pk ${gateways.stone.public_key_hint}` : ""}
                  </p>
                  {gateways?.stone.webhook_url ? (
                    <div className={styles.webhookBox}>
                      <span className={styles.smallMuted}>URL do webhook (painel Pagar.me → Webhooks, eventos de pedido pago)</span>
                      <code className={styles.webhookCode}>{gateways.stone.webhook_url}</code>
                      <button type="button" className={styles.btnGhost} onClick={copyStoneWebhook}>
                        Copiar URL
                      </button>
                    </div>
                  ) : (
                    <p className={styles.smallMuted}>
                      Defina <code>API_PUBLIC_BASE_URL</code> no backend para exibir a URL do webhook.
                    </p>
                  )}
                  <div className={formLayout.field}>
                    <label className={styles.fieldLabel} htmlFor="config-stone-sk">
                      Chave secreta (sk_test_… ou sk_live_…)
                    </label>
                    <input
                      id="config-stone-sk"
                      type="password"
                      name="climaris-stone-secret-key"
                      value={stoneSecretKey}
                      onChange={(e) => setStoneSecretKey(e.target.value)}
                      placeholder={gateways?.stone?.connected ? "Deixe em branco para manter a chave atual" : "Cole a chave completa"}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className={formLayout.field}>
                    <label className={styles.fieldLabel} htmlFor="config-stone-pk">
                      Chave pública (pk_test_… ou pk_live_…) — tokenização de cartão no navegador
                    </label>
                    <input
                      id="config-stone-pk"
                      type="password"
                      name="climaris-stone-public-key"
                      value={stonePublicKey}
                      onChange={(e) => setStonePublicKey(e.target.value)}
                      placeholder="Opcional; vazio remove a chave pública salva"
                      autoComplete="new-password"
                    />
                  </div>
                  <label className={styles.smallLink}>
                    <input type="checkbox" checked={stoneSandbox} onChange={(e) => setStoneSandbox(e.target.checked)} /> Indicador sandbox (referência no painel)
                  </label>
                  <div className={styles.rowActions}>
                    <button type="button" disabled={stoneTesting} onClick={() => void testStoneCredentials()}>
                      {stoneTesting ? "Testando…" : "Testar chave"}
                    </button>
                    <button
                      type="button"
                      disabled={stoneSaving || stoneTesting}
                      onClick={() => void saveStoneGatewayFromConfig()}
                    >
                      {stoneSaving ? "Salvando…" : "Salvar integração"}
                    </button>
                    {gateways?.stone.connected ? (
                      <button type="button" className={styles.btnDanger} onClick={() => void removeStoneConfig()}>
                        Remover integração
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
