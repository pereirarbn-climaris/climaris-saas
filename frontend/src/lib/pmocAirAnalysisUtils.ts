import type { PmocAirQualityAnalysisOut } from "../api/pmoc";

export function formatMonthYearPt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatDateShortPt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

/** Próxima análise = 6 meses após a última enviada; senão usa vencimento do plano. */
export function computeNextAirAnalysis(
  analyses: PmocAirQualityAnalysisOut[],
  planDue: string | null,
): { label: string; attention: boolean } {
  const sorted = [...analyses].sort(
    (a, b) => new Date(b.analysis_date).getTime() - new Date(a.analysis_date).getTime(),
  );

  if (sorted.length > 0) {
    const latest = sorted[0]!;
    const base = new Date(`${latest.analysis_date}T12:00:00`);
    const next = new Date(base);
    next.setMonth(next.getMonth() + 6);
    return {
      label: formatMonthYearPt(next.toISOString()),
      attention: next.getTime() < Date.now(),
    };
  }

  if (planDue) {
    const due = new Date(`${planDue}T12:00:00`);
    return {
      label: formatMonthYearPt(planDue),
      attention: !Number.isNaN(due.getTime()) && due.getTime() < Date.now(),
    };
  }

  return { label: "Pendente — envie a 1ª análise", attention: true };
}
