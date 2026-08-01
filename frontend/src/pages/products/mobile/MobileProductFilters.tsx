import styles from "./MobileProductFilters.module.css";

type QuickFilter = "all" | "active" | "low" | "out";
type SortFilter = "name_asc" | "highest_price" | "lower_stock" | "latest";

type Props = {
  input: string;
  onInputChange: (value: string) => void;
  onOpenFilters: () => void;
  quickFilter: QuickFilter;
  onQuickFilterChange: (value: QuickFilter) => void;
  sortFilter: SortFilter;
  onSortFilterChange: (value: SortFilter) => void;
};

export function MobileProductFilters({
  input,
  onInputChange,
  onOpenFilters,
  quickFilter,
  onQuickFilterChange,
  sortFilter,
  onSortFilterChange,
}: Props) {
  return (
    <section className={styles.card}>
      <div className={styles.searchRow}>
        <label className={styles.searchField} htmlFor="products-search-mobile">
          <span className={styles.searchIcon} aria-hidden>
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" />
              <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <input
            id="products-search-mobile"
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder="Buscar por nome, SKU, código de barras..."
            autoComplete="off"
          />
        </label>
        <button type="button" className={styles.filtersButton} onClick={onOpenFilters}>
          <span aria-hidden>
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M3 5h18M7 12h10M10 19h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          Filtros
        </button>
      </div>

      <div className={styles.quickFilters}>
        <p>Filtros rápidos</p>
        {([
          ["all", "Todos"],
          ["active", "Ativos"],
          ["low", "Baixo estoque"],
          ["out", "Sem estoque"],
        ] as Array<[QuickFilter, string]>).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`${styles.chip} ${quickFilter === value ? styles.chipActive : ""}`}
            onClick={() => onQuickFilterChange(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <label className={styles.sortField}>
        Ordenar por
        <select value={sortFilter} onChange={(event) => onSortFilterChange(event.target.value as SortFilter)}>
          <option value="name_asc">Nome (A - Z)</option>
          <option value="highest_price">Maior preço</option>
          <option value="lower_stock">Menor estoque</option>
          <option value="latest">Últimos cadastrados</option>
        </select>
      </label>
    </section>
  );
}
