import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "../lib/apiUrl";
import {
  deletePlatformFinanceBankLogo,
  listPlatformFinanceBankCatalog,
  patchPlatformFinanceBankCatalog,
  uploadPlatformFinanceBankLogo,
  type PlatformFinanceBankCatalogRow,
} from "../api/platformFinanceBankCatalog";
import styles from "./saas/SaasDashboardPage.module.css";

function resolveLogoSrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return apiUrl(url);
}

export function PlatformFinanceBanksPage() {
  const [rows, setRows] = useState<PlatformFinanceBankCatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [urlDrafts, setUrlDrafts] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await listPlatformFinanceBankCatalog();
      setRows(list);
      const drafts: Record<number, string> = {};
      for (const r of list) drafts[r.id] = r.logo_external_url ?? "";
      setUrlDrafts(drafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleActive(r: PlatformFinanceBankCatalogRow) {
    setSavingId(r.id);
    setMsg("");
    try {
      const updated = await patchPlatformFinanceBankCatalog(r.id, { is_active: !r.is_active });
      setRows((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
      setMsg(r.is_active ? "Banco oculto do wizard de contas." : "Banco visível no wizard de contas.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar.");
    } finally {
      setSavingId(null);
    }
  }

  async function saveExternalUrl(r: PlatformFinanceBankCatalogRow) {
    setSavingId(r.id);
    setMsg("");
    setError("");
    try {
      const raw = (urlDrafts[r.id] ?? "").trim();
      const updated = await patchPlatformFinanceBankCatalog(r.id, {
        logo_external_url: raw === "" ? null : raw,
      });
      setRows((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
      setMsg("URL do logo atualizada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar URL.");
    } finally {
      setSavingId(null);
    }
  }

  async function onLogoFile(r: PlatformFinanceBankCatalogRow, file: File | undefined) {
    if (!file) return;
    setSavingId(r.id);
    setMsg("");
    setError("");
    try {
      const updated = await uploadPlatformFinanceBankLogo(r.id, file);
      setRows((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
      setMsg("Imagem enviada (WebP otimizado no servidor).");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha no upload.");
    } finally {
      setSavingId(null);
    }
  }

  async function clearUploadedLogo(r: PlatformFinanceBankCatalogRow) {
    if (!window.confirm("Remover imagem enviada e voltar ao logo padrão do app (SVG)?")) return;
    setSavingId(r.id);
    setMsg("");
    setError("");
    try {
      const updated = await deletePlatformFinanceBankLogo(r.id);
      setRows((prev) => prev.map((x) => (x.id === r.id ? updated : x)));
      setMsg("Imagem removida.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao remover.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className={styles.panel}>
      <section className={styles.card}>
        <h1 className={styles.heroTitle} style={{ fontSize: "1.35rem" }}>
          Bancos no wizard de contas
        </h1>
        <p className={styles.heroLead}>
          Defina quais bancos e carteiras aparecem ao criar conta em{" "}
          <strong>Financeiro → Contas e carteiras</strong>. Envie um logo (PNG/JPG, até ~900 KB) ou uma URL pública
          HTTPS. A URL externa tem prioridade sobre o arquivo enviado.
        </p>
        <p className={styles.note}>
          Se aparecer <strong>404</strong> ou erro ao carregar: confirme no servidor a migração Alembic até{" "}
          <code className={styles.inlineCode}>20260513_0071</code>, API atualizada e o front publicado com{" "}
          <code className={styles.inlineCode}>scripts/deploy-frontend.sh</code>; no navegador use <strong>Ctrl+F5</strong>.
        </p>
        {error ? (
          <p className={styles.note} style={{ color: "#b42318" }}>
            {error}
          </p>
        ) : null}
        {msg ? (
          <p className={styles.note} style={{ color: "#047857" }}>
            {msg}
          </p>
        ) : null}
        {loading ? (
          <p className={styles.note}>Carregando…</p>
        ) : (
          <div className={styles.financeMatrix}>
            {rows.map((r) => (
              <article key={r.id} className={styles.financeMatrixCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                  <div>
                    <h3 style={{ margin: "0 0 0.25rem" }}>
                      {r.slug === "stone" ? "Stone / Pagar.me" : r.display_label}
                    </h3>
                    <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                      {r.bank_name} · <code className={styles.inlineCode}>{r.slug}</code>
                    </p>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.85rem", whiteSpace: "nowrap" }}>
                    <input
                      type="checkbox"
                      checked={r.is_active}
                      disabled={savingId === r.id}
                      onChange={() => void toggleActive(r)}
                    />
                    Ativo
                  </label>
                </div>
                <div style={{ marginTop: "0.75rem", minHeight: "3rem", display: "flex", alignItems: "center" }}>
                  {resolveLogoSrc(r.logo_url) ? (
                    <img
                      src={resolveLogoSrc(r.logo_url)}
                      alt=""
                      style={{ maxHeight: "48px", maxWidth: "100%", objectFit: "contain" }}
                    />
                  ) : (
                    <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>Logo padrão do app</span>
                  )}
                </div>
                <div style={{ marginTop: "0.65rem", display: "grid", gap: "0.45rem" }}>
                  <label style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }} htmlFor={`ext-${r.id}`}>
                    URL pública do logo (opcional)
                  </label>
                  <input
                    id={`ext-${r.id}`}
                    type="url"
                    value={urlDrafts[r.id] ?? ""}
                    disabled={savingId === r.id}
                    onChange={(e) => setUrlDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                    placeholder="https://…"
                    style={{
                      width: "100%",
                      padding: "0.45rem 0.5rem",
                      borderRadius: "8px",
                      border: "1px solid var(--color-border)",
                      background: "var(--color-surface)",
                      color: "var(--color-text)",
                    }}
                  />
                  <button type="button" disabled={savingId === r.id} onClick={() => void saveExternalUrl(r)}>
                    Salvar URL
                  </button>
                  <label style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
                    Enviar imagem (substitui arquivo anterior)
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      disabled={savingId === r.id}
                      style={{ display: "block", marginTop: "0.25rem" }}
                      onChange={(e) => void onLogoFile(r, e.target.files?.[0])}
                    />
                  </label>
                  {r.has_uploaded_logo ? (
                    <button type="button" disabled={savingId === r.id} onClick={() => void clearUploadedLogo(r)}>
                      Remover imagem enviada
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
