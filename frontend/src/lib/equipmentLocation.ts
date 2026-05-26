/** Rótulo legível do equipamento com local e referência detalhada. */
export function formatEquipmentLocationLabel(params: {
  identificacao?: string | null;
  localInstalacao?: string | null;
  installationReference?: string | null;
  equipmentId?: number;
}): string {
  const base =
    params.identificacao?.trim() ||
    (params.equipmentId != null ? `Equipamento #${params.equipmentId}` : "Equipamento");
  const parts: string[] = [];
  const local = params.localInstalacao?.trim();
  if (local && local.toLowerCase() !== base.toLowerCase()) {
    parts.push(local);
  }
  const reference = params.installationReference?.trim();
  if (reference) {
    parts.push(reference);
  }
  return parts.length > 0 ? `${base} (${parts.join(" · ")})` : base;
}

export type EquipmentLocationRow = {
  equipment_id: number;
  identificacao?: string | null;
  local_instalacao?: string | null;
  installation_reference?: string | null;
};

export function equipmentLocationLabelFromRow(
  equipmentId: number,
  rows: EquipmentLocationRow[],
): string {
  const row = rows.find((r) => r.equipment_id === equipmentId);
  return formatEquipmentLocationLabel({
    identificacao: row?.identificacao,
    localInstalacao: row?.local_instalacao,
    installationReference: row?.installation_reference,
    equipmentId,
  });
}
