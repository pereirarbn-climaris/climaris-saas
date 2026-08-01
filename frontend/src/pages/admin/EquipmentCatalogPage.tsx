import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  createEquipmentCatalog,
  createEquipmentCatalogWithExistingManual,
  createEquipmentCategory,
  listEquipmentCatalog,
  listEquipmentCategories,
  listEquipmentManuals,
  updateEquipmentCatalog,
} from "../../api/equipmentCatalog";
import { ingestAllKnowledgeManuals } from "../../api/knowledgeBase";
import type { EquipmentCategoryCreatePayload } from "../../api/equipmentCatalog";
import {
  AdminEquipmentCatalogView,
  type CatalogEquipment,
  type CatalogMetrics,
  type CategoryOption,
  type ManualOption,
  type NewCatalogEquipmentData,
} from "../../components/v0-ui/admin";
import {
  buildCatalogMetrics,
  mapApiCategoryToOption,
  mapCatalogItemToView,
  inspectCatalogFormData,
  newCatalogDataToFormData,
  shouldUseExistingManualEndpoint,
} from "../../lib/equipmentCatalogAdminAdapter";
import styles from "./EquipmentCatalogPage.module.css";
import { toast } from "../../lib/toast";

type CatalogFilters = {
  category: string;
  brand: string;
  search: string;
};

const EMPTY_METRICS: CatalogMetrics = {
  totalModelos: 0,
  totalArCondicionado: 0,
  totalGeladeiraBebedouro: 0,
  totalComManual: 0,
};

export function EquipmentCatalogPage() {
  const [equipments, setEquipments] = useState<CatalogEquipment[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [manuals, setManuals] = useState<ManualOption[]>([]);
  const [metrics, setMetrics] = useState<CatalogMetrics>(EMPTY_METRICS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [ingestingAll, setIngestingAll] = useState(false);
  const filtersRef = useRef<CatalogFilters>({ category: "", brand: "", search: "" });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadCategories = useCallback(async () => {
    setCategoriesLoading(true);
    try {
      const response = await listEquipmentCategories();
      setCategories(response.items.map(mapApiCategoryToOption));
    } catch {
      setCategories([]);
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  const loadManuals = useCallback(async () => {
    try {
      const response = await listEquipmentManuals();
      setManuals(response.items.map((m) => ({ id: m.id, title: m.title })));
    } catch {
      setManuals([]);
    }
  }, []);

  const loadCatalog = useCallback(async (filters?: CatalogFilters) => {
    const f = filters ?? filtersRef.current;
    setLoading(true);
    setError("");
    try {
      const response = await listEquipmentCatalog({
        skip: 0,
        limit: 200,
        category_id: f.category || undefined,
        brand: f.brand || undefined,
        q: f.search || undefined,
      });
      const items = response.items.map(mapCatalogItemToView);
      setEquipments(items);
      setMetrics(buildCatalogMetrics(items, response.total));
    } catch (e) {
      setEquipments([]);
      setMetrics(EMPTY_METRICS);
      setError(e instanceof Error ? e.message : "Não foi possível carregar o catálogo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
    void loadCatalog();
    void loadManuals();
  }, [loadCatalog, loadCategories, loadManuals]);

  const handleFiltersChange = useCallback(
    (filters: CatalogFilters) => {
      const prev = filtersRef.current;
      filtersRef.current = filters;
      if (debounceRef.current) clearTimeout(debounceRef.current);

      const categoryOrBrandChanged =
        filters.category !== prev.category || filters.brand !== prev.brand;
      if (categoryOrBrandChanged) {
        void loadCatalog(filters);
        return;
      }

      debounceRef.current = setTimeout(() => {
        void loadCatalog(filters);
      }, 350);
    },
    [loadCatalog],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSave = useCallback(
    async (data: NewCatalogEquipmentData, id?: string) => {
      setSaving(true);
      setError("");
      setSuccess("");
      try {
        const form = newCatalogDataToFormData(data);
        inspectCatalogFormData(form);
        if (id) {
          await updateEquipmentCatalog(id, form);
          setSuccess("Modelo atualizado com sucesso.");
        } else if (shouldUseExistingManualEndpoint(data)) {
          await createEquipmentCatalogWithExistingManual(form);
          setSuccess("Modelo cadastrado com sucesso (manual reutilizado).");
        } else {
          await createEquipmentCatalog(form);
          setSuccess("Modelo cadastrado com sucesso.");
        }
        await loadCatalog();
        await loadManuals();
      } catch (e) {
        setError(e instanceof Error ? e.message : id ? "Erro ao atualizar modelo." : "Erro ao cadastrar modelo.");
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [loadCatalog, loadManuals],
  );

  const handleDelete = useCallback((_id: string) => {
    setError("Exclusão de modelos ainda não está disponível na API.");
  }, []);

  const handleIngestAllManuals = useCallback(async () => {
    setIngestingAll(true);
    setError("");
    try {
      const result = await ingestAllKnowledgeManuals();
      setSuccess(result.message);
      toast.success(result.message);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao indexar manuais.";
      setError(message);
      toast.error(message);
    } finally {
      setIngestingAll(false);
    }
  }, []);

  const handleCreateCategory = useCallback(
    async (payload: EquipmentCategoryCreatePayload): Promise<CategoryOption> => {
      const created = await createEquipmentCategory(payload);
      const option = mapApiCategoryToOption(created);
      setCategories((prev) => {
        if (prev.some((c) => c.id === option.id)) return prev;
        return [...prev, option].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      });
      setSuccess(`Categoria "${created.name}" criada.`);
      return option;
    },
    [],
  );

  return (
    <div className={styles.page}>
      {error ? (
        <p className={styles.bannerErr} role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className={styles.bannerOk} role="status">
          {success}
        </p>
      ) : null}
      <div className={styles.kbToolbar}>
        <p className={styles.kbToolbarText}>
          Indexe todos os PDFs do catálogo para a Iris responder com base nos manuais.
        </p>
        <button
          type="button"
          className={styles.kbToolbarBtn}
          disabled={ingestingAll || loading || saving}
          onClick={() => void handleIngestAllManuals()}
        >
          <RefreshCw size={16} aria-hidden />
          {ingestingAll ? "Indexando em lote…" : "Indexar todos os manuais"}
        </button>
      </div>
      <AdminEquipmentCatalogView
        equipments={equipments}
        metrics={metrics}
        categoryOptions={categories}
        categoriesLoading={categoriesLoading}
        onRefreshCategories={() => void loadCategories()}
        onCreateCategory={handleCreateCategory}
        existingManuals={manuals}
        isLoading={loading || saving}
        onSave={(data, id) => void handleSave(data, id)}
        onDelete={handleDelete}
        onFiltersChange={handleFiltersChange}
        onImportedFromManual={() => {
          setSuccess('Equipamento(s) cadastrado(s) via manual (IA) com sucesso.');
          void loadCatalog();
          void loadManuals();
        }}
      />
    </div>
  );
}
