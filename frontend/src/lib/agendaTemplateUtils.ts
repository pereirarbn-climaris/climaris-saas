/** Variáveis permitidas no template de lembrete (formato Python `{var}` no backend). */
export const AGENDA_REMINDER_VARIABLES = [
  { tag: "{nome_cliente}", label: "Nome do cliente", alias: "client_name" },
  { tag: "{data_hora}", label: "Data e hora", alias: "date_time" },
  { tag: "{empresa}", label: "Empresa", alias: "company" },
  { tag: "{confirmar_acao}", label: "Ação confirmar", alias: "confirm_action" },
  { tag: "{remarcar_acao}", label: "Ação remarcar", alias: "reschedule_action" },
] as const;

export const AGENDA_REPLY_VARIABLES = [{ tag: "{data_hora}", label: "Data e hora", alias: "date_time" }] as const;

const PREVIEW_SAMPLES: Record<string, string> = {
  nome_cliente: "Maria Santos",
  data_hora: "15/06/2026 às 14:30",
  empresa: "Climaris Ar Condicionado",
  confirmar_acao: "CONFIRMAR",
  remarcar_acao: "REMARCAR",
};

export function substituteAgendaPreview(text: string): string {
  let out = text;
  for (const [key, sample] of Object.entries(PREVIEW_SAMPLES)) {
    out = out.replace(new RegExp(`\\{${key}\\}`, "g"), sample);
  }
  return out;
}

export function insertTextAtCursor(
  textarea: HTMLTextAreaElement,
  insert: string,
  currentValue: string,
): { value: string; cursor: number } {
  const start = textarea.selectionStart ?? currentValue.length;
  const end = textarea.selectionEnd ?? start;
  const value = currentValue.slice(0, start) + insert + currentValue.slice(end);
  const cursor = start + insert.length;
  return { value, cursor };
}

export function focusTextareaCursor(textarea: HTMLTextAreaElement, cursor: number) {
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor);
  });
}
