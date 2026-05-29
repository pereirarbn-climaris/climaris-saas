import { FileText, Pencil, Play, X } from "lucide-react";
import type { Campaign } from "../../api/whatsappCampaigns";
import styles from "./CampaignDashboard.module.css";
import { CampaignEmptyState } from "./CampaignEmptyState";

type Props = {
  open: boolean;
  templates: Campaign[];
  loading: boolean;
  canConfigure: boolean;
  onClose: () => void;
  onEdit: (c: Campaign) => void;
  onUse: (c: Campaign) => void;
  onCreate: () => void;
};

export function CampaignTemplatesDrawer({
  open,
  templates,
  loading,
  canConfigure,
  onClose,
  onEdit,
  onUse,
  onCreate,
}: Props) {
  if (!open) return null;

  return (
    <>
      <div className={styles.drawerOverlay} role="presentation" onClick={onClose} />
      <aside className={`${styles.drawer} ${styles.drawerNarrow}`} role="dialog" aria-label="Modelos salvos">
        <header className={styles.drawerHeader}>
          <div>
            <h2>Modelos / Templates</h2>
            <p className={styles.hint} style={{ margin: 0 }}>
              Rascunhos reutilizáveis para novos disparos
            </p>
          </div>
          <button type="button" className={styles.btnIcon} onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>
        <div className={styles.drawerBody}>
          {loading ? <p className={styles.hint}>Carregando modelos…</p> : null}
          {!loading && !templates.length ? (
            <CampaignEmptyState
              icon={<FileText size={26} />}
              title="Nenhum modelo salvo"
              description="Ao criar uma campanha, use “Salvar modelo” no passo final para guardar o rascunho aqui."
              action={
                canConfigure ? (
                  <button type="button" className={styles.btnPrimary} onClick={onCreate}>
                    Nova campanha
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className={styles.templateGrid}>
              {templates.map((c) => (
                <article key={c.id} className={styles.templateCard}>
                  <h3>{c.name}</h3>
                  <p className={styles.templateMeta}>
                    {c.asset_url ? "Com mídia" : "Somente texto"} ·{" "}
                    {new Date(c.updated_at).toLocaleDateString("pt-BR")}
                  </p>
                  <p className={styles.templatePreview}>{c.message_template}</p>
                  {canConfigure ? (
                    <div className={styles.templateActions}>
                      <button type="button" className={styles.btnSecondary} onClick={() => onEdit(c)}>
                        <Pencil size={14} />
                        Editar
                      </button>
                      <button type="button" className={styles.btnPrimary} onClick={() => onUse(c)}>
                        <Play size={14} />
                        Usar
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
