import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getPmocComplianceSummary,
  type PmocComplianceSummaryOut,
} from "../../api/pmoc";
import { PmocComplianceTrafficPanel } from "./PmocComplianceTrafficPanel";
import styles from "./ComplianceDashboard.module.css";

type Props = {
  pmocId: number;
  /** Link para o painel completo de conformidade */
  showFullPanelLink?: boolean;
  /** Resumo pré-carregado (evita fetch duplicado na página de detalhe) */
  summary?: PmocComplianceSummaryOut | null;
};

export function ComplianceDashboard({ pmocId, showFullPanelLink = true, summary: summaryProp }: Props) {
  const [summaryLocal, setSummaryLocal] = useState<PmocComplianceSummaryOut | null>(null);
  const [loading, setLoading] = useState(summaryProp === undefined);
  const [error, setError] = useState("");

  const summary = summaryProp !== undefined ? summaryProp : summaryLocal;

  useEffect(() => {
    if (summaryProp !== undefined) return;
    if (!Number.isFinite(pmocId) || pmocId < 1) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const data = await getPmocComplianceSummary(pmocId);
        if (!cancelled) setSummaryLocal(data);
      } catch (e) {
        if (!cancelled) {
          setSummaryLocal(null);
          setError(e instanceof Error ? e.message : "Não foi possível carregar a conformidade.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pmocId, summaryProp]);

  if (summaryProp === undefined && loading) {
    return <p className={styles.muted}>Carregando indicadores de conformidade…</p>;
  }

  if (error) {
    return <p className={styles.error}>{error}</p>;
  }

  if (!summary) {
    return null;
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Painel de conformidade</h3>
          <p className={styles.lead}>
            ART, análise de ar e execução do cronograma mensal — semáforo verde, amarelo ou vermelho.
          </p>
        </div>
        {showFullPanelLink ? (
          <Link to={`/app/pmoc/conformidade/${pmocId}`} className={styles.link}>
            Painel completo
          </Link>
        ) : null}
      </div>
      <PmocComplianceTrafficPanel
        indicators={summary.indicators}
        overallStatus={summary.overall_status}
        openOccurrences={summary.open_occurrences}
      />
      <p className={styles.meta}>
        Execução do mês: <strong>{summary.monthly_execution_pct}%</strong>
        {summary.open_occurrences > 0 ? (
          <>
            {" · "}
            <strong>{summary.open_occurrences}</strong> incidente(s) aberto(s)
          </>
        ) : null}
      </p>
    </div>
  );
}
