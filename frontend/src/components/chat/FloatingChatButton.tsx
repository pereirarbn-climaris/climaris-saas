import { IrisAvatar } from "./IrisAvatar";
import styles from "./FloatingChatButton.module.css";

type Props = {
  onClick: () => void;
  ariaExpanded?: boolean;
};

export function FloatingChatButton({ onClick, ariaExpanded = false }: Props) {
  return (
    <button
      type="button"
      className={styles.fab}
      onClick={onClick}
      aria-label="Abrir Iris"
      aria-expanded={ariaExpanded}
      aria-haspopup="dialog"
    >
      <IrisAvatar size="lg" className={styles.avatar} />
      <span className={styles.pulse} aria-hidden />
    </button>
  );
}
