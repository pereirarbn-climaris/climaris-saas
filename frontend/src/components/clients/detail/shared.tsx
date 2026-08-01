import styles from "../../../pages/clients/ClientDetail.module.css";
import { IconEmptyBox } from "./icons";

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

export function formatDateBR(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

export function formatDateTimeBR(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** Converte "YYYY-MM-DD" (input date) <-> exibição; usado nos formulários de Contratos. */
export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

type PillTone = "success" | "warning" | "danger" | "muted" | "primary";

const pillToneClass: Record<PillTone, string> = {
  success: styles.pillSuccess,
  warning: styles.pillWarning,
  danger: styles.pillDanger,
  muted: styles.pillMuted,
  primary: styles.pillPrimary,
};

export function StatusPill({ label, tone }: { label: string; tone: PillTone }) {
  return <span className={`${styles.pill} ${pillToneClass[tone]}`}>{label}</span>;
}

export function EmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className={styles.emptyState}>
      <IconEmptyBox />
      <p style={{ margin: 0 }}>{message}</p>
      {action}
    </div>
  );
}
