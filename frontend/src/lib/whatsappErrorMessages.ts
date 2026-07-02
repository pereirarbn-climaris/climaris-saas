/** Mensagens amigáveis para falhas de envio WhatsApp (espelho de app/whatsapp_error_messages.py). */

function formatPhoneBrDigits(digits: string): string {
  const cleaned = digits.replace(/\D/g, "");
  if (cleaned.length === 13 && cleaned.startsWith("55")) {
    return `(${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
  }
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
  }
  return cleaned;
}

export function humanizeWhatsappSendError(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return "Não foi possível enviar pelo WhatsApp.";
  if (!text.includes("Evolution API") && !text.includes('"exists"')) return text;

  const existsFalse = /"exists"\s*:\s*false/i.test(text);
  const numberMatch =
    text.match(/"number"\s*:\s*"(\d+)"/) ??
    text.match(/\b(55\d{10,11})\b/) ??
    text.match(/para (\d{10,13})/i);
  const formattedNumber = numberMatch ? formatPhoneBrDigits(numberMatch[1]) : null;

  if (existsFalse) {
    return formattedNumber
      ? `O número ${formattedNumber} não está cadastrado no WhatsApp. Confira o cadastro do cliente e tente novamente.`
      : "O número do cliente não está cadastrado no WhatsApp. Confira o cadastro e tente novamente.";
  }

  if (text.includes("Sem conexão com Evolution API")) {
    return "Sem conexão com o servidor WhatsApp. Verifique se a instância está conectada em Integrações → WhatsApp.";
  }

  if (text.toLowerCase().includes("não configurad")) {
    return "WhatsApp não configurado. Conecte a instância em Integrações → WhatsApp.";
  }

  if (text.includes("HTTP 400") || text.includes("Bad Request")) {
    return formattedNumber
      ? `O WhatsApp recusou o envio para ${formattedNumber}. Verifique se o número está correto e ativo.`
      : "O WhatsApp recusou o envio. Verifique o número do cliente e a conexão da instância.";
  }

  if (/evolution api retornou http 5/i.test(text)) {
    return "O servidor WhatsApp está indisponível no momento. Tente novamente em alguns minutos.";
  }

  if (text.includes("Evolution API")) {
    return "Não foi possível enviar pelo WhatsApp. Verifique o número do cliente e se a instância está conectada.";
  }

  return text;
}
