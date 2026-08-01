import clientStyles from "../../../pages/clients/ClientDetail.module.css";
import styles from "./service-form.module.css";

export function ServiceFormSkeleton() {
  return (
    <div className={clientStyles.page} aria-busy="true" aria-label="Carregando formulário">
      <div className={styles.skeletonCard} style={{ height: 96 }} />
      <div className={styles.skeletonCard} />
    </div>
  );
}
