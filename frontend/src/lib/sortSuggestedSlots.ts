import type { SuggestedSlotOut } from "../api/serviceOrders";

/** Ordena sugestões do dia/hora mais cedo para o mais tarde. */
export function sortSuggestedSlotsChronologically(slots: SuggestedSlotOut[]): SuggestedSlotOut[] {
  return [...slots].sort((a, b) => {
    const ta = new Date(a.starts_at).getTime();
    const tb = new Date(b.starts_at).getTime();
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return ta - tb;
  });
}
