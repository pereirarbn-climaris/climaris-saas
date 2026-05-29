/** Endereço no mesmo formato da agenda (`ScheduleOut.client_address`). */
export type ClientAddressFields = {
  address_street?: string | null;
  address_number?: string | null;
  address_district?: string | null;
  address_city?: string | null;
};

export function formatClientScheduleAddress(client: ClientAddressFields): string | null {
  const parts = [client.address_street, client.address_number, client.address_district, client.address_city];
  const joined = parts
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
  return joined || null;
}

export function googleMapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}

export function wazeSearchUrl(address: string): string {
  return `https://waze.com/ul?q=${encodeURIComponent(address.trim())}`;
}

export function formatPhoneBr(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 10) {
    const ddd = digits.slice(0, 2);
    const n1 = digits.slice(2, 6);
    const n2 = digits.slice(6, 10);
    return n2 ? `(${ddd}) ${n1}-${n2}` : `(${ddd}) ${n1}`;
  }
  const ddd = digits.slice(0, 2);
  const n1 = digits.slice(2, 7);
  const n2 = digits.slice(7, 11);
  return n2 ? `(${ddd}) ${n1}-${n2}` : `(${ddd}) ${n1}`;
}

function phoneDigitsE164Br(raw: string | null | undefined): string | null {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length <= 11 && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }
  return digits;
}

export function telUrl(raw: string | null | undefined): string | null {
  const digits = phoneDigitsE164Br(raw);
  return digits ? `tel:+${digits}` : null;
}

export function whatsappUrl(raw: string | null | undefined): string | null {
  const digits = phoneDigitsE164Br(raw);
  return digits ? `https://wa.me/${digits}` : null;
}

export function phoneDigitsOnly(raw: string | null | undefined): string {
  return String(raw ?? "").replace(/\D/g, "");
}

export type ClientPhoneContactRow = {
  label: string;
  raw: string;
};

/** Uma linha se tel e WhatsApp forem o mesmo número; senão, até duas linhas. */
export function buildClientPhoneContactRows(
  phone: string | null | undefined,
  whatsapp: string | null | undefined,
): ClientPhoneContactRow[] {
  const phoneRaw = phone?.trim() || "";
  const whatsappRaw = whatsapp?.trim() || "";
  if (!phoneRaw && !whatsappRaw) return [];

  const phoneDigits = phoneDigitsOnly(phoneRaw);
  const whatsappDigits = phoneDigitsOnly(whatsappRaw);

  if (phoneRaw && whatsappRaw && phoneDigits && phoneDigits === whatsappDigits) {
    return [{ label: "Telefone", raw: whatsappRaw || phoneRaw }];
  }

  const rows: ClientPhoneContactRow[] = [];
  if (phoneRaw) rows.push({ label: "Tel", raw: phoneRaw });
  if (whatsappRaw) rows.push({ label: "WhatsApp", raw: whatsappRaw });
  return rows;
}
