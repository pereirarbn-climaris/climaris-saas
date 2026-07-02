import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  deleteWebsitePageImage,
  fetchPlatformWebsitePage,
  patchPlatformWebsitePage,
  resolveWebsitePageImageUrl,
  uploadWebsitePageImage,
  type WebsitePageOut,
  type WebsitePageSection,
} from "../api/platformWebsitePages";
import baseStyles from "./PlatformBrandingPage.module.css";
import styles from "./PlatformInstitutionalSitePage.module.css";

const SITE_ORIGIN = "https://climaris.com.br";

type SubTab = "content" | "seo" | "images";

type Props = {
  slug: string;
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
};

type FormState = {
  title: string;
  subtitle: string;
  hero_description: string;
  seo_title: string;
  seo_description: string;
  is_published: boolean;
  sections: WebsitePageSection[];
  outcomes: string;
};

function applyPageToForm(page: WebsitePageOut): FormState {
  return {
    title: page.title,
    subtitle: page.subtitle,
    hero_description: page.hero_description,
    seo_title: page.seo_title,
    seo_description: page.seo_description,
    is_published: page.is_published,
    sections: page.sections.map((s) => ({ ...s, bullets: [...s.bullets] })),
    outcomes: page.outcomes.join("\n"),
  };
}

export function PlatformWebsitePageEditor({ slug, onMessage, onError }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("content");
  const [page, setPage] = useState<WebsitePageOut | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    onError("");
    try {
      const row = await fetchPlatformWebsitePage(slug);
      setPage(row);
      setForm(applyPageToForm(row));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erro ao carregar página.");
    } finally {
      setLoading(false);
    }
  }, [slug, onError]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateSection(index: number, patch: Partial<WebsitePageSection>) {
    setForm((prev) => {
      if (!prev) return prev;
      const sections = prev.sections.map((s, i) => (i === index ? { ...s, ...patch } : s));
      return { ...prev, sections };
    });
  }

  async function onSaveContent(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy("content");
    onMessage("");
    onError("");
    try {
      const outcomes = form.outcomes
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const updated = await patchPlatformWebsitePage(slug, {
        title: form.title.trim(),
        subtitle: form.subtitle.trim(),
        hero_description: form.hero_description.trim(),
        sections: form.sections.map((s) => ({
          ...s,
          title: s.title.trim(),
          description: s.description.trim(),
          bullets: s.bullets.map((b) => b.trim()).filter(Boolean),
        })),
        outcomes,
      });
      setPage(updated);
      setForm(applyPageToForm(updated));
      onMessage("Conteúdo da página salvo.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(null);
    }
  }

  async function onSaveSeo(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy("seo");
    onMessage("");
    onError("");
    try {
      const updated = await patchPlatformWebsitePage(slug, {
        seo_title: form.seo_title.trim(),
        seo_description: form.seo_description.trim(),
        is_published: form.is_published,
      });
      setPage(updated);
      setForm(applyPageToForm(updated));
      onMessage("SEO e publicação atualizados.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(null);
    }
  }

  async function onImageFile(slot: string, file: File | undefined) {
    if (!file) return;
    setBusy(`img-${slot}`);
    onMessage("");
    onError("");
    try {
      const updated = await uploadWebsitePageImage(slug, slot, file);
      setPage(updated);
      setForm(applyPageToForm(updated));
      onMessage("Imagem atualizada.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Falha no upload.");
    } finally {
      setBusy(null);
      const input = fileRefs.current[slot];
      if (input) input.value = "";
    }
  }

  async function onRemoveImage(slot: string) {
    setBusy(`del-${slot}`);
    onMessage("");
    onError("");
    try {
      const updated = await deleteWebsitePageImage(slug, slot);
      setPage(updated);
      setForm(applyPageToForm(updated));
      onMessage("Imagem removida.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Não foi possível remover.");
    } finally {
      setBusy(null);
    }
  }

  if (loading || !form || !page) {
    return <p className={baseStyles.hint}>Carregando página…</p>;
  }

  const publicUrl = `${SITE_ORIGIN}${page.path}`;

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>{page.label}</h2>
          <p className={styles.panelHint}>
            {page.path} — conteúdo, SEO e imagens publicados em{" "}
            <a href={publicUrl} target="_blank" rel="noreferrer" className={styles.previewLink}>
              ver no site
            </a>
          </p>
        </div>
        <span className={`${styles.badge} ${form.is_published ? styles.badgeOn : styles.badgeOff}`}>
          {form.is_published ? "Publicada" : "Oculta"}
        </span>
      </div>

      <div className={styles.subNav}>
        {(
          [
            ["content", "Conteúdo"],
            ["seo", "SEO"],
            ["images", "Imagens"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`${styles.subNavBtn} ${subTab === key ? styles.subNavBtnActive : ""}`}
            onClick={() => setSubTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === "content" ? (
        <form className={baseStyles.card} onSubmit={onSaveContent}>
          <div className={baseStyles.fieldGrid}>
            <label className={baseStyles.field}>
              Título (H1)
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label className={baseStyles.field}>
              Subtítulo
              <input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
            </label>
            <label className={baseStyles.field} style={{ gridColumn: "1 / -1" }}>
              Descrição do hero
              <textarea
                rows={3}
                value={form.hero_description}
                onChange={(e) => setForm({ ...form, hero_description: e.target.value })}
              />
            </label>
          </div>

          <h3 className={baseStyles.cardTitle}>Seções do módulo</h3>
          {form.sections.map((section, index) => (
            <div key={section.key} className={styles.sectionCard}>
              <h4 className={styles.sectionCardTitle}>{section.key}</h4>
              <label className={baseStyles.field}>
                Título
                <input
                  value={section.title}
                  onChange={(e) => updateSection(index, { title: e.target.value })}
                />
              </label>
              <label className={baseStyles.field}>
                Descrição
                <textarea
                  rows={2}
                  value={section.description}
                  onChange={(e) => updateSection(index, { description: e.target.value })}
                />
              </label>
              <label className={baseStyles.field}>
                Bullets (um por linha)
                <textarea
                  rows={4}
                  value={section.bullets.join("\n")}
                  onChange={(e) =>
                    updateSection(index, {
                      bullets: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
                    })
                  }
                />
              </label>
            </div>
          ))}

          <label className={baseStyles.field}>
            Resultados (um por linha)
            <textarea rows={4} value={form.outcomes} onChange={(e) => setForm({ ...form, outcomes: e.target.value })} />
          </label>

          <button type="submit" className={baseStyles.btnPrimary} disabled={busy === "content"}>
            {busy === "content" ? "Salvando…" : "Salvar conteúdo"}
          </button>
        </form>
      ) : null}

      {subTab === "seo" ? (
        <form className={baseStyles.card} onSubmit={onSaveSeo}>
          <label className={baseStyles.field}>
            Título SEO (meta title)
            <input value={form.seo_title} onChange={(e) => setForm({ ...form, seo_title: e.target.value })} />
          </label>
          <label className={baseStyles.field}>
            Descrição SEO (meta description)
            <textarea
              rows={3}
              value={form.seo_description}
              onChange={(e) => setForm({ ...form, seo_description: e.target.value })}
            />
          </label>
          <label className={baseStyles.field} style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={form.is_published}
              onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
            />
            Página publicada no site
          </label>
          <button type="submit" className={baseStyles.btnPrimary} disabled={busy === "seo"}>
            {busy === "seo" ? "Salvando…" : "Salvar SEO"}
          </button>
        </form>
      ) : null}

      {subTab === "images" ? (
        <div className={baseStyles.grid}>
          {page.images.map((image) => {
            const src = resolveWebsitePageImageUrl(image.url);
            const isBusy = busy === `img-${image.slot}` || busy === `del-${image.slot}`;
            return (
              <div key={image.slot} className={baseStyles.card}>
                <h3 className={baseStyles.cardTitle}>{image.label}</h3>
                <p className={baseStyles.hint}>{image.hint}</p>
                <div className={baseStyles.previewWrap}>
                  {src ? (
                    <img src={src} alt={image.label} className={baseStyles.previewImg} />
                  ) : (
                    <span className={baseStyles.previewPlaceholder}>Sem imagem</span>
                  )}
                </div>
                <input
                  ref={(el) => {
                    fileRefs.current[image.slot] = el;
                  }}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className={baseStyles.hiddenInput}
                  onChange={(e) => void onImageFile(image.slot, e.target.files?.[0])}
                />
                <div className={baseStyles.actionsRow}>
                  <button
                    type="button"
                    className={baseStyles.btnPrimary}
                    disabled={isBusy}
                    onClick={() => fileRefs.current[image.slot]?.click()}
                  >
                    Enviar imagem
                  </button>
                  {image.has_image ? (
                    <button
                      type="button"
                      className={baseStyles.btnGhost}
                      disabled={isBusy}
                      onClick={() => void onRemoveImage(image.slot)}
                    >
                      Remover
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
