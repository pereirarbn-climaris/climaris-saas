import { apiUrl } from "../lib/apiUrl";
import type { LgpdLegalSettings } from "../lib/lgpdContent";

export async function fetchPublicWebsiteLegalSettings(): Promise<LgpdLegalSettings> {
  try {
    const response = await fetch(apiUrl("/api/v1/public/website"), {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("settings unavailable");
    const data = (await response.json()) as LgpdLegalSettings;
    return data;
  } catch {
    return {
      legal_name: "Climaris",
      address_street: "Araraquara — atendimento comercial e suporte regional",
      address_city: "Araraquara",
      address_state: "SP",
      address_postal: "14800-000",
      contact_email: "contato@climaris.com.br",
    };
  }
}
