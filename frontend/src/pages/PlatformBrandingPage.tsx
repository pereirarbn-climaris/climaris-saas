import { useEffect, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import {
  deletePlatformFavicon,
  deletePlatformLogo,
  patchPlatformBranding,
  resolvePlatformBrandingAssetUrl,
  uploadPlatformFavicon,
  uploadPlatformLogo,
} from "../api/platformBranding";
import { usePlatformBranding } from "../context/PlatformBrandingContext";
import styles from "./PlatformBrandingPage.module.css";

type AssetKind = "logo" | "favicon";

const LOGO_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "svg"]);
const FAVICON_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "ico"]);

function fileExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? (parts.pop()?.toLowerCase() ?? "") : "";
}

function isAcceptedImage(file: File, kind: AssetKind): boolean {
  const ext = fileExtension(file.name);
  const allowed = kind === "logo" ? LOGO_EXTENSIONS : FAVICON_EXTENSIONS;
  if (allowed.has(ext)) return true;
  return file.type.startsWith("image/");
}

function pickDroppedImage(files: FileList | null | undefined, kind: AssetKind): File | undefined {
  const file = files?.[0];
  if (!file || !isAcceptedImage(file, kind)) return undefined;
  return file;
}

type ImageDropZoneProps = {
  kind: AssetKind;
  busy: boolean;
  onFile: (file: File) => void;
  onPickClick: () => void;
  children: ReactNode;
  dropHint: string;
};

function ImageDropZone({ kind, busy, onFile, onPickClick, children, dropHint }: ImageDropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const dragDepthRef = useRef(0);

  function resetDrag() {
    dragDepthRef.current = 0;
    setDragOver(false);
  }

  function onDragEnter(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    dragDepthRef.current += 1;
    setDragOver(true);
  }

  function onDragLeave(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragOver(false);
  }

  function onDragOver(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!busy) setDragOver(true);
  }

  function onDrop(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    resetDrag();
    if (busy) return;
    const file = pickDroppedImage(e.dataTransfer.files, kind);
    if (!file) return;
    onFile(file);
  }

  return (
    <button
      type="button"
      className={`${styles.previewWrap} ${dragOver ? styles.previewWrapActive : ""} ${busy ? styles.previewWrapBusy : ""}`.trim()}
      disabled={busy}
      onClick={onPickClick}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      aria-label={kind === "logo" ? "Enviar logo da plataforma" : "Enviar favicon da plataforma"}
    >
      {children}
      <p className={styles.dropHint}>{busy ? "Enviando…" : dropHint}</p>
    </button>
  );
}

export function PlatformBrandingPage() {
  const { branding, setBranding } = usePlatformBranding();
  const [platformName, setPlatformName] = useState(branding.platform_name);
  const [busy, setBusy] = useState<"name" | "logo" | "favicon" | null>(null);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const faviconInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setPlatformName(branding.platform_name);
  }, [branding.platform_name]);

  const logoSrc = resolvePlatformBrandingAssetUrl(branding.logo_url);
  const faviconSrc = resolvePlatformBrandingAssetUrl(branding.favicon_url);

  async function onSaveName(e: FormEvent) {
    e.preventDefault();
    const name = platformName.trim();
    if (!name) {
      setError("Informe o nome da plataforma.");
      return;
    }
    setBusy("name");
    setMsg("");
    setError("");
    try {
      const updated = await patchPlatformBranding({ platform_name: name });
      setBranding(updated);
      setMsg("Nome da plataforma atualizado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o nome.");
    } finally {
      setBusy(null);
    }
  }

  async function onLogoFile(file: File | undefined) {
    if (!file) {
      setError("Envie uma imagem PNG, JPG, WebP ou SVG.");
      return;
    }
    if (!isAcceptedImage(file, "logo")) {
      setError("Formato inválido para o logo. Use PNG, JPG, WebP ou SVG.");
      return;
    }
    setBusy("logo");
    setMsg("");
    setError("");
    try {
      const updated = await uploadPlatformLogo(file);
      setBranding(updated);
      setMsg("Logo da plataforma enviado com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o logo.");
    } finally {
      setBusy(null);
    }
  }

  async function onRemoveLogo() {
    if (!window.confirm("Remover o logo da plataforma e voltar ao padrão?")) return;
    setBusy("logo");
    setMsg("");
    setError("");
    try {
      const updated = await deletePlatformLogo();
      setBranding(updated);
      setMsg("Logo removido.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível remover o logo.");
    } finally {
      setBusy(null);
    }
  }

  async function onFaviconFile(file: File | undefined) {
    if (!file) {
      setError("Envie uma imagem PNG, JPG, WebP ou ICO.");
      return;
    }
    if (!isAcceptedImage(file, "favicon")) {
      setError("Formato inválido para o favicon. Use PNG, JPG, WebP ou ICO.");
      return;
    }
    setBusy("favicon");
    setMsg("");
    setError("");
    try {
      const updated = await uploadPlatformFavicon(file);
      setBranding(updated);
      setMsg("Ícone do site (favicon) enviado com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o favicon.");
    } finally {
      setBusy(null);
    }
  }

  async function onRemoveFavicon() {
    if (!window.confirm("Remover o favicon e voltar ao padrão do navegador?")) return;
    setBusy("favicon");
    setMsg("");
    setError("");
    try {
      const updated = await deletePlatformFavicon();
      setBranding(updated);
      setMsg("Favicon removido.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível remover o favicon.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Plataforma · Identidade visual</p>
        <h2 className={styles.title}>Logo e ícone do site</h2>
        <p className={styles.lead}>
          Defina o logo exibido na sidebar, telas de login e painel de operação, além do favicon na aba do navegador.
          As imagens são otimizadas e armazenadas no S3 da plataforma.
        </p>
      </header>

      {msg ? <p className={styles.msgOk}>{msg}</p> : null}
      {error ? <p className={styles.msgErr}>{error}</p> : null}

      <form className={styles.card} onSubmit={(e) => void onSaveName(e)}>
        <h3 className={styles.cardTitle}>Nome da plataforma</h3>
        <p className={styles.hint}>Aparece ao lado do logo quando não há imagem, no título da aba e em telas de autenticação.</p>
        <div className={styles.nameField}>
          <label className={styles.nameLabel} htmlFor="platform-name">
            Nome
          </label>
          <input
            id="platform-name"
            className={styles.nameInput}
            value={platformName}
            onChange={(e) => setPlatformName(e.target.value)}
            maxLength={120}
            disabled={busy === "name"}
          />
        </div>
        <div className={styles.actions}>
          <button type="submit" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy === "name"}>
            {busy === "name" ? "Salvando…" : "Salvar nome"}
          </button>
        </div>
      </form>

      <div className={styles.grid}>
        <section className={styles.card}>
          <h3 className={styles.cardTitle}>Logo da plataforma</h3>
          <p className={styles.hint}>Recomendado: PNG ou SVG com fundo transparente. Máx. 8 MB (PNG preserva transparência; demais formatos viram WebP).</p>
          <ImageDropZone
            kind="logo"
            busy={busy === "logo"}
            onFile={(file) => void onLogoFile(file)}
            onPickClick={() => logoInputRef.current?.click()}
            dropHint="Clique ou solte a imagem aqui"
          >
            {logoSrc ? (
              <img src={logoSrc} alt="Logo da plataforma" className={styles.logoPreview} />
            ) : (
              <span className={styles.fallback}>Nenhum logo enviado — exibe a marca padrão</span>
            )}
          </ImageDropZone>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className={styles.fileInput}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void onLogoFile(file);
            }}
          />
          <div className={styles.actions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={busy === "logo"}
              onClick={() => logoInputRef.current?.click()}
            >
              {busy === "logo" ? "Enviando…" : "Enviar logo"}
            </button>
            {branding.has_logo ? (
              <button type="button" className={`${styles.btn} ${styles.btnDanger}`} disabled={busy === "logo"} onClick={() => void onRemoveLogo()}>
                Remover
              </button>
            ) : null}
          </div>
        </section>

        <section className={styles.card}>
          <h3 className={styles.cardTitle}>Ícone do site (favicon)</h3>
          <p className={styles.hint}>Quadrado, ideal 64×64 px ou maior. Aparece na aba do navegador e em favoritos.</p>
          <ImageDropZone
            kind="favicon"
            busy={busy === "favicon"}
            onFile={(file) => void onFaviconFile(file)}
            onPickClick={() => faviconInputRef.current?.click()}
            dropHint="Clique ou solte a imagem aqui"
          >
            {faviconSrc ? (
              <img src={faviconSrc} alt="Favicon da plataforma" className={styles.faviconPreview} />
            ) : (
              <span className={styles.fallback}>Nenhum favicon — usa o padrão do navegador</span>
            )}
          </ImageDropZone>
          <input
            ref={faviconInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon,.ico"
            className={styles.fileInput}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void onFaviconFile(file);
            }}
          />
          <div className={styles.actions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={busy === "favicon"}
              onClick={() => faviconInputRef.current?.click()}
            >
              {busy === "favicon" ? "Enviando…" : "Enviar favicon"}
            </button>
            {branding.has_favicon ? (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnDanger}`}
                disabled={busy === "favicon"}
                onClick={() => void onRemoveFavicon()}
              >
                Remover
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
