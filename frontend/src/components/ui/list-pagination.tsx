import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import styles from "./list-pagination.module.css";

export interface ListPaginationConfig {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

export interface ListPaginationBarProps extends ListPaginationConfig {
  /** Substantivo no singular, ex.: "cliente", "resultado" */
  itemLabel?: string;
  /** Plural explícito quando não basta acrescentar "s", ex.: "ordens de serviço" */
  itemLabelPlural?: string;
}

type PageToken = number | "ellipsis";

function pluralize(label: string, count: number, pluralOverride?: string): string {
  if (count === 1) return label;
  if (pluralOverride) return pluralOverride;
  if (label.endsWith("s")) return label;
  return `${label}s`;
}

function getVisiblePages(currentPage: number, totalPages: number): PageToken[] {
  if (totalPages <= 1) return totalPages === 1 ? [1] : [];
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const siblingCount = 1;
  const leftSibling = Math.max(currentPage - siblingCount, 2);
  const rightSibling = Math.min(currentPage + siblingCount, totalPages - 1);
  const showLeftEllipsis = leftSibling > 2;
  const showRightEllipsis = rightSibling < totalPages - 1;

  const pages: PageToken[] = [1];

  if (showLeftEllipsis) {
    pages.push("ellipsis");
  } else {
    for (let page = 2; page < leftSibling; page += 1) {
      pages.push(page);
    }
  }

  for (let page = leftSibling; page <= rightSibling; page += 1) {
    pages.push(page);
  }

  if (showRightEllipsis) {
    pages.push("ellipsis");
  } else {
    for (let page = rightSibling + 1; page < totalPages; page += 1) {
      pages.push(page);
    }
  }

  if (totalPages > 1) {
    pages.push(totalPages);
  }

  return pages;
}

export function ListPaginationBar({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  itemLabel = "resultado",
  itemLabelPlural,
}: ListPaginationBarProps) {
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);
  const label = pluralize(itemLabel, totalItems, itemLabelPlural);
  const visiblePages = getVisiblePages(currentPage, totalPages);
  const showControls = totalPages > 1;

  return (
    <div className={styles.bar}>
      <p className={styles.info}>
        Mostrando <strong>{startItem}</strong> a <strong>{endItem}</strong> de{" "}
        <strong>{totalItems}</strong> {label}
      </p>

      {showControls ? (
        <nav className={styles.nav} aria-label="Paginação">
          <div className={styles.navGroup}>
            <button
              type="button"
              className={styles.navBtn}
              disabled={currentPage <= 1}
              onClick={() => onPageChange(1)}
              aria-label="Primeira página"
              title="Primeira página"
            >
              <ChevronsLeft size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={styles.navBtn}
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              aria-label="Página anterior"
              title="Página anterior"
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
          </div>

          <div className={styles.navGroup} aria-label="Números de página">
            {visiblePages.map((page, index) =>
              page === "ellipsis" ? (
                <span key={`ellipsis-${index}`} className={styles.ellipsis} aria-hidden="true">
                  …
                </span>
              ) : (
                <button
                  key={page}
                  type="button"
                  className={`${styles.pageBtn} ${page === currentPage ? styles.pageBtnActive : ""}`}
                  onClick={() => onPageChange(page)}
                  aria-label={`Página ${page}`}
                  aria-current={page === currentPage ? "page" : undefined}
                >
                  {page}
                </button>
              ),
            )}
          </div>

          <div className={styles.navGroup}>
            <button
              type="button"
              className={styles.navBtn}
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              aria-label="Próxima página"
              title="Próxima página"
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={styles.navBtn}
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(totalPages)}
              aria-label="Última página"
              title="Última página"
            >
              <ChevronsRight size={16} aria-hidden="true" />
            </button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
