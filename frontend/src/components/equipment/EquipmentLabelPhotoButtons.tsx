import React, { useEffect, useRef, useState } from "react";
import { extractEquipmentLabelFromPhotos } from "../../api/equipmentCatalogAi";
import { prepareImageForVision, revokePreparedPreview } from "../../lib/prepareImageForVision";
import type { EquipmentLabelExtractionOut } from "../../api/equipmentCatalogAi";
import styles from "./EquipmentLabelPhotoButtons.module.css";

type SlotKey = "evaporator" | "condenser";

type SlotState = {
  file: File | null;
  previewUrl: string | null;
};

type Props = {
  disabled?: boolean;
  onExtracted: (data: EquipmentLabelExtractionOut) => void;
  onError?: (message: string) => void;
};

const IconCamera = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const IconSpark = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
    <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z" />
    <path d="M19 15l.75 2.75L22.5 18.5l-2.75.75L19 22l-.75-2.75L15.5 18.5l2.75-.75L19 15z" />
  </svg>
);

export function EquipmentLabelPhotoButtons({ disabled, onExtracted, onError }: Props) {
  const evapInputRef = useRef<HTMLInputElement>(null);
  const condInputRef = useRef<HTMLInputElement>(null);
  const [slots, setSlots] = useState<Record<SlotKey, SlotState>>({
    evaporator: { file: null, previewUrl: null },
    condenser: { file: null, previewUrl: null },
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      revokePreparedPreview(slots.evaporator.previewUrl);
      revokePreparedPreview(slots.condenser.previewUrl);
    };
  }, [slots.condenser.previewUrl, slots.evaporator.previewUrl]);

  const handlePick = async (key: SlotKey, fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    setError(null);
    try {
      const prepared = await prepareImageForVision(file);
      setSlots((prev) => {
        revokePreparedPreview(prev[key].previewUrl);
        return { ...prev, [key]: { file: prepared.file, previewUrl: prepared.previewUrl } };
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha ao preparar a imagem.";
      setError(msg);
      onError?.(msg);
    }
  };

  const handleExtract = async () => {
    if (!slots.evaporator.file && !slots.condenser.file) {
      const msg = "Envie ao menos uma foto da etiqueta.";
      setError(msg);
      onError?.(msg);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await extractEquipmentLabelFromPhotos({
        evaporatorImage: slots.evaporator.file,
        condenserImage: slots.condenser.file,
      });
      onExtracted(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "IA não conseguiu ler a etiqueta.";
      setError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  };

  const renderSlot = (key: SlotKey, label: string, inputRef: React.RefObject<HTMLInputElement>) => {
    const slot = slots[key];
    return (
      <div className={styles.slot}>
        <span className={styles.slotLabel}>{label}</span>
        <div className={styles.previewWrap}>
          {slot.previewUrl ? (
            <img src={slot.previewUrl} alt={label} className={styles.preview} />
          ) : (
            <div className={styles.preview} style={{ display: "grid", placeItems: "center", color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
              Nenhuma foto
            </div>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className={styles.hiddenInput}
          disabled={disabled || loading}
          onChange={(e) => void handlePick(key, e.target.files)}
        />
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btn}
            disabled={disabled || loading}
            onClick={() => inputRef.current?.click()}
          >
            <IconCamera />
            Câmera / Galeria
          </button>
          {slot.file ? (
            <button
              type="button"
              className={styles.btn}
              disabled={disabled || loading}
              onClick={() => {
                setSlots((prev) => {
                  revokePreparedPreview(prev[key].previewUrl);
                  return { ...prev, [key]: { file: null, previewUrl: null } };
                });
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              Remover
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <section className={styles.root} aria-label="Cadastro via foto da etiqueta">
      <div className={styles.header}>
        <div className={styles.iconWrap}>
          <IconSpark />
        </div>
        <div>
          <h3 className={styles.title}>Cadastrar via Foto da Etiqueta</h3>
          <p className={styles.subtitle}>
            Ideal para o técnico em campo: fotografe a placa de especificações e a IA preenche o formulário.
          </p>
        </div>
      </div>

      <div className={styles.grid}>
        {renderSlot("evaporator", "Etiqueta da Evaporadora", evapInputRef)}
        {renderSlot("condenser", "Etiqueta da Condensadora", condInputRef)}
      </div>

      {loading ? (
        <div className={styles.loading} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden />
          <span className={styles.loadingText}>IA processando etiqueta...</span>
        </div>
      ) : (
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={disabled || (!slots.evaporator.file && !slots.condenser.file)}
          onClick={() => void handleExtract()}
        >
          <IconSpark />
          Extrair dados com IA
        </button>
      )}

      <p className={styles.hint}>Revise os campos após a extração antes de salvar.</p>
      {error ? <p className={styles.error}>{error}</p> : null}
    </section>
  );
}
