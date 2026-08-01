/**
 * Equipamento "a identificar" — mesmo conceito do backend
 * (`app/services/equipment_pending_identification.py`): quando o
 * atendente não sabe a marca/modelo do aparelho no momento do cadastro,
 * o equipamento é vinculado a um item de catálogo placeholder com essa
 * marca fixa. A identificação real é feita depois (tipicamente pelo
 * técnico, em campo).
 */
export const PENDING_IDENTIFICATION_BRAND = "Marca não identificada";

export function isPendingIdentificationBrand(brand: string | null | undefined): boolean {
  return (brand ?? "").trim() === PENDING_IDENTIFICATION_BRAND;
}
