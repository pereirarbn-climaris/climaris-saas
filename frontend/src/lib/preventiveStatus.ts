export type PreventiveStatusKind = "overdue" | "due_this_month" | "on_track";

export type PreventiveStatusMeta = {
  kind: PreventiveStatusKind;
  label: string;
  badgeVariant: "destructive" | "warning" | "success" | "secondary";
};

export function getPreventiveStatus(
  diasAteVencimento: number,
  dataProximoVencimento: string,
): PreventiveStatusKind {
  if (diasAteVencimento < 0) return "overdue";

  const due = new Date(dataProximoVencimento);
  const now = new Date();
  if (
    !Number.isNaN(due.getTime()) &&
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth()
  ) {
    return "due_this_month";
  }

  return "on_track";
}

export function preventiveStatusMeta(
  diasAteVencimento: number,
  dataProximoVencimento: string,
): PreventiveStatusMeta {
  const kind = getPreventiveStatus(diasAteVencimento, dataProximoVencimento);

  if (kind === "overdue") {
    return { kind, label: "Atrasada", badgeVariant: "destructive" };
  }
  if (kind === "due_this_month") {
    return { kind, label: "Vence este Mês", badgeVariant: "warning" };
  }
  if (diasAteVencimento <= 30) {
    return { kind, label: "Em Dia", badgeVariant: "success" };
  }
  return { kind, label: "Agendada", badgeVariant: "secondary" };
}

export function computePreventiveStats(items: Array<{ dias_ate_vencimento: number }>, clientCount: number) {
  const overdue = items.filter((row) => row.dias_ate_vencimento < 0).length;
  const onSchedule = items.filter((row) => row.dias_ate_vencimento >= 0).length;

  return {
    clientsInContract: clientCount,
    onSchedule,
    overdue,
  };
}
