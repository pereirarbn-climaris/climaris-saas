import type { ServiceOut } from "../../api/services";
import { ServiceTableRow } from "./ServiceTableRow";
import productStyles from "../products/ProductsListTable.module.css";
import styles from "./ServicesListTable.module.css";

type Props = {
  services: ServiceOut[];
  totalCount: number;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (service: ServiceOut) => void;
  onDelete: (service: ServiceOut) => void;
};

export function ServicesTable({ services, totalCount, canEdit, canDelete, onEdit, onDelete }: Props) {
  return (
    <section className={productStyles.container}>
      <header className={productStyles.header}>
        <div className={productStyles.foundCount}>
          {totalCount} serviço{totalCount === 1 ? "" : "s"} encontrado{totalCount === 1 ? "" : "s"}
        </div>
      </header>
      <div className={`${styles.tableWrap} ${styles.desktopOnly}`}>
        <table className={styles.table}>
          <colgroup>
            <col className={styles.colService} />
            <col className={styles.colCategory} />
            <col className={styles.colType} />
            <col className={styles.colValue} />
            <col className={styles.colStatus} />
            <col className={styles.colActions} />
          </colgroup>
          <thead>
            <tr>
              <th>Serviço</th>
              <th>Categoria</th>
              <th>Tipo</th>
              <th>Valor</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <ServiceTableRow
                key={service.id}
                service={service}
                canEdit={canEdit}
                canDelete={canDelete}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
