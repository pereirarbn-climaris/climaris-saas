import { DeleteConfirmModal } from "../ui/delete-confirm-modal";
import { equipmentDisplayLabel } from "../../lib/equipmentConfirmDisplay";
import type { EquipmentItem } from "../v0-ui/clients/ClientEquipmentManager";
import { EquipmentConfirmSummary } from "./EquipmentConfirmSummary";

type Props = {
  equipment: EquipmentItem | null;
  open: boolean;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function DeleteEquipmentConfirmModal({ equipment, open, busy = false, onOpenChange, onConfirm }: Props) {
  const label = equipment ? equipmentDisplayLabel(equipment) : "";

  return (
    <DeleteConfirmModal
      open={open}
      onOpenChange={onOpenChange}
      title="Excluir equipamento"
      description={equipment ? `Excluir permanentemente "${label}"?` : ""}
      hint="Esta ação não pode ser desfeita. Só é possível quando não há OS, PMOC ou documentos vinculados."
      detail={equipment ? <EquipmentConfirmSummary equipment={equipment} /> : null}
      confirmLabel="Excluir permanentemente"
      busyLabel="Excluindo…"
      busy={busy}
      onConfirm={onConfirm}
    />
  );
}
