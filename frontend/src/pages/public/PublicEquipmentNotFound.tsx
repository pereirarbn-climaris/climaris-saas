import { Link } from "react-router-dom";
import styles from "./PublicEquipmentPage.module.css";

type Props = {
  message: string;
  codeId?: string;
};

export function PublicEquipmentNotFound({ message, codeId }: Props) {
  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.notFoundCard}>
          <span className={styles.notFoundIcon} aria-hidden>
            QR
          </span>
          <h1 className={styles.notFoundTitle}>Etiqueta não encontrada ou inválida</h1>
          <p className={styles.notFoundText}>{message}</p>
          {codeId ? (
            <p className={styles.notFoundCode}>
              Código: <code>{codeId}</code>
            </p>
          ) : null}
          <p className={styles.notFoundHint}>
            Verifique se a etiqueta foi impressa corretamente ou se o equipamento já foi cadastrado no sistema.
          </p>
          <Link to="/login" className={styles.link}>
            Entrar no Climaris
          </Link>
        </div>
      </div>
    </div>
  );
}
