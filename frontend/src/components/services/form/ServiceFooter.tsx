import { Link } from "react-router-dom";
import clientStyles from "../../../pages/clients/ClientDetail.module.css";

type Props = {
  mode: "create" | "edit";
  formId: string;
  saving?: boolean;
  deleting?: boolean;
  disabled?: boolean;
  canDelete?: boolean;
  onDelete?: () => void;
};

export function ServiceFooter({
  mode,
  formId,
  saving,
  deleting,
  disabled,
  canDelete,
  onDelete,
}: Props) {
  return (
    <footer className={clientStyles.footerBar} role="toolbar" aria-label="Ações do serviço">
      <div className={clientStyles.footerBarInner}>
        <div className={clientStyles.footerBarLeft}>
          <Link className={`${clientStyles.btn} ${clientStyles.btnSecondary}`} to="/app/services">
            Cancelar
          </Link>
        </div>
        <div className={clientStyles.footerBarRight}>
          {mode === "edit" && canDelete ? (
            <button
              type="button"
              className={`${clientStyles.btn} ${clientStyles.btnDangerSolid}`}
              disabled={disabled || saving || deleting}
              onClick={onDelete}
            >
              {deleting ? "Excluindo…" : "Excluir serviço"}
            </button>
          ) : null}
          <button
            type="submit"
            form={formId}
            className={`${clientStyles.btn} ${clientStyles.btnPrimary}`}
            disabled={disabled || saving || deleting}
          >
            {saving
              ? "Salvando…"
              : mode === "create"
                ? "Salvar serviço"
                : "Salvar alterações"}
          </button>
        </div>
      </div>
    </footer>
  );
}
