import { useEffect, useState } from "react";
import { listEquipmentCatalog, type EquipmentCatalogOut } from "../../api/equipmentCatalog";
import type { ServiceOrderGarantiaFields } from "../../lib/serviceOrderGarantia";
import styles from "./ServiceOrderGarantiaForm.module.css";

type Props = {
  garantia: ServiceOrderGarantiaFields;
  canEdit: boolean;
  onGarantiaChange: (patch: Partial<ServiceOrderGarantiaFields>) => void;
};

function parseBtu(capacity: string | null | undefined): string {
  if (!capacity) return "";
  const match = capacity.replace(/\./g, "").match(/(\d{3,6})/);
  if (!match) return capacity;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? `${n} BTU` : capacity;
}

function applyCatalogItem(
  item: EquipmentCatalogOut,
  garantia: ServiceOrderGarantiaFields,
): Partial<ServiceOrderGarantiaFields> {
  const marcaModelo = `${item.brand} ${item.model}`.trim();
  return {
    catalogId: item.id,
    catalogLabel: marcaModelo,
    catalogCategoryName: item.category?.name ?? null,
    marcaModelo: marcaModelo || garantia.marcaModelo,
    capacidade: parseBtu(item.capacity) || garantia.capacidade,
  };
}

export function ServiceOrderGarantiaCatalogSearch({ garantia, canEdit, onGarantiaChange }: Props) {
  const [brandQuery, setBrandQuery] = useState(garantia.marcaModelo.split(" ")[0] ?? "");
  const [modelQuery, setModelQuery] = useState("");
  const [freeQuery, setFreeQuery] = useState("");
  const [results, setResults] = useState<EquipmentCatalogOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  useEffect(() => {
    if (!canEdit) return;
    const brand = brandQuery.trim();
    const model = modelQuery.trim();
    const q = freeQuery.trim();
    if (!brand && !model && !q) {
      setResults([]);
      setSearchErr(null);
      return;
    }

    const timer = window.setTimeout(() => {
      setLoading(true);
      setSearchErr(null);
      void listEquipmentCatalog({
        brand: brand || undefined,
        model: model || undefined,
        q: !brand && !model ? q : undefined,
        limit: 12,
      })
        .then((page) => setResults(page.items))
        .catch((e) => {
          setResults([]);
          setSearchErr(e instanceof Error ? e.message : "Falha ao buscar no catálogo.");
        })
        .finally(() => setLoading(false));
    }, 320);

    return () => window.clearTimeout(timer);
  }, [brandQuery, modelQuery, freeQuery, canEdit]);

  return (
    <div className={styles.catalogSearch}>
      <header className={styles.catalogSearchHead}>
        <h4 className={styles.catalogSearchTitle}>Buscar no catálogo</h4>
        <p className={styles.catalogSearchLead}>
          Digite marca, modelo ou termo livre para localizar o aparelho no banco de dados da empresa.
        </p>
      </header>

      <div className={styles.catalogSearchGrid}>
        <label className={styles.field}>
          <span className={styles.label}>Marca</span>
          <input
            className={styles.input}
            disabled={!canEdit}
            value={brandQuery}
            placeholder="Ex.: Carrier, Samsung"
            onChange={(e) => setBrandQuery(e.target.value)}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Modelo</span>
          <input
            className={styles.input}
            disabled={!canEdit}
            value={modelQuery}
            placeholder="Ex.: CBJ09CBBNA"
            onChange={(e) => setModelQuery(e.target.value)}
          />
        </label>
        <label className={`${styles.field} ${styles.fieldFull}`}>
          <span className={styles.label}>Busca livre</span>
          <input
            className={styles.input}
            disabled={!canEdit}
            value={freeQuery}
            placeholder="Marca, modelo, capacidade…"
            onChange={(e) => setFreeQuery(e.target.value)}
          />
        </label>
      </div>

      {loading ? <p className={styles.catalogSearchStatus}>Buscando no catálogo…</p> : null}
      {searchErr ? <p className={styles.alertErr}>{searchErr}</p> : null}

      {results.length > 0 ? (
        <ul className={styles.catalogSearchResults}>
          {results.map((item) => {
            const label = `${item.brand} ${item.model}`.trim();
            const selected = garantia.catalogId === item.id;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`${styles.catalogSearchItem} ${selected ? styles.catalogSearchItemSelected : ""}`}
                  disabled={!canEdit}
                  onClick={() => onGarantiaChange(applyCatalogItem(item, garantia))}
                >
                  <span className={styles.catalogSearchItemTitle}>{label}</span>
                  <span className={styles.catalogSearchItemMeta}>
                    {item.category?.name ?? "Categoria"}
                    {item.capacity ? ` · ${item.capacity}` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : brandQuery.trim() || modelQuery.trim() || freeQuery.trim() ? (
        !loading && !searchErr ? (
          <p className={styles.catalogSearchStatus}>Nenhum modelo encontrado. Tente outro termo ou use a foto com IA.</p>
        ) : null
      ) : null}
    </div>
  );
}
