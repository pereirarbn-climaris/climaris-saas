import type { ClientOut } from "../api/clients";
import type { ClientComboboxItem } from "../components/ui/client-combobox";
import { formatPhoneBrInput, formatTaxDocumentInput } from "./brMask";

export function formatClientAddressLine(c: {
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_district?: string | null;
  address_city?: string | null;
  address_state?: string | null;
}): string | undefined {
  const parts = [
    c.address_street,
    c.address_number,
    c.address_complement,
    c.address_district,
    c.address_city,
    c.address_state,
  ]
    .map((p) => (p ?? "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

/** WhatsApp preferencial; se houver dois números distintos, exibe ambos. */
export function formatClientComboboxContato(c: {
  whatsapp?: string | null;
  phone?: string | null;
}): string | undefined {
  const wa = (c.whatsapp ?? "").trim();
  const ph = (c.phone ?? "").trim();
  if (!wa && !ph) return undefined;

  const waDigits = wa.replace(/\D/g, "");
  const phDigits = ph.replace(/\D/g, "");
  if (wa && ph && waDigits && phDigits && waDigits !== phDigits) {
    return [
      wa ? `WhatsApp: ${formatPhoneBrInput(wa)}` : "",
      ph ? `Tel.: ${formatPhoneBrInput(ph)}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return formatPhoneBrInput(wa || ph) || undefined;
}

export function clientOutToComboboxItem(c: ClientOut): ClientComboboxItem {
  const type = c.tax_id_kind === "cpf" ? "cpf" : "cnpj";
  const doc = (c.document ?? "").trim();
  const tradeName = (c.trade_name ?? "").trim();

  return {
    id: String(c.id),
    nome: c.name,
    endereco: formatClientAddressLine(c),
    contato: formatClientComboboxContato(c),
    nomeFantasia: tradeName || undefined,
    documento: doc ? formatTaxDocumentInput(doc, type) : undefined,
  };
}

export function clientsOutToComboboxItems(clients: ClientOut[]): ClientComboboxItem[] {
  return clients.map(clientOutToComboboxItem);
}
