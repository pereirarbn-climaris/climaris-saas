import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, X } from "lucide-react";
import {
  createFinanceAccount,
  listFinanceBankCatalog,
  testFinanceGatewayAsaas,
  testFinanceGatewayMercadoPago,
  testFinanceGatewayStone,
  upsertFinanceGatewayAsaas,
  upsertFinanceGatewayMercadoPago,
  upsertFinanceGatewayStone,
  type FinanceBankAccountOut,
  type FinanceGatewayMercadoPagoProducts,
  type FinanceGatewaysOut,
} from "../../api/finance";
import {
  accountKindsForSlug,
  bankNameForPickerEntry,
  buildBankPickListWithFallback,
  defaultAccountKindForSlug,
  defaultAccountName,
  enrichBankPickList,
  groupBanksByCategory,
  integrationForSlug,
  isDuplicateAccountName,
  KIND_LABEL,
  type AccountKind,
  type BankPickerEntryWithCategory,
} from "../../lib/accountBankCatalogGroups";
import {
  formatBrlInputFromDigits,
  numberToBrlInput,
  parseBrlInputToNumber,
} from "../../lib/currencyBrInput";
import { pickerImgSrc, type BankPickerEntry } from "./FinanceAccountBankMark";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input, Select } from "../ui/input";
import { Stepper, type StepperStep } from "../ui/stepper";
import styles from "./AccountRegistrationWizard.module.css";

const MP_PRODUCTS_DEFAULT: FinanceGatewayMercadoPagoProducts = {
  checkout_pro: false,
  pix: false,
  boleto: false,
  subscriptions: false,
  payment_link: false,
};

type Props = {
  open: boolean;
  accounts: FinanceBankAccountOut[];
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string | null) => void;
  onGatewaysChange: (patch: {
    asaas: FinanceGatewaysOut["asaas"];
    mercadopago: FinanceGatewaysOut["mercadopago"];
    stone: FinanceGatewaysOut["stone"];
  }) => void;
  reloadAccounts: () => Promise<void>;
};

type SuccessState = {
  accountName: string;
  status: "active" | "pending_integration";
};

export function AccountRegistrationWizard({
  open,
  accounts,
  onClose,
  onSaved,
  onError,
  onGatewaysChange,
  reloadAccounts,
}: Props) {
  const [step, setStep] = useState(1);
  const [bankPickList, setBankPickList] = useState<BankPickerEntry[]>(() =>
    buildBankPickListWithFallback(null),
  );
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [kind, setKind] = useState<AccountKind>("checking");
  const [name, setName] = useState("");
  const [initialBalanceInput, setInitialBalanceInput] = useState(() => numberToBrlInput(0));
  const [nameTouched, setNameTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  const [mpPublicKey, setMpPublicKey] = useState("");
  const [mpAccessToken, setMpAccessToken] = useState("");
  const [mpSandbox, setMpSandbox] = useState(false);
  const [mpTestOk, setMpTestOk] = useState(false);
  const [mpProducts, setMpProducts] = useState<FinanceGatewayMercadoPagoProducts>(MP_PRODUCTS_DEFAULT);
  const [stoneSecretKey, setStoneSecretKey] = useState("");
  const [stonePublicKey, setStonePublicKey] = useState("");
  const [stoneSandbox, setStoneSandbox] = useState(false);
  const [stoneTestOk, setStoneTestOk] = useState(false);
  const [asaasApiKey, setAsaasApiKey] = useState("");
  const [asaasSandbox, setAsaasSandbox] = useState(false);
  const [asaasTestOk, setAsaasTestOk] = useState(false);

  const selectedEntry = useMemo(
    () => bankPickList.find((b) => b.slug === selectedSlug) ?? null,
    [bankPickList, selectedSlug],
  );

  const integration = selectedSlug ? integrationForSlug(selectedSlug) : null;
  const totalSteps = integration ? 3 : 2;

  const groupedBanks = useMemo(
    () => groupBanksByCategory(enrichBankPickList(bankPickList)),
    [bankPickList],
  );

  const kindOptions = useMemo(
    () => (selectedSlug ? accountKindsForSlug(selectedSlug) : []),
    [selectedSlug],
  );

  const stepperSteps: StepperStep[] = useMemo(() => {
    const base: StepperStep[] = [
      { id: 1, label: "Instituição" },
      { id: 2, label: "Identidade" },
    ];
    if (integration) base.push({ id: 3, label: "Integração" });
    return base;
  }, [integration]);

  const duplicateName = useMemo(
    () => isDuplicateAccountName(name, accounts),
    [name, accounts],
  );

  const step1Valid = Boolean(selectedSlug);
  const step2Valid =
    Boolean(selectedSlug) &&
    name.trim().length >= 2 &&
    !duplicateName &&
    kindOptions.includes(kind);

  const step3Valid = useMemo(() => {
    if (!integration) return true;
    if (integration === "mercadopago") {
      return mpTestOk && mpPublicKey.trim() && mpAccessToken.trim();
    }
    if (integration === "stone") {
      return stoneTestOk && stoneSecretKey.trim();
    }
    if (integration === "asaas") {
      return asaasTestOk && asaasApiKey.trim();
    }
    return false;
  }, [integration, mpTestOk, mpPublicKey, mpAccessToken, stoneTestOk, stoneSecretKey, asaasTestOk, asaasApiKey]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listFinanceBankCatalog()
      .then((rows) => {
        if (!cancelled) setBankPickList(buildBankPickListWithFallback(rows));
      })
      .catch(() => {
        if (!cancelled) setBankPickList(buildBankPickListWithFallback(null));
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setSelectedSlug(null);
    setKind("checking");
    setName("");
    setInitialBalanceInput(numberToBrlInput(0));
    setNameTouched(false);
    setLocalError(null);
    setSuccess(null);
    setMpPublicKey("");
    setMpAccessToken("");
    setMpSandbox(false);
    setMpTestOk(false);
    setMpProducts({ ...MP_PRODUCTS_DEFAULT });
    setStoneSecretKey("");
    setStonePublicKey("");
    setStoneSandbox(false);
    setStoneTestOk(false);
    setAsaasApiKey("");
    setAsaasSandbox(false);
    setAsaasTestOk(false);
    onError(null);
  }, [open, onError]);

  function selectInstitution(entry: BankPickerEntryWithCategory) {
    setSelectedSlug(entry.slug);
    const nextKind = defaultAccountKindForSlug(entry.slug);
    setKind(nextKind);
    setName(defaultAccountName(entry.label, nextKind));
    setNameTouched(false);
    setLocalError(null);
  }

  function handleBalanceInput(raw: string) {
    const digits = raw.replace(/\D/g, "");
    setInitialBalanceInput(formatBrlInputFromDigits(digits));
  }

  async function testMpCredentials() {
    if (!mpAccessToken.trim() || !mpPublicKey.trim()) {
      setLocalError("Informe Public Key e Access Token.");
      return;
    }
    setLocalError(null);
    try {
      const r = await testFinanceGatewayMercadoPago({
        access_token: mpAccessToken.trim(),
        public_key: mpPublicKey.trim(),
        sandbox: mpSandbox,
      });
      setMpTestOk(Boolean(r.ok));
      if (!r.ok) setLocalError(r.error || "Token inválido.");
    } catch (e) {
      setMpTestOk(false);
      setLocalError(e instanceof Error ? e.message : "Falha ao testar Mercado Pago.");
    }
  }

  async function testStoneCredentials() {
    if (!stoneSecretKey.trim()) {
      setLocalError("Informe a chave secreta Pagar.me (sk_…).");
      return;
    }
    setLocalError(null);
    try {
      const r = await testFinanceGatewayStone({ secret_key: stoneSecretKey.trim() });
      setStoneTestOk(Boolean(r.ok));
      if (!r.ok) setLocalError(r.error || "Chave inválida.");
    } catch (e) {
      setStoneTestOk(false);
      setLocalError(e instanceof Error ? e.message : "Falha ao testar Stone / Pagar.me.");
    }
  }

  async function testAsaasCredentials() {
    if (!asaasApiKey.trim()) {
      setLocalError("Informe a API Key do Asaas.");
      return;
    }
    setLocalError(null);
    try {
      const r = await testFinanceGatewayAsaas({ api_key: asaasApiKey.trim(), sandbox: asaasSandbox });
      setAsaasTestOk(Boolean(r.ok));
      if (!r.ok) setLocalError(r.error || "Chave inválida.");
    } catch (e) {
      setAsaasTestOk(false);
      setLocalError(e instanceof Error ? e.message : "Falha ao testar Asaas.");
    }
  }

  async function persistAccount(): Promise<FinanceBankAccountOut> {
    if (!selectedEntry) throw new Error("Selecione uma instituição.");
    const trimmedName = name.trim();
    if (trimmedName.length < 2) throw new Error("Informe um nome com pelo menos 2 caracteres.");
    if (isDuplicateAccountName(trimmedName, accounts)) {
      throw new Error("Já existe uma conta com este nome. Escolha outro identificador.");
    }
    return createFinanceAccount({
      name: trimmedName,
      bank_name: bankNameForPickerEntry(selectedEntry),
      account_type: kind === "other" ? "other" : kind,
      initial_balance: parseBrlInputToNumber(initialBalanceInput),
      is_active: true,
    });
  }

  async function connectGateway(acc: FinanceBankAccountOut): Promise<"active" | "pending_integration"> {
    if (!integration) return "active";

    if (integration === "mercadopago") {
      const res = await upsertFinanceGatewayMercadoPago({
        access_token: mpAccessToken.trim(),
        public_key: mpPublicKey.trim(),
        sandbox: mpSandbox,
        finance_bank_account_id: acc.id,
        products: mpProducts,
      });
      onGatewaysChange({ asaas: res.asaas, mercadopago: res.mercadopago, stone: res.stone });
      return res.mercadopago.connected ? "active" : "pending_integration";
    }

    if (integration === "stone") {
      const res = await upsertFinanceGatewayStone({
        secret_key: stoneSecretKey.trim(),
        sandbox: stoneSandbox,
        finance_bank_account_id: acc.id,
        public_key: stonePublicKey.trim(),
      });
      onGatewaysChange({ asaas: res.asaas, mercadopago: res.mercadopago, stone: res.stone });
      return res.stone.connected ? "active" : "pending_integration";
    }

    const res = await upsertFinanceGatewayAsaas({
      api_key: asaasApiKey.trim(),
      sandbox: asaasSandbox,
    });
    onGatewaysChange({ asaas: res.asaas, mercadopago: res.mercadopago, stone: res.stone });
    return res.asaas.connected ? "active" : "pending_integration";
  }

  async function handleSave(ev?: FormEvent) {
    ev?.preventDefault();
    setLocalError(null);
    if (!step2Valid) return;
    if (integration && step < 3) {
      setStep(3);
      return;
    }
    if (integration && !step3Valid) {
      setLocalError("Valide as credenciais antes de concluir.");
      return;
    }

    setSubmitting(true);
    try {
      const acc = await persistAccount();
      const status = integration ? await connectGateway(acc) : "active";
      await reloadAccounts();
      setSuccess({
        accountName: acc.name,
        status: integration && status === "pending_integration" ? "pending_integration" : "active",
      });
      if (integration && status === "pending_integration") {
        onSaved(`Conta "${acc.name}" criada. Finalize a integração nas configurações.`);
      } else {
        onSaved(integration ? `Conta "${acc.name}" conectada com sucesso.` : `Conta "${acc.name}" cadastrada.`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao salvar conta.";
      setLocalError(message);
      onError(message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    setLocalError(null);
    if (step === 1) {
      if (!step1Valid) {
        setLocalError("Selecione uma instituição para continuar.");
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!step2Valid) {
        if (duplicateName) setLocalError("Já existe uma conta com este nome.");
        else setLocalError("Preencha o nome da conta (mín. 2 caracteres).");
        return;
      }
      if (integration) setStep(3);
      else void handleSave();
    }
  }

  function handleBack() {
    setLocalError(null);
    if (success) return;
    if (step === 3) setStep(2);
    else if (step === 2) setStep(1);
    else onClose();
  }

  function finishSuccess() {
    setSuccess(null);
    onClose();
  }

  if (!open) return null;

  const showNameError = nameTouched && (name.trim().length < 2 || duplicateName);

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="account-wizard-title">
      <div className={styles.dialog}>
        <header className={styles.header}>
          <h2 id="account-wizard-title">{success ? "Conta cadastrada" : "Nova conta"}</h2>
          <Button type="button" variant="ghost" size="sm" onClick={success ? finishSuccess : onClose} aria-label="Fechar">
            <X size={18} />
          </Button>
        </header>

        {!success ? (
          <div className={styles.stepperWrap}>
            <Stepper steps={stepperSteps} currentStep={step} />
          </div>
        ) : null}

        <div className={styles.body}>
          {localError ? <p className={styles.error}>{localError}</p> : null}

          {success ? (
            <div className={styles.success}>
              <Badge variant={success.status === "active" ? "success" : "warning"}>
                {success.status === "active" ? "Conta ativa" : "Aguardando integração"}
              </Badge>
              <p className={styles.successTitle}>{success.accountName}</p>
              <p className={styles.successMeta}>
                {success.status === "active"
                  ? "A conta já pode ser usada em recebimentos e lançamentos."
                  : "A conta foi criada. Conclua ou revise as credenciais em Configurar conta."}
              </p>
              <Button type="button" onClick={finishSuccess}>
                Concluir
              </Button>
            </div>
          ) : null}

          {!success && step === 1 ? (
            <>
              <p className={styles.hint}>Escolha onde o dinheiro será movimentado ou recebido.</p>
              {groupedBanks.map((group) => (
                <section key={group.id} className={styles.categoryBlock} aria-labelledby={`bank-cat-${group.id}`}>
                  <h3 id={`bank-cat-${group.id}`} className={styles.categoryTitle}>
                    {group.title}
                  </h3>
                  <div className={styles.bankGrid} role="list">
                    {group.items.map((entry) => (
                      <button
                        key={entry.slug}
                        type="button"
                        role="listitem"
                        className={`${styles.bankItem} ${selectedSlug === entry.slug ? styles.bankItemActive : ""}`}
                        aria-pressed={selectedSlug === entry.slug}
                        onClick={() => selectInstitution(entry)}
                      >
                        <span className={styles.bankLogo} aria-hidden>
                          {pickerImgSrc(entry.logoUrl) ? (
                            <img src={pickerImgSrc(entry.logoUrl)} alt="" />
                          ) : (
                            <entry.Logo />
                          )}
                        </span>
                        <span className={styles.bankLabel}>{entry.label}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </>
          ) : null}

          {!success && step === 2 && selectedEntry ? (
            <form
              id="account-identity-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleNext();
              }}
            >
              <div className={styles.field}>
                <span className={styles.label}>Instituição</span>
                <p className={styles.hint} style={{ margin: 0 }}>
                  {selectedEntry.label}
                </p>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="account-wizard-name">
                  Nome da conta
                </label>
                <Input
                  id="account-wizard-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameTouched(true);
                  }}
                  onBlur={() => setNameTouched(true)}
                  placeholder="Ex.: Nubank — Conta corrente"
                  required
                  aria-invalid={showNameError}
                />
                {showNameError && duplicateName ? (
                  <p className={styles.error}>Já existe uma conta com este nome.</p>
                ) : null}
                {showNameError && !duplicateName && name.trim().length < 2 ? (
                  <p className={styles.error}>Informe pelo menos 2 caracteres.</p>
                ) : null}
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="account-wizard-kind">
                  Tipo de conta
                </label>
                <Select
                  id="account-wizard-kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as AccountKind)}
                  disabled={kindOptions.length <= 1}
                >
                  {kindOptions.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="account-wizard-balance">
                  Saldo inicial
                </label>
                <Input
                  id="account-wizard-balance"
                  inputMode="numeric"
                  value={initialBalanceInput}
                  onChange={(e) => handleBalanceInput(e.target.value)}
                  placeholder="R$ 0,00"
                  autoComplete="off"
                />
                <p className={styles.hint}>Valor de abertura no dia do cadastro (pode ser zero).</p>
              </div>

              {integration ? (
                <p className={styles.hint}>
                  No próximo passo você informará as credenciais de {selectedEntry.label}.
                </p>
              ) : null}
            </form>
          ) : null}

          {!success && step === 3 && integration === "mercadopago" ? (
            <form
              id="account-mp-form"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSave(e);
              }}
            >
              <p className={styles.hint}>
                Chaves cifradas no servidor. Valide antes de conectar a conta &quot;{name.trim()}&quot;.
              </p>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="mp-public-key">
                  Public Key
                </label>
                <Input
                  id="mp-public-key"
                  value={mpPublicKey}
                  onChange={(e) => {
                    setMpPublicKey(e.target.value);
                    setMpTestOk(false);
                  }}
                  placeholder="APP_USR-… ou TEST-…"
                  autoComplete="off"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="mp-access-token">
                  Access Token
                </label>
                <Input
                  id="mp-access-token"
                  type="password"
                  value={mpAccessToken}
                  onChange={(e) => {
                    setMpAccessToken(e.target.value);
                    setMpTestOk(false);
                  }}
                  autoComplete="off"
                />
              </div>
              <label className={styles.toggleRow}>
                <input type="checkbox" checked={mpSandbox} onChange={(e) => setMpSandbox(e.target.checked)} />
                Ambiente de testes (sandbox)
              </label>
              <div className={styles.panel}>
                <p className={styles.panelTitle}>Produtos habilitados</p>
                {(
                  [
                    ["checkout_pro", "Checkout Pro / Transparente"],
                    ["pix", "Recebimento via Pix"],
                    ["boleto", "Boleto bancário"],
                    ["subscriptions", "Assinaturas"],
                    ["payment_link", "Link de pagamento"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className={styles.toggleRow}>
                    <input
                      type="checkbox"
                      checked={mpProducts[key]}
                      onChange={(e) => setMpProducts((p) => ({ ...p, [key]: e.target.checked }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div className={styles.rowActions}>
                <Button type="button" variant="outline" onClick={() => void testMpCredentials()}>
                  Testar credenciais
                </Button>
                {mpTestOk ? (
                  <span className={styles.hint} style={{ alignSelf: "center" }}>
                    <Check size={14} aria-hidden /> Validadas
                  </span>
                ) : null}
              </div>
            </form>
          ) : null}

          {!success && step === 3 && integration === "stone" ? (
            <form
              id="account-stone-form"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSave(e);
              }}
            >
              <p className={styles.hint}>Credenciais Pagar.me vinculadas à conta &quot;{name.trim()}&quot;.</p>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="stone-secret">
                  Chave secreta (sk_…)
                </label>
                <Input
                  id="stone-secret"
                  type="password"
                  value={stoneSecretKey}
                  onChange={(e) => {
                    setStoneSecretKey(e.target.value);
                    setStoneTestOk(false);
                  }}
                  autoComplete="off"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="stone-public">
                  Chave pública (opcional)
                </label>
                <Input
                  id="stone-public"
                  value={stonePublicKey}
                  onChange={(e) => setStonePublicKey(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <label className={styles.toggleRow}>
                <input type="checkbox" checked={stoneSandbox} onChange={(e) => setStoneSandbox(e.target.checked)} />
                Sandbox
              </label>
              <div className={styles.rowActions}>
                <Button type="button" variant="outline" onClick={() => void testStoneCredentials()}>
                  Testar credenciais
                </Button>
                {stoneTestOk ? (
                  <span className={styles.hint} style={{ alignSelf: "center" }}>
                    <Check size={14} aria-hidden /> Validadas
                  </span>
                ) : null}
              </div>
            </form>
          ) : null}

          {!success && step === 3 && integration === "asaas" ? (
            <form
              id="account-asaas-form"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSave(e);
              }}
            >
              <p className={styles.hint}>API Key Asaas para cobranças no workspace.</p>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="asaas-api-key">
                  API Key
                </label>
                <Input
                  id="asaas-api-key"
                  type="password"
                  value={asaasApiKey}
                  onChange={(e) => {
                    setAsaasApiKey(e.target.value);
                    setAsaasTestOk(false);
                  }}
                  autoComplete="off"
                />
              </div>
              <label className={styles.toggleRow}>
                <input type="checkbox" checked={asaasSandbox} onChange={(e) => setAsaasSandbox(e.target.checked)} />
                Sandbox
              </label>
              <div className={styles.rowActions}>
                <Button type="button" variant="outline" onClick={() => void testAsaasCredentials()}>
                  Testar credenciais
                </Button>
                {asaasTestOk ? (
                  <span className={styles.hint} style={{ alignSelf: "center" }}>
                    <Check size={14} aria-hidden /> Validadas
                  </span>
                ) : null}
              </div>
            </form>
          ) : null}
        </div>

        {!success ? (
          <footer className={styles.footer}>
            <Button type="button" variant="outline" onClick={handleBack} disabled={submitting}>
              {step === 1 ? "Cancelar" : "Voltar"}
            </Button>
            {step < totalSteps ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid) || submitting}
              >
                Próximo
              </Button>
            ) : (
              <Button
                type="submit"
                form={
                  integration === "mercadopago"
                    ? "account-mp-form"
                    : integration === "stone"
                      ? "account-stone-form"
                      : integration === "asaas"
                        ? "account-asaas-form"
                        : "account-identity-form"
                }
                disabled={submitting || (integration ? !step3Valid : !step2Valid)}
              >
                {submitting ? "Salvando…" : "Salvar conta"}
              </Button>
            )}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
