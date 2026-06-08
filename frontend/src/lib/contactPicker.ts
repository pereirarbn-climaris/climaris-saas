import { digitsOnly, formatPhoneBrInput } from "./brMask";

type ContactPickerSelect = (
  properties: Array<"tel" | "name" | "email">,
  options?: { multiple?: boolean },
) => Promise<Array<{ tel?: string[]; name?: string[]; email?: string[] }>>;

type NavigatorWithContacts = Navigator & {
  contacts?: { select: ContactPickerSelect };
};

/** Navegador suporta Contact Picker API (Chrome Android, alguns mobile browsers). */
export function isContactPickerAvailable(): boolean {
  if (typeof navigator === "undefined") return false;
  const contacts = (navigator as NavigatorWithContacts).contacts;
  return typeof contacts?.select === "function";
}

/** Extrai o primeiro telefone retornado pela agenda e formata para BR. */
export function phoneFromContactPickerResult(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const digits = digitsOnly(raw);
  if (!digits) return null;
  const local =
    digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  const formatted = formatPhoneBrInput(local);
  return formatted || null;
}

export type PickContactPhoneResult =
  | { ok: true; phone: string; contactName?: string }
  | { ok: false; reason: "unsupported" | "cancelled" | "empty" | "error" };

/** Abre a agenda do celular para escolher um número de telefone. */
export async function pickContactPhone(): Promise<PickContactPhoneResult> {
  const contacts = (navigator as NavigatorWithContacts).contacts;
  if (!contacts?.select) {
    return { ok: false, reason: "unsupported" };
  }
  try {
    const picked = await contacts.select(["tel", "name"], { multiple: false });
    if (!picked?.length) {
      return { ok: false, reason: "cancelled" };
    }
    const entry = picked[0];
    const rawTel = entry.tel?.find((t) => t?.trim()) ?? entry.tel?.[0];
    const phone = phoneFromContactPickerResult(rawTel);
    if (!phone) {
      return { ok: false, reason: "empty" };
    }
    const contactName = entry.name?.find((n) => n?.trim()) ?? entry.name?.[0];
    return { ok: true, phone, contactName: contactName?.trim() || undefined };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, reason: "cancelled" };
    }
    return { ok: false, reason: "error" };
  }
}
