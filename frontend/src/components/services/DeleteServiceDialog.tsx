import { DeleteConfirmModal } from "../ui/delete-confirm-modal";

type Mode = "delete" | "linked";

type Props = {
  open: boolean;
  mode: Mode;
  serviceName: string;
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
  onConfirmInactivate: () => void;
};

export function DeleteServiceDialog({
  open,
  mode,
  serviceName,
  busy,
  onOpenChange,
  onConfirmDelete,
  onConfirmInactivate,
}: Props) {
  if (mode === "linked") {
    return (
      <DeleteConfirmModal
        open={open}
        onOpenChange={onOpenChange}
        title="Serviço com vínculos"
        description={`O serviço "${serviceName}" possui vínculos com ordens de serviço, PMOCs, contratos ou históricos e não pode ser excluído.`}
        hint="Você pode inativá-lo para impedir novos usos sem perder o histórico."
        confirmLabel="Inativar serviço"
        busyLabel="Inativando…"
        confirmVariant="default"
        busy={busy}
        onConfirm={onConfirmInactivate}
      />
    );
  }

  return (
    <DeleteConfirmModal
      open={open}
      onOpenChange={onOpenChange}
      title="Excluir serviço?"
      description="Tem certeza de que deseja excluir este serviço?"
      hint="Esta ação não poderá ser desfeita."
      detail={<strong>{serviceName}</strong>}
      confirmLabel="Excluir serviço"
      busyLabel="Excluindo…"
      busy={busy}
      onConfirm={onConfirmDelete}
    />
  );
}
