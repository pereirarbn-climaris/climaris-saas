import { useState } from "react";
import { Calculator, Info } from "lucide-react";
import {
  EXAMPLE_SALE_AMOUNT,
  formatBrl,
  netFromGross,
  type SimulatorMode,
} from "../../lib/financeMaquininhaUtils";
import type { PlanoTaxas } from "../../schemas/financeMaquininha";
import styles from "./FinanceMachinesPage.module.css";

type Props = {
  planoTaxas: PlanoTaxas;
  planLabel: string;
  saleAmount?: number;
};

export function MachineProfitSimulator({ planoTaxas, planLabel, saleAmount = EXAMPLE_SALE_AMOUNT }: Props) {
  const [mode, setMode] = useState<SimulatorMode>("credit");
  const [installments, setInstallments] = useState(1);

  const feePercent =
    mode === "debit" ? planoTaxas.taxaDebito : (planoTaxas.taxasCredito[String(installments)] ?? 0);
  const net = netFromGross(saleAmount, feePercent);
  const feeAmount = Math.round((saleAmount - net) * 100) / 100;

  return (
    <aside className={styles.simulator} aria-label="Simulador de lucro líquido">
      <div className={styles.simulatorHeader}>
        <Calculator size={20} className="text-teal-700 shrink-0" aria-hidden />
        <div>
          <h3 className={styles.simulatorTitle}>Simulador de recebimento</h3>
          <p className={styles.simulatorSubtitle}>Plano: {planLabel}</p>
        </div>
      </div>

      <div className={styles.simulatorControls}>
        <label className={styles.simField}>
          <span>Tipo</span>
          <select
            className={styles.simSelect}
            value={mode}
            onChange={(e) => setMode(e.target.value as SimulatorMode)}
          >
            <option value="debit">Débito</option>
            <option value="credit">Crédito</option>
          </select>
        </label>
        {mode === "credit" ? (
          <label className={styles.simField}>
            <span>Parcelas</span>
            <select
              className={styles.simSelect}
              value={installments}
              onChange={(e) => setInstallments(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}x
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <dl className={styles.simulatorMetrics}>
        <div>
          <dt>Venda exemplo</dt>
          <dd>{formatBrl(saleAmount)}</dd>
        </div>
        <div>
          <dt>
            Taxa aplicada
            <span className={styles.infoWrap} title="Percentual cadastrado para o tipo e parcelas selecionados.">
              <Info size={12} aria-hidden />
            </span>
          </dt>
          <dd>{feePercent.toFixed(2).replace(".", ",")}%</dd>
        </div>
        <div>
          <dt>Custo estimado</dt>
          <dd className={styles.metricMuted}>{formatBrl(feeAmount)}</dd>
        </div>
        <div className={styles.metricHighlight}>
          <dt>Recebimento líquido</dt>
          <dd>{formatBrl(net)}</dd>
        </div>
      </dl>

      <p className={styles.simulatorFootnote}>
        Estimativa antes de antecipação bancária. Valores reais podem variar conforme contrato com a adquirente.
      </p>
    </aside>
  );
}
