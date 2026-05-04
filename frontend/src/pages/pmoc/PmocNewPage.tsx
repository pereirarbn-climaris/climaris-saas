import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useOutletContext } from "react-router-dom";
import { createPmocPlan } from "../../api/pmoc";
import { listClients, type ClientOut } from "../../api/clients";
import type { DashboardOutletContext } from "../dashboardContext";
import loginStyles from "../LoginPage.module.css";
import styles from "./PmocPages.module.css";

export function PmocNewPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ClientOut[]>([]);
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [clientId, setClientId] = useState<number | "">("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setQ(input.trim()), 400);
    return () => window.clearTimeout(t);
  }, [input]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const list = await listClients({ q: q || undefined, limit: 200 });
      setRows(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar clientes.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedClient = useMemo(
    () => (typeof clientId === "number" ? rows.find((c) => c.id === clientId) : undefined),
    [clientId, rows],
  );

  useEffect(() => {
    if (selectedClient && !title.trim()) {
      setTitle(`PMOC — ${selectedClient.name}`);
    }
  }, [selectedClient, title]);

  if (!ctx) return <Navigate to="/login" replace />;

  const canCreate = ctx.user.role === "admin" || ctx.user.role === "receptionist" || ctx.user.role === "technician";

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (typeof clientId !== "number" || !title.trim()) {
      setSaveErr("Selecione o cliente e informe o título do plano.");
      return;
    }
    setSaving(true);
    setSaveErr("");
    try {
      const plan = await createPmocPlan({ client_id: clientId, title: title.trim() });
      navigate(`/app/pmoc/${plan.id}`);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Não foi possível criar o PMOC.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <Link to="/app/pmoc" className={styles.btnBackLink}>
        ← Voltar à lista
      </Link>
      <header className={styles.hero}>
        <h1 className={styles.title}>Nova PMOC</h1>
        <p className={styles.lead}>
          O PMOC é vinculado a um cliente/endereço (um plano por estabelecimento). Após criar, associe os equipamentos no local e,
          quando estiver completo, ative o plano. Acima de 60.000 BTUs somados, o sistema marcará exigência de análise periódica do ar.
        </p>
      </header>

      {!canCreate ? (
        <div className={styles.section}>
          <p className={styles.msgErr}>Sem permissão para criar PMOC.</p>
        </div>
      ) : (
        <form className={styles.section} onSubmit={onCreate}>
          <h2 className={styles.sectionTitle}>Cliente do estabelecimento</h2>
          <input
            className={loginStyles.input}
            placeholder="Buscar cliente por nome, documento ou cidade"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Buscar cliente"
          />
          {err ? <p className={styles.msgErr}>{err}</p> : null}
          {loading ? <p className={styles.loading}>Carregando clientes…</p> : null}
          {!loading ? (
            <div style={{ marginTop: "0.65rem" }}>
              <label htmlFor="pmoc-client-select" className={styles.metaMuted}>
                Selecione o cliente cujo endereço será coberto por este PMOC
              </label>
              <select
                id="pmoc-client-select"
                className={loginStyles.input}
                style={{ marginTop: "0.35rem" }}
                value={clientId === "" ? "" : String(clientId)}
                onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">— Escolha —</option>
                {rows.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.address_city ? ` — ${c.address_city}/${c.address_state ?? ""}` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <h2 className={styles.sectionTitle} style={{ marginTop: "1rem" }}>
            Identificação do plano
          </h2>
          <input
            className={loginStyles.input}
            placeholder="Título do PMOC (ex.: PMOC — Empresa XYZ)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Título do PMOC"
          />

          {saveErr ? <p className={styles.msgErr}>{saveErr}</p> : null}
          <div className={styles.actions}>
            <button type="submit" className={styles.btnPrimary} disabled={saving}>
              {saving ? "Criando…" : "Criar rascunho"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
