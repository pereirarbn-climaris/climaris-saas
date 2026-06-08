import { getCategoryVisual } from "../../lib/equipmentCategoryIcons";

type Props = {
  onChooseManual: () => void;
  onChooseAi: () => void;
};

const cardBase: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: "0.5rem",
  padding: "1.25rem",
  borderRadius: "var(--card-radius)",
  border: "2px solid var(--color-border)",
  backgroundColor: "var(--color-surface)",
  cursor: "pointer",
  textAlign: "left",
  transition: "all 0.15s ease",
  width: "100%",
};

export function ClientAddEquipmentModeChoose({ onChooseManual, onChooseAi }: Props) {
  const aiColor = "var(--color-primary)";

  return (
    <div>
      <h3
        style={{
          margin: "0 0 0.75rem",
          fontSize: "var(--font-size-md)",
          fontWeight: "var(--font-weight-medium)",
          color: "var(--color-text)",
        }}
      >
        Como deseja cadastrar?
      </h3>
      <p style={{ margin: "0 0 1.25rem", fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>
        Escolha o cadastro manual (categoria, marca e modelo) ou use a IA lendo a foto da etiqueta do aparelho.
      </p>
      <div style={{ display: "grid", gap: "0.75rem" }}>
        <button
          type="button"
          onClick={onChooseAi}
          style={cardBase}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = aiColor;
            e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--color-primary) 8%, var(--color-surface))";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--color-border)";
            e.currentTarget.style.backgroundColor = "var(--color-surface)";
          }}
        >
          <span
            style={{
              fontSize: "var(--font-size-xs)",
              fontWeight: 600,
              color: aiColor,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            Recomendado em campo
          </span>
          <strong style={{ fontSize: "var(--font-size-base)", color: "var(--color-text)" }}>
            Ler etiqueta com IA
          </strong>
          <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45 }}>
            Fotografe a placa: identifica ar-condicionado, climatizador, etc., busca ou cadastra o modelo no catálogo e
            preenche os dados.
          </span>
        </button>

        <button
          type="button"
          onClick={onChooseManual}
          style={cardBase}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = getCategoryVisual("ar_condicionado").accentColor;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--color-border)";
          }}
        >
          <strong style={{ fontSize: "var(--font-size-base)", color: "var(--color-text)" }}>Cadastro manual</strong>
          <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45 }}>
            Mesmo fluxo de sempre: escolha a categoria, marca, modelo, série e demais informações passo a passo.
          </span>
        </button>
      </div>
    </div>
  );
}
