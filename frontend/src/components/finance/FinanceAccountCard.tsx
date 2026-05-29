import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  GitCompareArrows,
  MoreVertical,
  Settings2,
  Trash2,
  Wallet,
} from "lucide-react";
import type { FinanceBankAccountOut, FinanceBankCatalogRow, FinanceGatewaysOut } from "../../api/finance";
import { FinanceAccountBankMark, financeAccountConfigProvider } from "./FinanceAccountBankMark";
import { Badge } from "../ui/badge";
import styles from "./FinanceAccountCard.module.css";

export type AccountCardStatus = "active" | "attention" | "inactive";

export function resolveAccountCardStatus(
  account: FinanceBankAccountOut,
  gateways: FinanceGatewaysOut | null,
): AccountCardStatus {
  if (!account.is_active) return "inactive";
  const provider = financeAccountConfigProvider(account, gateways);
  if (provider === "mercadopago") {
    return gateways?.mercadopago?.connected ? "active" : "attention";
  }
  if (provider === "stone") {
    return gateways?.stone?.connected ? "active" : "attention";
  }
  if (provider === "asaas") {
    return gateways?.asaas?.connected ? "active" : "attention";
  }
  return "active";
}

export function accountStatusLabel(
  account: FinanceBankAccountOut,
  gateways: FinanceGatewaysOut | null,
): string | null {
  const status = resolveAccountCardStatus(account, gateways);
  if (status === "inactive") return "Inativa";
  if (status === "attention") return "Aguardando integração";
  return "Conta ativa";
}

function money(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}

/** Sparkline sintética estável por conta (tendência visual). */
export function sparklinePoints(accountId: number, balance: number): string {
  const n = 8;
  const norm = Math.abs(balance) % 4000;
  let y = 28 + (norm / 4000) * 40;
  const out: string[] = [];
  const step = 252 / (n - 1);
  for (let i = 0; i < n; i += 1) {
    const wobble = (((accountId * 31 + i * 13) % 17) - 8) * 1.1;
    y = Math.max(14, Math.min(70, y + wobble));
    out.push(`${(i * step).toFixed(1)},${y.toFixed(1)}`);
  }
  return out.join(" ");
}

type Props = {
  account: FinanceBankAccountOut;
  gateways: FinanceGatewaysOut | null;
  catalog: FinanceBankCatalogRow[] | null;
  onReconcile: () => void;
  onConfigure: () => void;
  onDelete: () => void;
  showGatewayReconciliation?: boolean;
};

export function FinanceAccountCard({
  account,
  gateways,
  catalog,
  onReconcile,
  onConfigure,
  onDelete,
  showGatewayReconciliation,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const status = resolveAccountCardStatus(account, gateways);
  const statusLabel = accountStatusLabel(account, gateways);
  const isCaixa = account.name.trim().toLowerCase() === "caixa";
  const provider = financeAccountConfigProvider(account, gateways);
  const showReconcileCta = provider === "mercadopago" || provider === "stone";

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <article className={`${styles.card} ${styles[`status_${status}`]}`}>
      <div className={styles.cardTop}>
        <div className={styles.bankMark} title={account.bank_name || account.name}>
          <FinanceAccountBankMark account={account} gateways={gateways} catalog={catalog} variant="card" />
        </div>
        <div className={styles.menuWrap} ref={menuRef}>
          <button
            type="button"
            className={`${styles.menuTrigger} ${menuOpen ? styles.menuTriggerOpen : ""}`}
            aria-label={`Ações da conta ${account.name}`}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <MoreVertical size={18} aria-hidden />
          </button>
          {menuOpen ? (
            <div className={styles.menu} role="menu">
              <button type="button" className={styles.menuItem} role="menuitem" onClick={() => { setMenuOpen(false); onReconcile(); }}>
                <GitCompareArrows size={16} aria-hidden />
                Conciliar (OFX)
              </button>
              {showGatewayReconciliation ? (
                <Link
                  to="/app/finance/reconciliation"
                  className={styles.menuItem}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                >
                  <Wallet size={16} aria-hidden />
                  Conciliação gateway
                </Link>
              ) : null}
              <button type="button" className={styles.menuItem} role="menuitem" onClick={() => { setMenuOpen(false); onConfigure(); }}>
                <Settings2 size={16} aria-hidden />
                Configurar conta
              </button>
              {!isCaixa ? (
                <>
                  <div className={styles.menuDivider} role="separator" />
                  <button
                    type="button"
                    className={`${styles.menuItem} ${styles.menuItemDanger}`}
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); onDelete(); }}
                  >
                    <Trash2 size={16} aria-hidden />
                    Excluir
                  </button>
                </>
              ) : (
                <p className={styles.menuHint}>Conta obrigatória do sistema</p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <h3 className={styles.accountName}>{account.name}</h3>

      <div className={styles.balanceBlock}>
        <span className={styles.balanceLabel}>Saldo</span>
        <p className={styles.balanceValue}>{money(Number(account.initial_balance || 0))}</p>
      </div>

      <svg className={styles.sparkline} viewBox="0 0 252 56" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id={`spark-${account.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          className={styles.sparklineLine}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={sparklinePoints(account.id, Number(account.initial_balance || 0))}
        />
        <polygon
          className={styles.sparklineFill}
          fill={`url(#spark-${account.id})`}
          points={`0,56 ${sparklinePoints(account.id, Number(account.initial_balance || 0))} 252,56`}
        />
      </svg>

      <footer className={styles.cardFooter}>
        {statusLabel ? (
          <Badge variant={status === "attention" ? "warning" : status === "inactive" ? "secondary" : "success"}>
            {statusLabel}
          </Badge>
        ) : null}
        {showReconcileCta && status === "active" ? (
          <button type="button" className={styles.reconcileCta} onClick={onReconcile}>
            Conciliar
          </button>
        ) : null}
      </footer>
    </article>
  );
}
