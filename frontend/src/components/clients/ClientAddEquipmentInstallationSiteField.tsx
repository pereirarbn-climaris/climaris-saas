import type { CSSProperties } from "react";
import type { ClientSiteOut } from "../../api/clients";

const inputStyle: CSSProperties = {
  width: "100%",
  height: "var(--input-height)",
  padding: "0 var(--input-padding-x)",
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--input-radius)",
  fontSize: "var(--font-size-base)",
  color: "var(--color-text)",
  outline: "none",
  boxSizing: "border-box",
};

type Props = {
  clientSites: ClientSiteOut[];
  value: number | null;
  onChange: (siteId: number | null) => void;
  highlightedSiteName?: string | null;
};

export function InstallationSiteField({ clientSites, value, onChange, highlightedSiteName }: Props) {
  return (
    <div
      style={{
        marginBottom: "1.25rem",
        padding: "1rem",
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--card-radius)",
      }}
    >
      <label
        style={{
          display: "block",
          marginBottom: "0.5rem",
          fontSize: "var(--font-size-sm)",
          fontWeight: "var(--font-weight-medium)",
          color: "var(--color-text)",
        }}
      >
        Unidade / Filial
      </label>
      <select
        value={value != null ? String(value) : ""}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? null : Number(raw));
        }}
        style={inputStyle}
      >
        <option value="">Matriz / Endereço principal</option>
        {clientSites.map((site) => (
          <option key={site.id} value={String(site.id)}>
            {site.name}
          </option>
        ))}
      </select>
      {highlightedSiteName ? (
        <p style={{ margin: "0.35rem 0 0", fontSize: "var(--font-size-xs)", color: "var(--color-primary)" }}>
          Vinculando à unidade: <strong>{highlightedSiteName}</strong>
        </p>
      ) : clientSites.length === 0 ? (
        <p style={{ margin: "0.35rem 0 0", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
          Cadastre unidades/filiais na aba «Unidades / Filiais» do cliente para vincular equipamentos a outras unidades.
        </p>
      ) : null}
    </div>
  );
}
