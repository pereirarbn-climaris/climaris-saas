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

export function DeactivateEquipmentConfirmModal({
  equipment,
  open,
  busy = false,
  onOpenChange,
  onConfirm,
}: Props) {
  const label = equipment ? equipmentDisplayLabel(equipment) : "";

  return (
    <DeleteConfirmModal
      open={open}
      onOpenChange={onOpenChange}
      title="Desativar equipamento"
      description={equipment ? `Desativar "${label}"?` : ""}
      hint="O aparelho deixa de aparecer em novos cadastros e fluxos ativos, mas o histórico permanece no sistema."
      detail={equipment ? <EquipmentConfirmSummary equipment={equipment} /> : null}
      confirmLabel="Desativar"
      busyLabel="Desativando…"
      confirmVariant="default"
      busy={busy}
      onConfirm={onConfirm}
    />
  );
}
