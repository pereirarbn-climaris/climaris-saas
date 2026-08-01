import { Pencil, Trash2 } from "lucide-react";
import type { ServiceOut } from "../../api/services";
import { ListRowActions, ListRowIconButton } from "../ui/ListRowIconButton";
import { ServiceCategoryBadgeGroup } from "./ServiceCategoryBadge";
import { ServiceTypeBadge } from "./ServiceTypeBadge";
import { ServiceStatusBadge } from "./ServiceStatusBadge";
import { ServiceRowIcon } from "./serviceIcons";
import {
  formatServiceCurrency,
  inferServiceType,
  inferServiceTypeLabel,
  parseServiceCategories,
} from "./services.utils";
import styles from "./ServicesListTable.module.css";

type Props = {
  service: ServiceOut;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (service: ServiceOut) => void;
  onDelete: (service: ServiceOut) => void;
};

export function ServiceTableRow({ service, canEdit, canDelete, onEdit, onDelete }: Props) {
  const categories = parseServiceCategories(service);
  const typeKey = inferServiceType(service);
  const typeLabel = inferServiceTypeLabel(service);

  return (
    <tr>
      <td className={styles.colService}>
        <div className={styles.serviceCell}>
          <ServiceRowIcon service={service} className={styles.serviceIcon} />
          <div className={styles.serviceInfo}>
            <span className={styles.serviceName}>{service.name}</span>
            <span className={styles.serviceDesc}>{service.description || "Sem descrição"}</span>
          </div>
        </div>
      </td>
      <td className={styles.cellCategory}>
        <ServiceCategoryBadgeGroup categories={categories} />
      </td>
      <td className={styles.cellType}>
        <ServiceTypeBadge typeKey={typeKey} label={typeLabel} />
      </td>
      <td className={styles.cellValue}>
        <span className={styles.priceCell}>{formatServiceCurrency(Number(service.price || 0))}</span>
      </td>
      <td className={styles.cellStatus}>
        <ServiceStatusBadge active={service.is_active} />
      </td>
      <td className={styles.colActions}>
        <ListRowActions className={styles.actionsCell}>
          {canEdit ? (
            <ListRowIconButton
              variant="edit"
              title="Editar serviço"
              aria-label={`Editar ${service.name}`}
              onClick={() => onEdit(service)}
            >
              <Pencil aria-hidden />
            </ListRowIconButton>
          ) : null}
          {canDelete ? (
            <ListRowIconButton
              variant="delete"
              title="Excluir serviço"
              aria-label={`Excluir ${service.name}`}
              onClick={() => onDelete(service)}
            >
              <Trash2 aria-hidden />
            </ListRowIconButton>
          ) : null}
        </ListRowActions>
      </td>
    </tr>
  );
}
