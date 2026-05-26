import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  createEquipmentCategory,
  deleteEquipmentCategory,
  listEquipmentCategories,
  updateEquipmentCategory,
  type EquipmentCategoryOut,
} from "../../api/equipmentCatalog";
import { CategoryFieldDefinitionsEditor } from "../../components/admin/CategoryFieldDefinitionsEditor";
import { EquipmentCategoryIconPicker } from "../../components/v0-ui/admin/EquipmentCategoryIconPicker";
import {
  definitionsFromRow,
  draftsToPayload,
  emptyDraft,
  type CategoryFieldDraft,
} from "../../lib/categoryFieldDefinitions";
import {
  getCategoryVisual,
  normalizeCategoryIconKey,
  type CategoryIconKey,
} from "../../lib/equipmentCategoryIcons";
import styles from "./EquipmentCategoriesPage.module.css";

type FormState = {
  name: string;
  iconKey: CategoryIconKey;
  sortOrder: number;
  fieldDrafts: CategoryFieldDraft[];
};

const emptyForm = (): FormState => ({
  name: "",
  iconKey: "outros",
  sortOrder: 0,
  fieldDrafts: [emptyDraft()],
});

function formFromRow(row: EquipmentCategoryOut): FormState {
  const drafts = definitionsFromRow(row);
  return {
    name: row.name,
    iconKey: normalizeCategoryIconKey(row.icon_key, row.name),
    sortOrder: row.sort_order,
    fieldDrafts: drafts.length ? drafts : [emptyDraft()],
  };
}

export function EquipmentCategoriesPage() {
  const [rows, setRows] = useState<EquipmentCategoryOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EquipmentCategoryOut | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listEquipmentCategories();
      setRows(res.items);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Não foi possível carregar categorias.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (row: EquipmentCategoryOut) => {
    setEditing(row);
    setForm(formFromRow(row));
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm());
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        name: form.name.trim(),
        icon_key: form.iconKey,
        sort_order: form.sortOrder,
        field_definitions: draftsToPayload(form.fieldDrafts),
      };
      if (editing) {
        await updateEquipmentCategory(editing.id, payload);
        setSuccess("Categoria atualizada.");
      } else {
        await createEquipmentCategory(payload);
        setSuccess("Categoria criada.");
      }
      closeModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (row: EquipmentCategoryOut) => {
    if (!window.confirm(`Excluir a categoria "${row.name}"?`)) return;
    setError("");
    setSuccess("");
    try {
      await deleteEquipmentCategory(row.id);
      setSuccess("Categoria excluída.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir.");
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Categorias de equipamentos</h1>
        <p className={styles.lead}>
          Defina nome, ícone e campos técnicos de cada categoria. O ícone aparece no catálogo global, nos
          filtros e na ficha do cliente.{" "}
          <Link to="/operacao/catalogo">Voltar ao catálogo de modelos</Link>
        </p>
      </header>

      {error ? <p className={styles.bannerErr}>{error}</p> : null}
      {success ? <p className={styles.bannerOk}>{success}</p> : null}

      <div className={styles.toolbar}>
        <button type="button" className={styles.btnPrimary} onClick={openCreate}>
          + Nova categoria
        </button>
      </div>

      {loading ? (
        <p className={styles.empty}>Carregando...</p>
      ) : rows.length === 0 ? (
        <p className={styles.empty}>Nenhuma categoria cadastrada.</p>
      ) : (
        <div className={styles.grid}>
          {rows.map((row) => {
            const visual = getCategoryVisual(row.icon_key, row.name);
            const Icon = visual.Icon;
            return (
              <article key={row.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <span
                    className={styles.cardIcon}
                    style={{ backgroundColor: `${visual.accentColor}18`, color: visual.accentColor }}
                  >
                    <Icon size={22} />
                  </span>
                  <div>
                    <h2 className={styles.cardTitle}>{row.name}</h2>
                    <p className={styles.cardMeta}>
                      Ordem {row.sort_order} · ícone {visual.label}
                    </p>
                  </div>
                </div>
                <div className={styles.flags}>
                  {(row.field_definitions?.length
                    ? row.field_definitions.filter((d) => d.is_active)
                    : []
                  ).map((d) => (
                    <span key={d.key} className={styles.flag}>
                      {d.name}
                      {d.required ? " *" : ""}
                    </span>
                  ))}
                  {!row.field_definitions?.length && row.has_capacity ? (
                    <span className={styles.flag}>Capacidade</span>
                  ) : null}
                  {!row.field_definitions?.length && row.has_fluid_type ? (
                    <span className={styles.flag}>Fluido</span>
                  ) : null}
                  {!row.field_definitions?.length && row.has_voltage ? (
                    <span className={styles.flag}>Voltagem</span>
                  ) : null}
                </div>
                <div className={styles.cardActions}>
                  <button type="button" className={styles.btnGhost} onClick={() => openEdit(row)}>
                    Editar
                  </button>
                  <button type="button" className={styles.btnDanger} onClick={() => void onDelete(row)}>
                    Excluir
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {modalOpen ? (
        <div className={styles.modalBackdrop} role="presentation" onClick={closeModal}>
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cat-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="cat-modal-title" className={styles.modalTitle}>
              {editing ? "Editar categoria" : "Nova categoria"}
            </h2>
            <form onSubmit={(e) => void onSubmit(e)}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="cat-name">
                  Nome *
                </label>
                <input
                  id="cat-name"
                  className={styles.input}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Ar-Condicionado"
                  required
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Ícone</label>
                <EquipmentCategoryIconPicker
                  value={form.iconKey}
                  onChange={(iconKey) => setForm((f) => ({ ...f, iconKey }))}
                  disabled={saving}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="cat-order">
                  Ordem na lista
                </label>
                <input
                  id="cat-order"
                  type="number"
                  min={0}
                  max={9999}
                  className={styles.input}
                  value={form.sortOrder}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sortOrder: Number(e.target.value) || 0 }))
                  }
                />
              </div>
              <CategoryFieldDefinitionsEditor
                fields={form.fieldDrafts}
                onChange={(fieldDrafts) => setForm((f) => ({ ...f, fieldDrafts }))}
                disabled={saving}
              />
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnSecondary} onClick={closeModal} disabled={saving}>
                  Cancelar
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={saving || !form.name.trim()}>
                  {saving ? "Salvando..." : editing ? "Salvar" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
