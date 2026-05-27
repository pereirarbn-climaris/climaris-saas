import { useRef } from "react";
import styles from "./GlobalEquipmentManualsPanel.module.css";

export type ManualDocumentKind = "usuario" | "instalacao" | "servico";

export type ManualDocumentSlot = {
  pdf: File | null;
  title: string;
};

export type ManualOption = { id: string; title: string };

export type GlobalEquipmentManualsValue = {
  usuario: ManualDocumentSlot;
  instalacao: ManualDocumentSlot;
  servico: ManualDocumentSlot;
  combined: ManualDocumentSlot;
  combinedUsuarioInstalacao: boolean;
  existingManualId: string;
};

type Props = {
  value: GlobalEquipmentManualsValue;
  existingManuals: ManualOption[];
  errors?: Partial<Record<keyof GlobalEquipmentManualsValue | "existingManualId", string>>;
  onChange: (next: GlobalEquipmentManualsValue) => void;
  disabled?: boolean;
};

const MANUAL_META: Record<
  ManualDocumentKind,
  { title: string; hint: string; fieldKey: keyof GlobalEquipmentManualsValue }
> = {
  usuario: {
    title: "Manual do Usuário",
    hint: "Manual de operação para o cliente final.",
    fieldKey: "usuario",
  },
  instalacao: {
    title: "Manual de Instalação",
    hint: "Essencial para o técnico montar e comissionar o equipamento.",
    fieldKey: "instalacao",
  },
  servico: {
    title: "Manual de Serviço / Códigos de Erro",
    hint: "Consulta de falhas, LEDs piscando e procedimentos de reparo.",
    fieldKey: "servico",
  },
};

function isPdfFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".pdf") || file.type === "application/pdf" || file.type === "";
}

function PdfSlotField({
  kind,
  slot,
  disabled,
  titleOverride,
  hintOverride,
  onSelect,
  onClear,
}: {
  kind: ManualDocumentKind;
  slot: ManualDocumentSlot;
  disabled?: boolean;
  titleOverride?: string;
  hintOverride?: string;
  onSelect: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const meta = MANUAL_META[kind];

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    if (!isPdfFile(file)) return;
    onSelect(file);
  };

  return (
    <div className={styles.manualBlock}>
      <h4 className={styles.manualBlockTitle}>{titleOverride ?? meta.title}</h4>
      <p className={styles.manualBlockHint}>{hintOverride ?? meta.hint}</p>
      {slot.pdf ? (
        <div className={styles.pdfChip}>
          <span className={styles.pdfChipName} title={slot.pdf.name}>
            {slot.pdf.name}
          </span>
          <button type="button" className={styles.pdfChipRemove} onClick={onClear} disabled={disabled} aria-label="Remover PDF">
            ×
          </button>
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className={styles.hiddenInput}
            disabled={disabled}
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div
            role="button"
            tabIndex={0}
            className={styles.pdfDropzone}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
          >
            <span className={styles.pdfDropzoneTitle}>Anexar PDF</span>
            <span className={styles.pdfDropzoneHint}>Clique para escolher ou arraste aqui</span>
          </div>
        </>
      )}
    </div>
  );
}

export function GlobalEquipmentManualsPanel({
  value,
  existingManuals,
  errors,
  onChange,
  disabled,
}: Props) {
  const updateSlot = (kind: ManualDocumentKind, patch: Partial<ManualDocumentSlot>) => {
    onChange({
      ...value,
      [kind]: { ...value[kind], ...patch },
    });
  };

  return (
    <section className={styles.section} aria-label="Manuais e suporte técnico">
      <h3 className={styles.sectionTitle}>Manuais e Suporte Técnico</h3>
      <p className={styles.sectionHint}>
        Organize a documentação que o técnico consulta em campo. Todos os campos são opcionais.
      </p>

      <label className={styles.combinedToggle}>
        <input
          type="checkbox"
          checked={value.combinedUsuarioInstalacao}
          disabled={disabled}
          onChange={(e) =>
            onChange({
              ...value,
              combinedUsuarioInstalacao: e.target.checked,
              usuario: { pdf: null, title: "" },
              instalacao: { pdf: null, title: "" },
              combined: e.target.checked ? value.combined : { pdf: null, title: "" },
            })
          }
        />
        <span>
          Um único PDF contém manual do usuário e de instalação
        </span>
      </label>

      {value.combinedUsuarioInstalacao ? (
        <PdfSlotField
          kind="instalacao"
          slot={value.combined}
          disabled={disabled}
          titleOverride="Manual do usuário e instalação"
          hintOverride="Use quando a fabricante disponibiliza um único PDF com operação e instalação."
          onSelect={(file) =>
            onChange({
              ...value,
              combined: { pdf: file, title: file.name.replace(/\.pdf$/i, "") },
            })
          }
          onClear={() => onChange({ ...value, combined: { pdf: null, title: "" } })}
        />
      ) : (
        (Object.keys(MANUAL_META) as ManualDocumentKind[]).map((kind) => (
          <PdfSlotField
            key={kind}
            kind={kind}
            slot={value[kind]}
            disabled={disabled}
            onSelect={(file) => updateSlot(kind, { pdf: file, title: file.name.replace(/\.pdf$/i, "") })}
            onClear={() => updateSlot(kind, { pdf: null, title: "" })}
          />
        ))
      )}

      <div className={styles.existingWrap}>
        <label className={styles.fieldLabel} htmlFor="existing-manual-select">
          Vincular a um manual já existente no sistema
        </label>
        <div className={styles.selectWrap}>
          <select
            id="existing-manual-select"
            className={styles.select}
            value={value.existingManualId}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, existingManualId: e.target.value })}
          >
            <option value="">
              {existingManuals.length ? "Selecione um manual..." : "Nenhum manual cadastrado ainda"}
            </option>
            {existingManuals.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </div>
        {errors?.existingManualId ? <p className={styles.formError}>{errors.existingManualId}</p> : null}
      </div>
    </section>
  );
}

export function emptyGlobalEquipmentManualsValue(): GlobalEquipmentManualsValue {
  return {
    usuario: { pdf: null, title: "" },
    instalacao: { pdf: null, title: "" },
    servico: { pdf: null, title: "" },
    combined: { pdf: null, title: "" },
    combinedUsuarioInstalacao: false,
    existingManualId: "",
  };
}
