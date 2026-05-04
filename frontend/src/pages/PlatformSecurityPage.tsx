import { useEffect, useState } from "react";
import { downloadPlatformLoginAttemptsCsv, listPlatformLoginAttempts, type PlatformLoginAttempt } from "../api/platformSecurity";
import styles from "./saas/SaasDashboardPage.module.css";

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

const OUTCOME_OPTIONS = ["", "success", "failure", "blocked", "challenge"];

export function PlatformSecurityPage() {
  const [rows, setRows] = useState<PlatformLoginAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [outcome, setOutcome] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [exporting, setExporting] = useState(false);

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const data = await listPlatformLoginAttempts({
        email: email || undefined,
        outcome: outcome || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        limit: 400,
      });
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar auditoria de login.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function exportCsv() {
    setExporting(true);
    setError("");
    try {
      const blob = await downloadPlatformLoginAttemptsCsv({
        email: email || undefined,
        outcome: outcome || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        limit: 3000,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "platform-login-attempts.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível exportar CSV.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className={styles.panel}>
      <section className={styles.heroCard}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Operação · Segurança</p>
          <h2 className={styles.heroTitle}>Auditoria de login</h2>
          <p className={styles.heroLead}>Acompanhe falhas, bloqueios, desafios e sucessos de autenticação em toda a plataforma.</p>
          <p className={styles.heroMeta}>Registros carregados: {rows.length}</p>
        </div>
        <div className={styles.heroAccent} aria-hidden />
      </section>

      <section className={styles.card}>
        <div className={styles.section}>
          <input
            className={styles.link}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Filtrar por e-mail"
          />
          <select className={styles.link} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            {OUTCOME_OPTIONS.map((it) => (
              <option key={it || "all"} value={it}>
                {it || "Todos os resultados"}
              </option>
            ))}
          </select>
          <input className={styles.link} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <input className={styles.link} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <button className={styles.link} type="button" onClick={() => void refresh()} disabled={loading}>
            {loading ? "Buscando..." : "Filtrar"}
          </button>
          <button className={`${styles.link} ${styles.linkPrimary}`} type="button" onClick={() => void exportCsv()} disabled={exporting}>
            {exporting ? "Exportando..." : "Exportar CSV"}
          </button>
        </div>
      </section>

      {error ? <p className={styles.contactHint}>{error}</p> : null}

      <section className={styles.card}>
        {loading ? <p className={styles.note}>Carregando...</p> : null}
        {!loading && rows.length === 0 ? <p className={styles.note}>Nenhum registro encontrado para os filtros informados.</p> : null}
        {!loading && rows.length > 0 ? (
          <div className={styles.section}>
            {rows.map((row) => (
              <div key={row.id} className={styles.contactCard}>
                <p className={styles.contactLabel}>
                  {row.email} · {row.outcome}
                </p>
                <p className={styles.note}>Quando: {fmtDate(row.created_at)}</p>
                <p className={styles.note}>Motivo: {row.reason || "—"}</p>
                <p className={styles.note}>Tenant/User: {row.tenant_id ?? "—"} / {row.user_id ?? "—"}</p>
                <p className={styles.note}>IP: {row.ip_address || "—"}</p>
                <p className={styles.note}>Device fingerprint: {row.device_fingerprint || "—"}</p>
                <p className={styles.note}>User-Agent: {row.user_agent || "—"}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
