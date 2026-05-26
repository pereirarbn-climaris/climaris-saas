import type { PmocComplianceSummaryOut, PmocPlanOut } from "../../api/pmoc";
import styles from "../../pages/pmoc/PmocPages.module.css";

type TabKey = "overview" | "schedule" | "executions" | "air" | "occurrences" | "planning";

type BannerItem = {
  id: string;
  tone: "danger" | "warning" | "info";
  label: string;
  tab?: TabKey;
};

type Props = {
  plan: PmocPlanOut;
  complianceSummary: PmocComplianceSummaryOut | null;
  selectedBtuSum: number;
  equipmentCount: number;
  openOccurrencesCount: number;
  onNavigateTab?: (tab: TabKey) => void;
};

function formatBtuLocal(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M BTU`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",")}k BTU`;
  return `${n} BTU`;
}

export function PmocStatusBannerRow({
  plan,
  complianceSummary,
  selectedBtuSum,
  equipmentCount,
  openOccurrencesCount,
  onNavigateTab,
}: Props) {
  const items: BannerItem[] = [];

  if (plan.air_analysis_required || selectedBtuSum >= 60_000) {
    items.push({
      id: "btu-law",
      tone: "warning",
      label: `Capacidade ${formatBtuLocal(selectedBtuSum)} ≥ 60k BTU — análise de ar obrigatória`,
      tab: "air",
    });
  } else if (selectedBtuSum > 0) {
    items.push({
      id: "btu-ok",
      tone: "info",
      label: `Capacidade ${formatBtuLocal(selectedBtuSum)} — análise de ar não exigida`,
    });
  }

  if (equipmentCount === 0 && plan.status === "draft") {
    items.push({
      id: "no-equip",
      tone: "warning",
      label: "Nenhum equipamento vinculado — necessário para ativar",
      tab: "overview",
    });
  }

  for (const indicator of complianceSummary?.indicators ?? []) {
    if (indicator.status === "green") continue;
    items.push({
      id: `compliance-${indicator.key}`,
      tone: indicator.status === "red" ? "danger" : "warning",
      label: `${indicator.label}: ${indicator.summary}`,
      tab: indicator.key === "art" || indicator.key === "air_quality" ? "air" : undefined,
    });
  }

  if (openOccurrencesCount > 0) {
    items.push({
      id: "occurrences",
      tone: "danger",
      label: `${openOccurrencesCount} incidente(s) aberto(s)`,
      tab: "occurrences",
    });
  }

  if (items.length === 0) {
    items.push({
      id: "law-default",
      tone: "info",
      label: "Lei Federal nº 13.589/2018 — mantenha cronograma e registros atualizados",
    });
  }

  return (
    <div className={styles.statusBannerRow} role="region" aria-label="Alertas de conformidade">
      {items.map((item) => {
        const toneClass =
          item.tone === "danger"
            ? styles.statusBannerDanger
            : item.tone === "warning"
              ? styles.statusBannerWarning
              : styles.statusBannerInfo;

        if (item.tab && onNavigateTab) {
          return (
            <button
              key={item.id}
              type="button"
              className={`${styles.statusBannerChip} ${toneClass}`}
              onClick={() => onNavigateTab(item.tab!)}
              title="Ver detalhes"
            >
              {item.label}
            </button>
          );
        }

        return (
          <span key={item.id} className={`${styles.statusBannerChip} ${toneClass}`}>
            {item.label}
          </span>
        );
      })}
    </div>
  );
}
