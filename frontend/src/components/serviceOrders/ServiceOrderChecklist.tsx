import { useCallback, useState } from "react";
import { createPmocOccurrence } from "../../api/pmoc";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTextarea,
  AlertDialogTitle,
} from "../ui/alert-dialog";

export type ChecklistItemStatus = "sim" | "nao" | "na";

export type ServiceOrderChecklistItem = {
  id: string;
  descricao: string;
  status: ChecklistItemStatus;
  /** Descrição da falha quando reprovado */
  observacao?: string;
};

type Props = {
  items: ServiceOrderChecklistItem[];
  onChange: (items: ServiceOrderChecklistItem[]) => void;
  pmocPlanId?: string;
  orderId?: number;
  equipmentIds?: string[];
  error?: string;
  disabled?: boolean;
};

function parseEquipmentIdFromChecklistId(id: string): number | null {
  const match = id.match(/^pmoc_\d+_(\d+)_\d+$/);
  return match ? Number(match[1]) : null;
}

function ThreeWaySwitch({
  value,
  onChange,
  disabled,
}: {
  value: ChecklistItemStatus;
  onChange: (value: ChecklistItemStatus) => void;
  disabled?: boolean;
}) {
  const options: { value: ChecklistItemStatus; label: string }[] = [
    { value: "sim", label: "Sim" },
    { value: "nao", label: "Não" },
    { value: "na", label: "N/A" },
  ];

  return (
    <div
      style={{
        display: "flex",
        gap: "2px",
        padding: "2px",
        backgroundColor: "var(--color-surface)",
        borderRadius: "var(--btn-radius)",
        border: "1px solid var(--color-border)",
      }}
    >
      {options.map((opt) => {
        const isActive = value === opt.value;
        let bgColor = "transparent";
        let textColor = "var(--color-text-muted)";

        if (isActive) {
          if (opt.value === "sim") {
            bgColor = "var(--color-success)";
            textColor = "white";
          } else if (opt.value === "nao") {
            bgColor = "var(--color-error)";
            textColor = "white";
          } else {
            bgColor = "var(--color-text-subtle)";
            textColor = "white";
          }
        }

        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => !disabled && onChange(opt.value)}
            disabled={disabled}
            style={{
              padding: "0.375rem 0.75rem",
              fontSize: "var(--font-size-xs)",
              fontWeight: "var(--font-weight-medium)",
              color: textColor,
              backgroundColor: bgColor,
              border: "none",
              borderRadius: "calc(var(--btn-radius) - 2px)",
              cursor: disabled ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function ServiceOrderChecklist({
  items,
  onChange,
  pmocPlanId,
  orderId,
  equipmentIds = [],
  error,
  disabled = false,
}: Props) {
  const [failureDialogOpen, setFailureDialogOpen] = useState(false);
  const [failureDescription, setFailureDescription] = useState("");
  const [failureItem, setFailureItem] = useState<ServiceOrderChecklistItem | null>(null);
  const [incidentSaving, setIncidentSaving] = useState(false);

  const updateItem = useCallback(
    (updated: ServiceOrderChecklistItem) => {
      onChange(items.map((item) => (item.id === updated.id ? updated : item)));
    },
    [items, onChange],
  );

  const openFailureDialog = useCallback((item: ServiceOrderChecklistItem) => {
    setFailureItem(item);
    setFailureDescription(item.observacao ?? "");
    setFailureDialogOpen(true);
  }, []);

  const confirmFailureDialog = useCallback(async () => {
    const description = failureDescription.trim();
    if (!failureItem || !description) return;

    const updatedItem: ServiceOrderChecklistItem = {
      ...failureItem,
      status: "nao",
      observacao: description,
    };
    updateItem(updatedItem);
    setFailureDialogOpen(false);
    setFailureItem(null);
    setFailureDescription("");

    const pmocId = pmocPlanId ? Number(pmocPlanId) : NaN;
    if (!Number.isFinite(pmocId) || pmocId < 1) return;

    setIncidentSaving(true);
    try {
      const equipmentFromChecklist = parseEquipmentIdFromChecklistId(updatedItem.id);
      const fallbackEquipment = equipmentIds[0] ? Number(equipmentIds[0]) : null;
      await createPmocOccurrence(pmocId, {
        equipment_id: equipmentFromChecklist ?? fallbackEquipment,
        service_order_id: orderId ?? null,
        checklist_item_id: updatedItem.id,
        checklist_item_descricao: updatedItem.descricao,
        failure_description: description,
      });
    } catch (e) {
      console.error("[ServiceOrderChecklist] falha ao registrar incidente", e);
      window.alert("Item reprovado, mas não foi possível registrar o incidente no PMOC.");
    } finally {
      setIncidentSaving(false);
    }
  }, [failureDescription, failureItem, equipmentIds, orderId, pmocPlanId, updateItem]);

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
              padding: "var(--space-3) var(--space-4)",
              backgroundColor: "var(--color-surface-elevated)",
              borderRadius: "var(--input-radius)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "var(--space-4)",
              }}
            >
              <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)", flex: 1 }}>
                {item.descricao}
              </span>
              <ThreeWaySwitch
                value={item.status}
                disabled={disabled}
                onChange={(status) => {
                  if (status === "nao") {
                    openFailureDialog(item);
                    return;
                  }
                  updateItem({ ...item, status });
                }}
              />
            </div>
            {item.status === "nao" && item.observacao ? (
              <p style={{ margin: 0, fontSize: "var(--font-size-xs)", color: "var(--color-error)" }}>
                Descrição da falha: {item.observacao}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      {error ? (
        <p style={{ marginTop: "var(--space-2)", fontSize: "var(--font-size-sm)", color: "var(--color-error)" }}>
          {error}
        </p>
      ) : null}

      <AlertDialog
        open={failureDialogOpen}
        onOpenChange={(open) => {
          setFailureDialogOpen(open);
          if (!open) {
            setFailureItem(null);
            setFailureDescription("");
          }
        }}
      >
        <AlertDialogContent wide labelledBy="checklist-failure-title" describedBy="checklist-failure-desc">
          <AlertDialogHeader>
            <AlertDialogTitle id="checklist-failure-title">Descrição da falha (obrigatória)</AlertDialogTitle>
            <AlertDialogDescription id="checklist-failure-desc">
              {failureItem
                ? `Item reprovado: "${failureItem.descricao}". Um incidente será aberto no PMOC vinculado.`
                : "Descreva a falha identificada no checklist."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogBody>
            <AlertDialogTextarea
              id="checklist-failure-description"
              label="Descrição da falha"
              value={failureDescription}
              onChange={setFailureDescription}
              placeholder="Descreva o defeito, sintoma ou não conformidade…"
              disabled={incidentSaving}
            />
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setFailureDialogOpen(false);
                setFailureItem(null);
                setFailureDescription("");
              }}
              disabled={incidentSaving}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={incidentSaving || !failureDescription.trim()}
              onClick={() => void confirmFailureDialog()}
            >
              {incidentSaving ? "Registrando…" : "Confirmar reprovação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
