import { Link } from "react-router-dom";
import listStyles from "../v0-ui/clients/clients-list.module.css";
import tableStyles from "../../pages/listTableCommon.module.css";

function ImportIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export type CatalogListHeaderActionsProps = {
  showImport?: boolean;
  importing?: boolean;
  onImport?: () => void;
  importTitle?: string;
  showNew?: boolean;
  newHref: string;
  newLabel: string;
};

export function CatalogListHeaderActions({
  showImport = false,
  importing = false,
  onImport,
  importTitle = "Importar planilha",
  showNew = true,
  newHref,
  newLabel,
}: CatalogListHeaderActionsProps) {
  if (!showImport && !showNew) return null;

  return (
    <div className={listStyles.pageHeaderActions}>
      {showImport ? (
        <button
          type="button"
          className={tableStyles.listToolbarBtnGhost}
          onClick={onImport}
          disabled={importing}
          title={importTitle}
          aria-label={importTitle}
        >
          <span className={tableStyles.listToolbarBtnIcon} aria-hidden>
            <ImportIcon />
          </span>
          Importar
        </button>
      ) : null}
      {showNew ? (
        <Link className={tableStyles.listToolbarBtnPrimary} to={newHref}>
          <span className={tableStyles.listToolbarBtnIcon} aria-hidden>
            <PlusIcon />
          </span>
          {newLabel}
        </Link>
      ) : null}
    </div>
  );
}
