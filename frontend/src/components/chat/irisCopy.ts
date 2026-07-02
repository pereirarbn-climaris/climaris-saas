export const IRIS_TAGLINE = "A IA que entende de ar";

export function getIrisIntroMessage(options: {
  contextLabel?: string;
  source?: "equipment_detail" | "route" | "none" | null;
}): string {
  const { contextLabel, source } = options;
  if (contextLabel) {
    return `Olá! Sou a Iris. Posso ajudar com dúvidas técnicas sobre ${contextLabel}, com base nos manuais cadastrados.`;
  }
  if (source === "route") {
    return "Olá! Sou a Iris. Abra a ficha de um equipamento para eu usar marca e modelo como contexto, ou faça uma pergunta geral.";
  }
  return "Olá! Sou a Iris, a IA que entende de ar. Pergunte sobre manuais e procedimentos de climatização.";
}
