import { Link } from "react-router-dom";
import type { ServiceOrderMissingRequirement } from "../../types/serviceOrders";
import styles from "./ComplianceBlockedAlert.module.css";

export type ComplianceBlockedAlertProps = {
  missingRequirements: ServiceOrderMissingRequirement[];
  serviceOrderId: number;
  digitalWorkOrderId?: string | null;
  /** Rota base para o fluxo do técnico em campo */
  technicianMode?: boolean;
};

function requirementLabel(item: ServiceOrderMissingRequirement): string {
  const message = (item.message || "").trim();
  const colon = message.indexOf(":");
  if (colon >= 0) {
    const tail = message.slice(colon + 1).trim();
    if (tail) return tail;
  }
  return message || item.code;
}

function buildDigitalOsPath(serviceOrderId: number, technicianMode: boolean): string {
  return technicianMode
    ? `/app/tecnico/os/${serviceOrderId}/digital-os`
    : `/app/service-orders/${serviceOrderId}/digital-os`;
}

export function ComplianceBlockedAlert({
  missingRequirements,
  serviceOrderId,
  digitalWorkOrderId,
  technicianMode = false,
}: ComplianceBlockedAlertProps) {
  if (missingRequirements.length === 0) return null;

  const labels = missingRequirements.map(requirementLabel).filter(Boolean);
  const summary =
    labels.length > 0 ? `Faltam: ${labels.join(", ")}` : "Requisitos de compliance incompletos.";

  return (
    <div className={styles.wrap} role="alert" aria-live="polite">
      <p className={styles.title}>Não é possível concluir a OS</p>
      <p className={styles.summary}>{summary}</p>
      <ul className={styles.list}>
        {missingRequirements.map((item, index) => (
          <li key={`${item.code || "req"}-${index}`}>{item.message}</li>
        ))}
      </ul>

      <div className={styles.actions}>
        <Link
          className={styles.primaryBtn}
          to={buildDigitalOsPath(serviceOrderId, technicianMode)}
          state={digitalWorkOrderId ? { digitalWorkOrderId } : undefined}
        >
          Ir para OS Digital
        </Link>
      </div>
    </div>
  );
}

/** @deprecated Use ComplianceBlockedAlert */
export const ComplianceBlockedNotice = ComplianceBlockedAlert;
