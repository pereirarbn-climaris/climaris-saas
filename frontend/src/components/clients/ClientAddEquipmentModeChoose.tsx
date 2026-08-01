import { getCategoryVisual } from "../../lib/equipmentCategoryIcons";

type Props = {
  onChooseManual: () => void;
  onChooseAi: () => void;
};

const cardBase: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "0.9rem",
  padding: "1.25rem",
  borderRadius: "1.1rem",
  border: "1.5px solid var(--color-border)",
  backgroundColor: "#fff",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
  cursor: "pointer",
  textAlign: "left",
  transition: "all 0.15s ease",
  width: "100%",
};

function IconSparkles({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z" />
      <path d="M19 15l.6 2.2L22 18l-2.2.6L19 21l-.6-2.2L16 18l2.2-.6L19 15z" />
    </svg>
  );
}

function IconListChecks({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 7 1.5 1.5L7 6" />
      <path d="m3 13 1.5 1.5L7 12" />
      <line x1="11" y1="7" x2="21" y2="7" />
      <line x1="11" y1="13" x2="21" y2="13" />
      <line x1="11" y1="19" x2="21" y2="19" />
      <path d="m3 19 1.5 1.5L7 18" />
    </svg>
  );
}

export function ClientAddEquipmentModeChoose({ onChooseManual, onChooseAi }: Props) {
  const aiColor = "var(--color-primary)";
  const manualColor = getCategoryVisual("ar_condicionado").accentColor;

  return (
    <div>
      <h3
        style={{
          margin: "0 0 0.25rem",
          fontSize: "var(--font-size-md)",
          fontWeight: "var(--font-weight-semibold)",
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
            e.currentTarget.style.boxShadow = `0 6px 16px -8px ${aiColor}55`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--color-border)";
            e.currentTarget.style.boxShadow = "0 1px 2px rgba(15, 23, 42, 0.04)";
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              borderRadius: 12,
              flexShrink: 0,
              backgroundColor: `${aiColor}15`,
            }}
          >
            <IconSparkles color={aiColor} />
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <span
              style={{
                display: "inline-flex",
                alignSelf: "flex-start",
                padding: "0.15rem 0.5rem",
                borderRadius: 9999,
                fontSize: "0.6875rem",
                fontWeight: 700,
                color: aiColor,
                backgroundColor: `${aiColor}15`,
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
              Fotografe a placa: identifica ar-condicionado ou climatizador, busca ou cadastra o modelo no catálogo e
              preenche os dados por você.
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={onChooseManual}
          style={cardBase}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = manualColor;
            e.currentTarget.style.boxShadow = `0 6px 16px -8px ${manualColor}55`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--color-border)";
            e.currentTarget.style.boxShadow = "0 1px 2px rgba(15, 23, 42, 0.04)";
          }}
        >
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 44,
              height: 44,
              borderRadius: 12,
              flexShrink: 0,
              backgroundColor: `${manualColor}15`,
            }}
          >
            <IconListChecks color={manualColor} />
          </span>
          <span style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <strong style={{ fontSize: "var(--font-size-base)", color: "var(--color-text)" }}>Cadastro manual</strong>
            <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45 }}>
              Escolha a categoria (Ar-condicionado ou Climatizador), marca e modelo, série e demais informações em 2
              passos rápidos.
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}
