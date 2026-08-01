import { Link, Navigate, useOutletContext } from "react-router-dom";
import type { DashboardOutletContext } from "../dashboardContext";

export function PmocStartOverPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  if (!ctx) return <Navigate to="/login" replace />;

  return (
    <section
      style={{
        maxWidth: "72rem",
        margin: "0 auto",
        padding: "1.5rem",
        display: "grid",
        gap: "1rem",
      }}
    >
      <header
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          background: "#fff",
          padding: "1rem",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.4rem", color: "#0f172a" }}>PMOC reiniciado</h1>
        <p style={{ margin: "0.5rem 0 0", color: "#64748b", lineHeight: 1.55 }}>
          O módulo PMOC anterior foi encerrado e vamos construir um novo fluxo do zero.
        </p>
      </header>

      <article
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          background: "#fff",
          padding: "1rem",
          display: "grid",
          gap: "0.75rem",
        }}
      >
        <p style={{ margin: 0, color: "#334155" }}>
          Estado atual: dados limpos e rotas antigas desativadas para evitar uso acidental do formato anterior.
        </p>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <Link
            to="/app"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "2.1rem",
              padding: "0.35rem 0.85rem",
              borderRadius: "10px",
              border: "1px solid #cbd5e1",
              textDecoration: "none",
              color: "#0f172a",
              fontWeight: 600,
              background: "#fff",
            }}
          >
            Voltar ao início
          </Link>
        </div>
      </article>
    </section>
  );
}
