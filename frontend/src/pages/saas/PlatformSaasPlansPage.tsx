import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  createPlatformSaasPlan,
  deletePlatformSaasPlan,
  listPlatformSaasPlans,
  patchPlatformSaasPlan,
  type FinanceModeCap,
  type SaasPlanCatalogRow,
} from "../../api/platformSaasPlans";
import tableStyles from "../listTableCommon.module.css";
import styles from "./SaasDashboardPage.module.css";

const FINANCE_MODE_LABELS: Record<FinanceModeCap, string> = {
  basic: "Financeiro básico (teto)",
  intermediate: "Intermediário (teto)",
  management: "Gestão completa (teto)",
};

function emptyDraft(): {
  plan_key: string;
  display_name: string;
  description: string;
  footnote: string;
  finance_max_mode: FinanceModeCap;
  max_users: string;
  sort_order: string;
  is_beta_internal: boolean;
  can_contract: boolean;
  is_selectable_for_tenants: boolean;
  show_in_matrix: boolean;
} {
  return {
    plan_key: "",
    display_name: "",
    description: "",
    footnote: "",
    finance_max_mode: "basic",
    max_users: "",
    sort_order: "0",
    is_beta_internal: false,
    can_contract: true,
    is_selectable_for_tenants: true,
    show_in_matrix: true,
  };
}

export function PlatformSaasPlansPage() {
  const [rows, setRows] = useState<SaasPlanCatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await listPlatformSaasPlans());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar o catálogo de planos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startCreate() {
    setCreating(true);
    setEditingKey(null);
    setDraft(emptyDraft());
    setMsg(null);
  }

  function selectRow(key: string) {
    const r = rows.find((x) => x.plan_key === key);
    if (!r) return;
    setCreating(false);
    setEditingKey(key);
    setDraft({
      plan_key: r.plan_key,
      display_name: r.display_name,
      description: r.description,
      footnote: r.footnote,
      finance_max_mode: r.finance_max_mode,
      max_users: r.max_users != null ? String(r.max_users) : "",
      sort_order: String(r.sort_order),
      is_beta_internal: r.is_beta_internal,
      can_contract: r.can_contract,
      is_selectable_for_tenants: r.is_selectable_for_tenants,
      show_in_matrix: r.show_in_matrix,
    });
    setMsg(null);
  }

  function cancelEdit() {
    setCreating(false);
    setEditingKey(null);
    setDraft(emptyDraft());
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const sortOrder = Number.parseInt(draft.sort_order.trim(), 10);
    const maxUsersRaw = draft.max_users.trim();
    const maxUsersParsed = maxUsersRaw === "" ? null : Number.parseInt(maxUsersRaw, 10);
    if (Number.isNaN(sortOrder)) {
      setMsg({ kind: "err", text: "Ordem de exibição inválida." });
      setSaving(false);
      return;
    }
    if (maxUsersParsed !== null && (Number.isNaN(maxUsersParsed) || maxUsersParsed < 1)) {
      setMsg({ kind: "err", text: "Limite de usuários deve ser vazio (ilimitado / padrão) ou um número ≥ 1." });
      setSaving(false);
      return;
    }
    try {
      if (creating) {
        const pk = draft.plan_key.trim();
        if (!pk) {
          setMsg({ kind: "err", text: "Informe a chave do plano (ex.: team_2026)." });
          setSaving(false);
          return;
        }
        await createPlatformSaasPlan({
          plan_key: pk,
          display_name: draft.display_name.trim(),
          description: draft.description,
          footnote: draft.footnote,
          finance_max_mode: draft.finance_max_mode,
          max_users: maxUsersParsed,
          sort_order: sortOrder,
          is_beta_internal: draft.is_beta_internal,
          can_contract: draft.can_contract,
          is_selectable_for_tenants: draft.is_selectable_for_tenants,
          show_in_matrix: draft.show_in_matrix,
        });
        setMsg({ kind: "ok", text: "Plano criado." });
        await load();
        cancelEdit();
      } else if (editingKey) {
        await patchPlatformSaasPlan(editingKey, {
          display_name: draft.display_name.trim(),
          description: draft.description,
          footnote: draft.footnote,
          finance_max_mode: draft.finance_max_mode,
          max_users: maxUsersParsed,
          sort_order: sortOrder,
          is_beta_internal: draft.is_beta_internal,
          can_contract: draft.can_contract,
          is_selectable_for_tenants: draft.is_selectable_for_tenants,
          show_in_matrix: draft.show_in_matrix,
        });
        setMsg({ kind: "ok", text: "Alterações salvas." });
        await load();
        selectRow(editingKey);
      }
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Falha ao salvar." });
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!editingKey) return;
    const ok = window.confirm(
      `Excluir o plano "${editingKey}"? Só é permitido se nenhum workspace estiver usando esta chave.`,
    );
    if (!ok) return;
    setSaving(true);
    setMsg(null);
    try {
      await deletePlatformSaasPlan(editingKey);
      setMsg({ kind: "ok", text: "Plano removido." });
      await load();
      cancelEdit();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Não foi possível excluir." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.panel}>
      <section className={styles.heroCard} aria-labelledby="plans-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Climaris · Operação</p>
          <h1 id="plans-title" className={styles.heroTitle}>
            Catálogo de planos SaaS
          </h1>
          <p className={styles.heroLead}>
            Defina nomes, textos da matriz financeira, teto do modo financeiro e limites de usuário. Novos planos podem ser
            adicionados e associados aos workspaces em <strong>Clientes SaaS</strong>.
          </p>
        </div>
        <div className={styles.heroAccent} aria-hidden />
      </section>

      {error ? (
        <p className={styles.note} role="alert">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className={msg.kind === "ok" ? styles.note : styles.note} role="status">
          {msg.text}
        </p>
      ) : null}

      <section className={styles.card}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center", marginBottom: "1rem" }}>
          <button type="button" className={styles.linkPrimary} style={{ border: "none", cursor: "pointer", padding: "0.5rem 1rem" }} onClick={() => void load()} disabled={loading}>
            {loading ? "Carregando…" : "Recarregar"}
          </button>
          <button
            type="button"
            className={styles.linkPrimary}
            style={{ border: "none", cursor: "pointer", padding: "0.5rem 1rem" }}
            onClick={startCreate}
            disabled={loading}
          >
            Novo plano
          </button>
        </div>

        {loading && !rows.length ? (
          <p className={styles.note}>Carregando catálogo…</p>
        ) : (
          <div className={tableStyles.tableWrap}>
            <table className={tableStyles.table} width="100%">
              <thead>
                <tr>
                  <th className={tableStyles.th}>Chave</th>
                  <th className={tableStyles.th}>Nome</th>
                  <th className={tableStyles.th}>Teto financeiro</th>
                  <th className={tableStyles.th}>Ordem</th>
                  <th className={tableStyles.th}>Matriz</th>
                  <th className={tableStyles.th}>Seletor clientes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.plan_key}
                    onClick={() => selectRow(r.plan_key)}
                    style={{
                      cursor: "pointer",
                      background: editingKey === r.plan_key ? "rgba(11, 127, 175, 0.08)" : undefined,
                    }}
                  >
                    <td className={tableStyles.td}>
                      <code className={styles.inlineCode}>{r.plan_key}</code>
                    </td>
                    <td className={tableStyles.td}>{r.display_name}</td>
                    <td className={tableStyles.td}>{FINANCE_MODE_LABELS[r.finance_max_mode]}</td>
                    <td className={tableStyles.td}>{r.sort_order}</td>
                    <td className={tableStyles.td}>{r.show_in_matrix ? "Sim" : "Não"}</td>
                    <td className={tableStyles.td}>{r.is_selectable_for_tenants ? "Sim" : "Não"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {(creating || editingKey) && (
        <section className={styles.card} aria-labelledby="plan-form-title">
          <h2 id="plan-form-title" className={styles.cardTitle}>
            {creating ? "Novo plano" : `Editar: ${editingKey}`}
          </h2>
          <form onSubmit={onSubmit} className={styles.grid2} style={{ gridTemplateColumns: "1fr" }}>
            {creating ? (
              <label className={styles.metaRow} style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem" }}>
                <span className={styles.metaKey}>Chave (slug)</span>
                <input
                  className={styles.inlineCode}
                  style={{ padding: "0.5rem", fontSize: "1rem", width: "100%", maxWidth: "28rem" }}
                  value={draft.plan_key}
                  onChange={(e) => setDraft((d) => ({ ...d, plan_key: e.target.value }))}
                  placeholder="ex.: team_2026"
                  autoComplete="off"
                />
              </label>
            ) : null}
            <label className={styles.metaRow} style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem" }}>
              <span className={styles.metaKey}>Nome de exibição</span>
              <input
                style={{ padding: "0.5rem", fontSize: "1rem", width: "100%", maxWidth: "28rem" }}
                value={draft.display_name}
                onChange={(e) => setDraft((d) => ({ ...d, display_name: e.target.value }))}
                required
              />
            </label>
            <label className={styles.metaRow} style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem" }}>
              <span className={styles.metaKey}>Descrição (card da matriz)</span>
              <textarea
                style={{ padding: "0.5rem", fontSize: "1rem", width: "100%", minHeight: "4rem" }}
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              />
            </label>
            <label className={styles.metaRow} style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem" }}>
              <span className={styles.metaKey}>Rodapé / upsell</span>
              <textarea
                style={{ padding: "0.5rem", fontSize: "1rem", width: "100%", minHeight: "3rem" }}
                value={draft.footnote}
                onChange={(e) => setDraft((d) => ({ ...d, footnote: e.target.value }))}
              />
            </label>
            <label className={styles.metaRow} style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem" }}>
              <span className={styles.metaKey}>Teto do modo financeiro (plano)</span>
              <select
                style={{ padding: "0.5rem", fontSize: "1rem", maxWidth: "28rem" }}
                value={draft.finance_max_mode}
                onChange={(e) => setDraft((d) => ({ ...d, finance_max_mode: e.target.value as FinanceModeCap }))}
              >
                <option value="basic">{FINANCE_MODE_LABELS.basic}</option>
                <option value="intermediate">{FINANCE_MODE_LABELS.intermediate}</option>
                <option value="management">{FINANCE_MODE_LABELS.management}</option>
              </select>
            </label>
            <label className={styles.metaRow} style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem" }}>
              <span className={styles.metaKey}>Máx. usuários (vazio = ilimitado ou padrão do código)</span>
              <input
                style={{ padding: "0.5rem", fontSize: "1rem", maxWidth: "12rem" }}
                value={draft.max_users}
                onChange={(e) => setDraft((d) => ({ ...d, max_users: e.target.value }))}
                inputMode="numeric"
              />
            </label>
            <label className={styles.metaRow} style={{ flexDirection: "column", alignItems: "stretch", gap: "0.35rem" }}>
              <span className={styles.metaKey}>Ordem na lista / matriz</span>
              <input
                style={{ padding: "0.5rem", fontSize: "1rem", maxWidth: "12rem" }}
                value={draft.sort_order}
                onChange={(e) => setDraft((d) => ({ ...d, sort_order: e.target.value }))}
                inputMode="numeric"
              />
            </label>
            <div className={styles.metaRow} style={{ flexWrap: "wrap", gap: "1rem" }}>
              <label>
                <input
                  type="checkbox"
                  checked={draft.is_beta_internal}
                  onChange={(e) => setDraft((d) => ({ ...d, is_beta_internal: e.target.checked }))}
                />{" "}
                Plano interno / equipe
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.can_contract}
                  onChange={(e) => setDraft((d) => ({ ...d, can_contract: e.target.checked }))}
                />{" "}
                Pode ser contratado (comercial)
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.is_selectable_for_tenants}
                  onChange={(e) => setDraft((d) => ({ ...d, is_selectable_for_tenants: e.target.checked }))}
                />{" "}
                Aparece no seletor de plano (Clientes SaaS)
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.show_in_matrix}
                  onChange={(e) => setDraft((d) => ({ ...d, show_in_matrix: e.target.checked }))}
                />{" "}
                Mostrar na matriz do painel
              </label>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button
                type="submit"
                disabled={saving}
                style={{ padding: "0.5rem 1.25rem", cursor: saving ? "wait" : "pointer" }}
              >
                {saving ? "Salvando…" : "Salvar"}
              </button>
              {!creating ? (
                <button type="button" disabled={saving} style={{ padding: "0.5rem 1.25rem" }} onClick={onDelete}>
                  Excluir
                </button>
              ) : null}
              <button type="button" disabled={saving} style={{ padding: "0.5rem 1.25rem" }} onClick={cancelEdit}>
                Cancelar
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
