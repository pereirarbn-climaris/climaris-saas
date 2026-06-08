import { useEffect, type ReactNode } from "react";
import { CheckCircle2, Link2, Settings2, Wallet, X } from "lucide-react";
import type {
  FinanceBankAccountOut,
  FinanceBankCatalogRow,
  FinanceGatewayMercadoPagoProducts,
  FinanceGatewaysOut,
} from "../../api/finance";
import {
  FinanceAccountBankMark,
  accountIntegrationSummary,
  financeAccountConfigProvider,
  financeAccountTypeLabel,
} from "./FinanceAccountBankMark";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import formLayout from "../../pages/formLayout.module.css";
import styles from "../../pages/finance/FinanceAccountsPage.module.css";

function money(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}

const PROVIDER_LABELS: Record<"asaas" | "mercadopago" | "stone", string> = {
  asaas: "Asaas",
  mercadopago: "Mercado Pago",
  stone: "Stone / Pagar.me",
};

type Provider = "asaas" | "mercadopago" | "stone" | "none";

export type FinanceAccountConfigModalProps = {
  account: FinanceBankAccountOut;
  gateways: FinanceGatewaysOut | null;
  catalog: FinanceBankCatalogRow[] | null;
  displayBalance?: number | null;
  error: string | null;
  msg: string | null;
  configProvider: Provider;
  onConfigProviderChange: (p: Provider) => void;
  onClose: () => void;
  asaasApiKey: string;
  onAsaasApiKeyChange: (v: string) => void;
  asaasSandbox: boolean;
  onAsaasSandboxChange: (v: boolean) => void;
  onTestAsaas: () => void;
  onSaveAsaas: () => void;
  onRemoveAsaas: () => void;
  mpPublicKey: string;
  onMpPublicKeyChange: (v: string) => void;
  mpAccessToken: string;
  onMpAccessTokenChange: (v: string) => void;
  mpSandbox: boolean;
  onMpSandboxChange: (v: boolean) => void;
  mpProducts: FinanceGatewayMercadoPagoProducts;
  onMpProductsChange: (p: FinanceGatewayMercadoPagoProducts) => void;
  mpWebhookSigSecret: string;
  onMpWebhookSigSecretChange: (v: string) => void;
  onTestMp: () => void;
  onSaveMpCredentials: () => void;
  onSaveMpProducts: () => void;
  onSaveMpWebhookSig: () => void;
  onClearMpWebhookSig: () => void;
  onRemoveMp: () => void;
  onCopyMpWebhook: () => void;
  stoneSecretKey: string;
  onStoneSecretKeyChange: (v: string) => void;
  stonePublicKey: string;
  onStonePublicKeyChange: (v: string) => void;
  stoneSandbox: boolean;
  onStoneSandboxChange: (v: boolean) => void;
  stoneTesting: boolean;
  stoneSaving: boolean;
  onTestStone: () => void;
  onSaveStone: () => void;
  onRemoveStone: () => void;
  onCopyStoneWebhook: () => void;
};

function ConfigSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.reconcilePanel}>
      <h3 className={styles.reconcilePanelTitle}>
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

export function FinanceAccountConfigModal({
  account,
  gateways,
  catalog,
  displayBalance,
  error,
  msg,
  configProvider,
  onConfigProviderChange,
  onClose,
  asaasApiKey,
  onAsaasApiKeyChange,
  asaasSandbox,
  onAsaasSandboxChange,
  onTestAsaas,
  onSaveAsaas,
  onRemoveAsaas,
  mpPublicKey,
  onMpPublicKeyChange,
  mpAccessToken,
  onMpAccessTokenChange,
  mpSandbox,
  onMpSandboxChange,
  mpProducts,
  onMpProductsChange,
  mpWebhookSigSecret,
  onMpWebhookSigSecretChange,
  onTestMp,
  onSaveMpCredentials,
  onSaveMpProducts,
  onSaveMpWebhookSig,
  onClearMpWebhookSig,
  onRemoveMp,
  onCopyMpWebhook,
  stoneSecretKey,
  onStoneSecretKeyChange,
  stonePublicKey,
  onStonePublicKeyChange,
  stoneSandbox,
  onStoneSandboxChange,
  stoneTesting,
  stoneSaving,
  onTestStone,
  onSaveStone,
  onRemoveStone,
  onCopyStoneWebhook,
}: FinanceAccountConfigModalProps) {
  const nativeProvider = financeAccountConfigProvider(account, gateways);
  const summary = accountIntegrationSummary(account, gateways);
  const hasNativeIntegration = nativeProvider !== "none";
  const balance =
    displayBalance != null && Number.isFinite(displayBalance)
      ? displayBalance
      : Number(account.initial_balance || 0);

  const summaryBadgeVariant =
    summary?.tone === "success" ? "success" : summary?.tone === "warning" ? "warning" : "secondary";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className={styles.reconcileOverlay}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`${styles.reconcileDialog} ${styles.configDialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-config-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.reconcileDialogHeader}>
          <div className={styles.reconcileDialogTitleWrap}>
            <span className={styles.configDialogMark} aria-hidden>
              <FinanceAccountBankMark account={account} gateways={gateways} catalog={catalog} variant="card" />
            </span>
            <div>
              <h2 id="account-config-title" className={styles.reconcileDialogTitle}>
                Configurar conta
              </h2>
              <p className={styles.reconcileDialogSubtitle}>{account.name}</p>
            </div>
          </div>
          <button type="button" className={styles.reconcileDialogClose} onClick={onClose} aria-label="Fechar">
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </header>

        <div className={styles.reconcileDialogBody}>
          <section className={styles.configSummaryPanel}>
            <dl className={styles.configSummaryGrid}>
              <div>
                <dt>Tipo</dt>
                <dd>{financeAccountTypeLabel(account)}</dd>
              </div>
              <div>
                <dt>Instituição</dt>
                <dd>{account.bank_name?.trim() || "—"}</dd>
              </div>
              <div>
                <dt>Saldo</dt>
                <dd className={styles.configSummaryBalance}>{money(balance)}</dd>
              </div>
              <div>
                <dt>Integração</dt>
                <dd>
                  {summary ? (
                    <Badge variant={summaryBadgeVariant}>{summary.label}</Badge>
                  ) : (
                    "—"
                  )}
                  {summary?.detail ? (
                    <span className={styles.configSummaryDetail}>{summary.detail}</span>
                  ) : null}
                </dd>
              </div>
            </dl>
          </section>

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

          {!hasNativeIntegration ? (
            <ConfigSection
              title="Conciliação bancária"
              icon={<Wallet size={16} strokeWidth={2} aria-hidden />}
            >
              <p className={styles.reconcilePanelDesc}>
                Esta conta não usa API de cobrança. Use o menu <strong>Conciliar (OFX)</strong> no card da conta para
                importar o extrato e vincular lançamentos pendentes.
              </p>
            </ConfigSection>
          ) : null}

          {!hasNativeIntegration ? (
            <ConfigSection
              title="Conectar gateway de pagamento"
              icon={<Link2 size={16} strokeWidth={2} aria-hidden />}
            >
              <p className={styles.reconcilePanelDesc}>
                Opcional: vincule Mercado Pago, Stone ou Asaas a esta conta para Pix, boleto e cartão nos lançamentos.
              </p>
              <div className={formLayout.field}>
                <label className={styles.fieldLabel} htmlFor="finance-config-provider">
                  Provedor
                </label>
                <select
                  id="finance-config-provider"
                  className={styles.configSelect}
                  value={configProvider}
                  onChange={(e) => onConfigProviderChange(e.target.value as Provider)}
                >
                  <option value="none">Nenhum (somente OFX)</option>
                  <option value="mercadopago">Mercado Pago</option>
                  <option value="stone">Stone / Pagar.me</option>
                  <option value="asaas">Asaas</option>
                </select>
              </div>
            </ConfigSection>
          ) : (
            <ConfigSection
              title={PROVIDER_LABELS[nativeProvider]}
              icon={<Settings2 size={16} strokeWidth={2} aria-hidden />}
            >
              <div className={styles.configStatusRow}>
                {gateways && nativeProvider === "mercadopago" && gateways.mercadopago.connected ? (
                  <span className={styles.reconcileBadgeOk}>
                    <CheckCircle2 size={14} aria-hidden />
                    Conectado
                  </span>
                ) : null}
                {gateways && nativeProvider === "stone" && gateways.stone.connected ? (
                  <span className={styles.reconcileBadgeOk}>
                    <CheckCircle2 size={14} aria-hidden />
                    Conectado
                  </span>
                ) : null}
                {gateways && nativeProvider === "asaas" && gateways.asaas.connected ? (
                  <span className={styles.reconcileBadgeOk}>
                    <CheckCircle2 size={14} aria-hidden />
                    Conectado
                  </span>
                ) : null}
              </div>
            </ConfigSection>
          )}

          <div className={`${formLayout.stack} ${styles.configForm}`}>
            {(hasNativeIntegration ? nativeProvider : configProvider) === "asaas" ? (
              <AsaasFields
                gateways={gateways}
                asaasApiKey={asaasApiKey}
                onAsaasApiKeyChange={onAsaasApiKeyChange}
                asaasSandbox={asaasSandbox}
                onAsaasSandboxChange={onAsaasSandboxChange}
                onTestAsaas={onTestAsaas}
                onSaveAsaas={onSaveAsaas}
                onRemoveAsaas={onRemoveAsaas}
              />
            ) : null}
            {(hasNativeIntegration ? nativeProvider : configProvider) === "mercadopago" ? (
              <MercadoPagoFields
                gateways={gateways}
                mpPublicKey={mpPublicKey}
                onMpPublicKeyChange={onMpPublicKeyChange}
                mpAccessToken={mpAccessToken}
                onMpAccessTokenChange={onMpAccessTokenChange}
                mpSandbox={mpSandbox}
                onMpSandboxChange={onMpSandboxChange}
                mpProducts={mpProducts}
                onMpProductsChange={onMpProductsChange}
                mpWebhookSigSecret={mpWebhookSigSecret}
                onMpWebhookSigSecretChange={onMpWebhookSigSecretChange}
                onTestMp={onTestMp}
                onSaveMpCredentials={onSaveMpCredentials}
                onSaveMpProducts={onSaveMpProducts}
                onSaveMpWebhookSig={onSaveMpWebhookSig}
                onClearMpWebhookSig={onClearMpWebhookSig}
                onRemoveMp={onRemoveMp}
                onCopyMpWebhook={onCopyMpWebhook}
              />
            ) : null}
            {(hasNativeIntegration ? nativeProvider : configProvider) === "stone" ? (
              <StoneFields
                gateways={gateways}
                stoneSecretKey={stoneSecretKey}
                onStoneSecretKeyChange={onStoneSecretKeyChange}
                stonePublicKey={stonePublicKey}
                onStonePublicKeyChange={onStonePublicKeyChange}
                stoneSandbox={stoneSandbox}
                onStoneSandboxChange={onStoneSandboxChange}
                stoneTesting={stoneTesting}
                stoneSaving={stoneSaving}
                onTestStone={onTestStone}
                onSaveStone={onSaveStone}
                onRemoveStone={onRemoveStone}
                onCopyStoneWebhook={onCopyStoneWebhook}
              />
            ) : null}
          </div>
        </div>

        <footer className={styles.reconcileDialogFooter}>
          <Button type="button" variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </footer>
      </div>
    </div>
  );
}

function AsaasFields({
  gateways,
  asaasApiKey,
  onAsaasApiKeyChange,
  asaasSandbox,
  onAsaasSandboxChange,
  onTestAsaas,
  onSaveAsaas,
  onRemoveAsaas,
}: Pick<
  FinanceAccountConfigModalProps,
  | "gateways"
  | "asaasApiKey"
  | "onAsaasApiKeyChange"
  | "asaasSandbox"
  | "onAsaasSandboxChange"
  | "onTestAsaas"
  | "onSaveAsaas"
  | "onRemoveAsaas"
>) {
  return (
    <>
      <div className={formLayout.field}>
        <label className={styles.fieldLabel} htmlFor="config-asaas-api-key">
          API Key Asaas
        </label>
        <input
          id="config-asaas-api-key"
          className={styles.configInput}
          type="password"
          value={asaasApiKey}
          onChange={(e) => onAsaasApiKeyChange(e.target.value)}
          placeholder="API Key Asaas"
        />
      </div>
      <label className={styles.toggleRow}>
        <input type="checkbox" checked={asaasSandbox} onChange={(e) => onAsaasSandboxChange(e.target.checked)} />
        Sandbox
      </label>
      <div className={styles.configActions}>
        <Button type="button" variant="outline" onClick={onTestAsaas}>
          Testar
        </Button>
        <Button type="button" onClick={onSaveAsaas}>
          Salvar
        </Button>
        {gateways?.asaas.connected ? (
          <Button type="button" variant="destructive" onClick={onRemoveAsaas}>
            Remover
          </Button>
        ) : null}
      </div>
    </>
  );
}

function MercadoPagoFields({
  gateways,
  mpPublicKey,
  onMpPublicKeyChange,
  mpAccessToken,
  onMpAccessTokenChange,
  mpSandbox,
  onMpSandboxChange,
  mpProducts,
  onMpProductsChange,
  mpWebhookSigSecret,
  onMpWebhookSigSecretChange,
  onTestMp,
  onSaveMpCredentials,
  onSaveMpProducts,
  onSaveMpWebhookSig,
  onClearMpWebhookSig,
  onRemoveMp,
  onCopyMpWebhook,
}: Pick<
  FinanceAccountConfigModalProps,
  | "gateways"
  | "mpPublicKey"
  | "onMpPublicKeyChange"
  | "mpAccessToken"
  | "onMpAccessTokenChange"
  | "mpSandbox"
  | "onMpSandboxChange"
  | "mpProducts"
  | "onMpProductsChange"
  | "mpWebhookSigSecret"
  | "onMpWebhookSigSecretChange"
  | "onTestMp"
  | "onSaveMpCredentials"
  | "onSaveMpProducts"
  | "onSaveMpWebhookSig"
  | "onClearMpWebhookSig"
  | "onRemoveMp"
  | "onCopyMpWebhook"
>) {
  const mp = gateways?.mercadopago;
  return (
    <>
      {mp?.connected && mp.products ? (
        <div className={styles.configProductChips}>
          {mp.products.pix ? <span className={styles.configChip}>Pix</span> : null}
          {mp.products.boleto ? <span className={styles.configChip}>Boleto</span> : null}
          {mp.products.checkout_pro ? <span className={styles.configChip}>Checkout</span> : null}
          {mp.products.payment_link ? <span className={styles.configChip}>Link</span> : null}
          {mp.products.subscriptions ? <span className={styles.configChip}>Assinaturas</span> : null}
        </div>
      ) : null}
      {mp?.webhook_url ? (
        <div className={styles.webhookBox}>
          <span className={styles.smallMuted}>URL do webhook (painel Mercado Pago)</span>
          <code className={styles.webhookCode}>{mp.webhook_url}</code>
          <Button type="button" variant="outline" size="sm" onClick={onCopyMpWebhook}>
            Copiar URL
          </Button>
        </div>
      ) : null}
      {mp?.connected &&
      !mp.sandbox &&
      mp.webhook_signature_enforced &&
      !mp.webhook_signature_configured ? (
        <p className={styles.configWarn}>
          Webhook assinado obrigatório em produção. Configure o segredo abaixo.
        </p>
      ) : null}
      {mp?.connected ? (
        <div className={styles.webhookBox}>
          <div className={formLayout.field}>
            <span className={styles.smallMuted}>Segredo x-signature (painel MP)</span>
            <input
              className={styles.configInput}
              type="password"
              value={mpWebhookSigSecret}
              onChange={(e) => onMpWebhookSigSecretChange(e.target.value)}
              placeholder={
                mp.webhook_signature_configured ? "Novo segredo (substitui)" : "Cole o segredo do painel"
              }
              autoComplete="off"
            />
          </div>
          <div className={styles.configActions}>
            <Button type="button" variant="outline" disabled={!mpWebhookSigSecret.trim()} onClick={onSaveMpWebhookSig}>
              Salvar segredo
            </Button>
            {mp.webhook_signature_configured ? (
              <Button
                type="button"
                variant="ghost"
                disabled={Boolean(mp.webhook_signature_enforced && !mp.sandbox)}
                onClick={onClearMpWebhookSig}
              >
                Remover segredo
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className={formLayout.field}>
        <label className={styles.fieldLabel} htmlFor="config-mp-public-key">
          Public Key
        </label>
        <input
          id="config-mp-public-key"
          className={styles.configInput}
          value={mpPublicKey}
          onChange={(e) => onMpPublicKeyChange(e.target.value)}
          placeholder="Nova chave (opcional se já conectado)"
          autoComplete="off"
        />
      </div>
      <div className={formLayout.field}>
        <label className={styles.fieldLabel} htmlFor="config-mp-access-token">
          Access Token
        </label>
        <input
          id="config-mp-access-token"
          className={styles.configInput}
          type="password"
          value={mpAccessToken}
          onChange={(e) => onMpAccessTokenChange(e.target.value)}
          placeholder="Novo token (opcional se já conectado)"
          autoComplete="off"
        />
      </div>
      <label className={styles.toggleRow}>
        <input type="checkbox" checked={mpSandbox} onChange={(e) => onMpSandboxChange(e.target.checked)} />
        Sandbox
      </label>
      <p className={styles.subHeading}>Produtos ativos</p>
      <label className={styles.toggleRow}>
        <input
          type="checkbox"
          checked={mpProducts.checkout_pro}
          onChange={(e) => onMpProductsChange({ ...mpProducts, checkout_pro: e.target.checked })}
        />
        Checkout Pro
      </label>
      <label className={styles.toggleRow}>
        <input
          type="checkbox"
          checked={mpProducts.pix}
          onChange={(e) => onMpProductsChange({ ...mpProducts, pix: e.target.checked })}
        />
        Pix
      </label>
      <label className={styles.toggleRow}>
        <input
          type="checkbox"
          checked={mpProducts.boleto}
          onChange={(e) => onMpProductsChange({ ...mpProducts, boleto: e.target.checked })}
        />
        Boleto
      </label>
      <label className={styles.toggleRow}>
        <input
          type="checkbox"
          checked={mpProducts.subscriptions}
          onChange={(e) => onMpProductsChange({ ...mpProducts, subscriptions: e.target.checked })}
        />
        Assinaturas
      </label>
      <label className={styles.toggleRow}>
        <input
          type="checkbox"
          checked={mpProducts.payment_link}
          onChange={(e) => onMpProductsChange({ ...mpProducts, payment_link: e.target.checked })}
        />
        Link de pagamento
      </label>
      <div className={styles.configActions}>
        <Button type="button" variant="outline" onClick={onTestMp}>
          Testar credenciais
        </Button>
        <Button type="button" onClick={onSaveMpCredentials} disabled={!mpAccessToken.trim() || !mpPublicKey.trim()}>
          Salvar credenciais
        </Button>
        <Button type="button" variant="outline" onClick={onSaveMpProducts}>
          Salvar produtos
        </Button>
        {mp?.connected ? (
          <Button type="button" variant="destructive" onClick={onRemoveMp}>
            Remover integração
          </Button>
        ) : null}
      </div>
    </>
  );
}

function StoneFields({
  gateways,
  stoneSecretKey,
  onStoneSecretKeyChange,
  stonePublicKey,
  onStonePublicKeyChange,
  stoneSandbox,
  onStoneSandboxChange,
  stoneTesting,
  stoneSaving,
  onTestStone,
  onSaveStone,
  onRemoveStone,
  onCopyStoneWebhook,
}: Pick<
  FinanceAccountConfigModalProps,
  | "gateways"
  | "stoneSecretKey"
  | "onStoneSecretKeyChange"
  | "stonePublicKey"
  | "onStonePublicKeyChange"
  | "stoneSandbox"
  | "onStoneSandboxChange"
  | "stoneTesting"
  | "stoneSaving"
  | "onTestStone"
  | "onSaveStone"
  | "onRemoveStone"
  | "onCopyStoneWebhook"
>) {
  const st = gateways?.stone;
  return (
    <>
      <p className={styles.reconcilePanelDesc}>
        Chave Pagar.me (sk_…) para Pix, boleto e cartão nos lançamentos. Webhook marca pagamentos como conciliados.
      </p>
      {st?.webhook_url ? (
        <div className={styles.webhookBox}>
          <span className={styles.smallMuted}>URL do webhook (painel Pagar.me)</span>
          <code className={styles.webhookCode}>{st.webhook_url}</code>
          <Button type="button" variant="outline" size="sm" onClick={onCopyStoneWebhook}>
            Copiar URL
          </Button>
        </div>
      ) : null}
      <div className={formLayout.field}>
        <label className={styles.fieldLabel} htmlFor="config-stone-sk">
          Chave secreta (sk_…)
        </label>
        <input
          id="config-stone-sk"
          className={styles.configInput}
          type="password"
          value={stoneSecretKey}
          onChange={(e) => onStoneSecretKeyChange(e.target.value)}
          placeholder={st?.connected ? "Deixe em branco para manter" : "Cole a chave completa"}
          autoComplete="new-password"
        />
      </div>
      <div className={formLayout.field}>
        <label className={styles.fieldLabel} htmlFor="config-stone-pk">
          Chave pública (pk_…)
        </label>
        <input
          id="config-stone-pk"
          className={styles.configInput}
          type="password"
          value={stonePublicKey}
          onChange={(e) => onStonePublicKeyChange(e.target.value)}
          placeholder="Tokenização de cartão no navegador"
          autoComplete="new-password"
        />
      </div>
      <label className={styles.toggleRow}>
        <input type="checkbox" checked={stoneSandbox} onChange={(e) => onStoneSandboxChange(e.target.checked)} />
        Indicador sandbox
      </label>
      <div className={styles.configActions}>
        <Button type="button" variant="outline" disabled={stoneTesting} onClick={onTestStone}>
          {stoneTesting ? "Testando…" : "Testar chave"}
        </Button>
        <Button type="button" disabled={stoneSaving || stoneTesting} onClick={onSaveStone}>
          {stoneSaving ? "Salvando…" : "Salvar integração"}
        </Button>
        {st?.connected ? (
          <Button type="button" variant="destructive" onClick={onRemoveStone}>
            Remover integração
          </Button>
        ) : null}
      </div>
    </>
  );
}
