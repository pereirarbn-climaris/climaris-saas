import { useCallback, useEffect, useRef, useState } from "react";
import { prepareImageForVision, revokePreparedPreview } from "../../lib/prepareImageForVision";
import type { LaudoPhoto } from "../v0-ui/service-orders/ServiceOrderFormView";
import styles from "./LaudoPhotoEvidence.module.css";

type Props = {
  photos: LaudoPhoto[];
  onChange: (photos: LaudoPhoto[]) => void;
  disabled?: boolean;
  maxPhotos?: number;
};

function newPhotoId(): string {
  return `laudo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}

export function LaudoPhotoEvidence({ photos, onChange, disabled = false, maxPhotos = 12 }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewUrlsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const map = previewUrlsRef.current;
    return () => {
      map.forEach((url) => revokePreparedPreview(url));
      map.clear();
    };
  }, []);

  const updateCaption = useCallback(
    (id: string, caption: string) => {
      onChange(photos.map((p) => (p.id === id ? { ...p, caption } : p)));
    },
    [onChange, photos],
  );

  const removePhoto = useCallback(
    (id: string) => {
      onChange(photos.filter((p) => p.id !== id));
    },
    [onChange, photos],
  );

  const handlePick = useCallback(
    async (fileList: FileList | null) => {
      const files = fileList ? Array.from(fileList) : [];
      if (!files.length) return;
      if (photos.length >= maxPhotos) {
        setError(`Máximo de ${maxPhotos} fotos.`);
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const next = [...photos];
        for (const file of files) {
          if (next.length >= maxPhotos) break;
          const prepared = await prepareImageForVision(file);
          const dataUrl = await fileToDataUrl(prepared.file);
          next.push({ id: newPhotoId(), dataUrl, caption: "" });
          revokePreparedPreview(prepared.previewUrl);
        }
        onChange(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Falha ao adicionar foto.");
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [maxPhotos, onChange, photos],
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.addBtn}
          disabled={disabled || busy || photos.length >= maxPhotos}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Processando…" : "Adicionar foto"}
        </button>
        <span className={styles.hint}>
          {photos.length}/{maxPhotos} · JPG, PNG ou WEBP
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className={styles.fileHidden}
          disabled={disabled || busy}
          onChange={(e) => void handlePick(e.target.files)}
        />
      </div>
      {error ? <p className={styles.error}>{error}</p> : null}
      {photos.length === 0 ? (
        <p className={styles.empty}>Nenhuma evidência fotográfica anexada.</p>
      ) : (
        <div className={styles.grid}>
          {photos.map((photo) => (
            <div key={photo.id} className={styles.card}>
              <img src={photo.dataUrl} alt={photo.caption?.trim() || "Evidência fotográfica"} className={styles.preview} />
              <input
                type="text"
                className={styles.caption}
                value={photo.caption ?? ""}
                disabled={disabled}
                placeholder="Legenda (ex.: Pressão medida)"
                onChange={(e) => updateCaption(photo.id, e.target.value)}
              />
              {!disabled ? (
                <button type="button" className={styles.removeBtn} onClick={() => removePhoto(photo.id)}>
                  Remover
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
