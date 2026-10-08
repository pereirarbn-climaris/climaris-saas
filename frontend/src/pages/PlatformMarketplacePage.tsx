import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  bootstrapFinanceMarketplaceApps,
  createPlatformMarketplaceApp,
  listPlatformMarketplaceApps,
  listPlatformMarketplaceEntitlements,
  patchPlatformMarketplaceApp,
  patchPlatformMarketplaceEntitlement,
  type PlatformMarketplaceApp,
  type PlatformMarketplaceEntitlement,
} from "../api/platformMarketplace";
import tableStyles from "./listTableCommon.module.css";
import dash from "./PlatformMarketplacePage.module.css";
import styles from "./saas/SaasDashboardPage.module.css";

const STATUS_OPTS = [
  { value: "", label: "Todos os status" },
  { value: "requested", label: "Solicitado" },
  { value: "active", label: "Ativo" },
  { value: "suspended", label: "Suspenso" },
  { value: "cancelled", label: "Cancelado" },
] as const;

function fmtMoney(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function PlatformMarketplacePage() {
  const [apps, setApps] = useState<PlatformMarketplaceApp[]>([]);
  const [entitlements, setEntitlements] = useState<PlatformMarketplaceEntitlement[]>([]);
  const [pendingEntitlements, setPendingEntitlements] = useState<PlatformMarketplaceEntitlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tenantFilter, setTenantFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [releasingId, setReleasingId] = useState<number | null>(null);

  const [createSlug, setCreateSlug] = useState("");
  const [createName, setCreateName] = useState("");
  const [createShort, setCreateShort] = useState("");
  const [createMonthly, setCreateMonthly] = useState("");
  const [createFlag, setCreateFlag] = useState("");
  const [createAllowQuantity, setCreateAllowQuantity] = useState(false);
  const [createUnitLabel, setCreateUnitLabel] = useState("");
  const [createUserSeatsPerUnit, setCreateUserSeatsPerUnit] = useState("0");
  const [creating, setCreating] = useState(false);
  const [bootstrappingFinanceApps, setBootstrappingFinanceApps] = useState(false);

  const refreshApps = useCallback(async () => {
    const list = await listPlatformMarketplaceApps({ include_inactive: true });
    setApps(list);
  }, []);

  const refreshEntitlements = useCallback(async () => {
    const tid = tenantFilter.trim() ? Number(tenantFilter.trim()) : undefined;
    const list = await listPlatformMarketplaceEntitlements({
      tenant_id: tid !== undefined && Number.isFinite(tid) && tid > 0 ? tid : undefined,
      status: statusFilter || undefined,
      limit: 200,
    });
    setEntitlements(list);
  }, [tenantFilter, statusFilter]);

  const refreshPendingEntitlements = useCallback(async () => {
    const list = await listPlatformMarketplaceEntitlements({
      status: "requested",
      limit: 200,
    });
    setPendingEntitlements(list);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await Promise.all([refreshApps(), refreshEntitlements(), refreshPendingEntitlements()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar.");
    } finally {
      setLoading(false);
    }
  }, [refreshApps, refreshEntitlements, refreshPendingEntitlements]);

  async function liberarModulo(entitlementId: number) {
    setReleasingId(entitlementId);
    setMsg(null);
    try {
      await patchPlatformMarketplaceEntitlement(entitlementId, { status: "active" });
      setMsg({ kind: "ok", text: "Módulo liberado. O cliente já pode usar a integração no workspace." });
      await Promise.all([refreshEntitlements(), refreshPendingEntitlements()]);
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao liberar." });
    } finally {
      setReleasingId(null);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function onCreateApp(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const monthly = Number(createMonthly.replace(",", "."));
    if (!createSlug.trim() || !createName.trim() || !createShort.trim() || !createFlag.trim()) {
      setMsg({ kind: "err", text: "Preencha slug, nome, descrição curta e feature flag." });
      return;
    }
    if (!Number.isFinite(monthly) || monthly < 0) {
      setMsg({ kind: "err", text: "Preço mensal inválido." });
      return;
    }
    setCreating(true);
    try {
      await createPlatformMarketplaceApp({
        slug: createSlug.trim().toLowerCase(),
        display_name: createName.trim(),
        short_description: createShort.trim(),
        monthly_price_brl: monthly,
        setup_fee_brl: 0,
        feature_flag_key: createFlag.trim(),
        allow_quantity: createAllowQuantity,
        unit_label: createAllowQuantity ? createUnitLabel.trim() || "unidade" : null,
        user_seats_per_unit: Math.max(0, Number(createUserSeatsPerUnit || "0")),
        sort_order: 20,
        is_active: true,
      });
      setMsg({ kind: "ok", text: "App criado." });
      setCreateSlug("");
      setCreateName("");
      setCreateShort("");
      setCreateMonthly("");
      setCreateFlag("");
      setCreateAllowQuantity(false);
      setCreateUnitLabel("");
      setCreateUserSeatsPerUnit("0");
      await refreshApps();
    } catch (err2) {
      setMsg({ kind: "err", text: err2 instanceof Error ? err2.message : "Falha ao criar." });
    } finally {
      setCreating(false);
    }
  }

  async function toggleAppActive(app: PlatformMarketplaceApp) {
    setMsg(null);
    try {
      await patchPlatformMarketplaceApp(app.id, { is_active: !app.is_active });
      await refreshApps();
      setMsg({ kind: "ok", text: "App atualizado." });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao atualizar." });
    }
  }

  async function bootstrapFinanceApps() {
    setBootstrappingFinanceApps(true);
    setMsg(null);
    try {
      const created = await bootstrapFinanceMarketplaceApps();
      setMsg({ kind: "ok", text: `Apps financeiros prontos (${created.length}).` });
      await refreshApps();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao preparar apps financeiros." });
    } finally {
      setBootstrappingFinanceApps(false);
    }
  }

  return (
    <div className={styles.panel}>
      <header className={styles.heroCard}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Marketplace</p>
          <h1 className={styles.heroTitle}>Loja de integrações</h1>
          <p className={styles.heroLead}>
            Cadastre apps no catálogo global e <strong>libere solicitações pendentes</strong> na fila abaixo. Ao marcar como{" "}
            <strong>Ativo</strong>, o cliente passa a ter direito ao módulo (ex.: Mercado Livre).
          </p>
        </div>
        <div className={styles.heroAccent} aria-hidden />
      </header>

      {loading ? <p className={styles.heroLead}>Carregando…</p> : null}
      {error ? (
        <p role="alert" className={styles.statusErr}>
          {error}
        </p>
      ) : null}
      {msg?.kind === "ok" ? (
        <p role="status" className={styles.statusOk}>
          {msg.text}
        </p>
      ) : null}
      {msg?.kind === "err" ? (
        <p role="alert" className={styles.statusErr}>
          {msg.text}
        </p>
      ) : null}

      <section className={`${styles.card} ${dash.pendingSection}`} aria-labelledby="pending-marketplace-title">
        <h2 id="pending-marketplace-title" className={dash.pendingTitle}>
          Fila de liberação {pendingEntitlements.length > 0 ? `(${pendingEntitlements.length})` : ""}
        </h2>
        <p className={dash.pendingLead}>
          Workspaces que solicitaram um add-on na loja aparecem aqui como <strong>Solicitado</strong>. Use{" "}
          <strong>Liberar módulo</strong> após confirmar pagamento ou contrato — o status passa para <strong>Ativo</strong> no
          sistema.
        </p>
        {pendingEntitlements.length === 0 && !loading ? (
          <p className={dash.emptyPending}>Nenhuma solicitação pendente no momento.</p>
        ) : null}
        {pendingEntitlements.length > 0 ? (
          <div className={tableStyles.tableWrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>Workspace</th>
                  <th>Integração</th>
                  <th>Solicitado em</th>
                  <th>Obs. cliente</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {pendingEntitlements.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{row.tenant_name}</div>
                      <div className={styles.metaKey} style={{ fontSize: "0.75rem" }}>
                        Tenant id {row.tenant_id}
                      </div>
                    </td>
                    <td>
                      <div>{row.app_display_name}</div>
                      <code className={styles.inlineCode} style={{ fontSize: "0.75rem" }}>
                        {row.app_slug}
                      </code>
                    </td>
                    <td>{fmtDate(row.requested_at)}</td>
                    <td className={styles.notesCell}>
                      {row.tenant_notes ?? "—"}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={dash.releaseBtn}
                        disabled={releasingId === row.id}
                        onClick={() => void liberarModulo(row.id)}
                      >
                        {releasingId === row.id ? "Liberando…" : "Liberar módulo"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Catálogo (apps)</h2>
        <div className={styles.rowEnd}>
          <button
            type="button"
            onClick={() => void bootstrapFinanceApps()}
            disabled={bootstrappingFinanceApps}
            className={styles.btnSecondary}
          >
            {bootstrappingFinanceApps ? "Preparando..." : "Criar apps financeiros padrão"}
          </button>
        </div>
        <div className={tableStyles.tableWrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Slug</th>
                <th>Nome</th>
                <th>Mensal (R$)</th>
                <th>Qtd</th>
                <th>Feature flag</th>
                <th>Ativo</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id}>
                  <td>
                    <code className={styles.inlineCode}>{a.slug}</code>
                  </td>
                  <td>{a.display_name}</td>
                  <td>{fmtMoney(a.monthly_price_brl)}</td>
                  <td>{a.allow_quantity ? `${a.unit_label ?? "unidade"} (seats: ${a.user_seats_per_unit})` : "fixo"}</td>
                  <td>
                    <code className={styles.inlineCode}>{a.feature_flag_key}</code>
                  </td>
                  <td>
                    <label>
                      <input type="checkbox" checked={a.is_active} onChange={() => void toggleAppActive(a)} /> visível na loja
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <form onSubmit={onCreateApp} className={styles.formGrid}>
          <h3 className={styles.linksTitle}>
            Novo app
          </h3>
          <label className={styles.field}>
            <span className={styles.metaKey}>Slug</span>
            <input
              className={styles.fieldInput}
              value={createSlug}
              onChange={(e) => setCreateSlug(e.target.value)}
              placeholder="ex.: amazon_marketplace"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.metaKey}>Nome</span>
            <input
              className={styles.fieldInput}
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="Nome exibido na loja"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.metaKey}>Descrição curta</span>
            <input
              className={styles.fieldInput}
              value={createShort}
              onChange={(e) => setCreateShort(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.metaKey}>Preço mensal (R$)</span>
            <input
              className={styles.fieldInput}
              value={createMonthly}
              onChange={(e) => setCreateMonthly(e.target.value)}
              placeholder="0"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.metaKey}>Chave da feature flag</span>
            <input
              className={styles.fieldInput}
              value={createFlag}
              onChange={(e) => setCreateFlag(e.target.value)}
              placeholder="integration_mercado_livre"
            />
          </label>
          <label className={styles.field}>
            <span className={styles.metaKey}>Permite quantidade</span>
            <input
              type="checkbox"
              checked={createAllowQuantity}
              onChange={(e) => setCreateAllowQuantity(e.target.checked)}
            />
          </label>
          {createAllowQuantity ? (
            <>
              <label className={styles.field}>
                <span className={styles.metaKey}>Rótulo da unidade</span>
                <input
                  className={styles.fieldInput}
                  value={createUnitLabel}
                  onChange={(e) => setCreateUnitLabel(e.target.value)}
                  placeholder="usuário"
                />
              </label>
              <label className={styles.field}>
                <span className={styles.metaKey}>Acessos por unidade</span>
                <input
                  className={styles.fieldInput}
                  value={createUserSeatsPerUnit}
                  onChange={(e) => setCreateUserSeatsPerUnit(e.target.value)}
                  placeholder="1"
                />
              </label>
            </>
          ) : null}
          <button type="submit" disabled={creating} className={styles.btnPrimarySolid}>
            {creating ? "Criando…" : "Cadastrar app"}
          </button>
        </form>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Todas as solicitações (filtros)</h2>
        <div className={styles.filtersRow}>
          <label>
            <span className={`${styles.metaKey} ${styles.fieldInline}`}>
              Tenant ID
            </span>
            <input
              className={styles.inputSmNarrow}
              value={tenantFilter}
              onChange={(e) => setTenantFilter(e.target.value)}
              placeholder="opcional"
            />
          </label>
          <label>
            <span className={`${styles.metaKey} ${styles.fieldInline}`}>
              Status
            </span>
            <select className={styles.inputSm} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              {STATUS_OPTS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => void refreshEntitlements()} className={styles.btnSecondary}>
            Aplicar filtros
          </button>
        </div>

        <div className={tableStyles.tableWrap}>
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Tenant</th>
                <th>App</th>
                <th>Status</th>
                <th>Atualizado</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {entitlements.map((row) => (
                <EntitlementRow
                  key={row.id}
                  row={row}
                  onSaved={() => void Promise.all([refreshEntitlements(), refreshPendingEntitlements()])}
                  onMessage={setMsg}
                  onLiberar={(id) => void liberarModulo(id)}
                  releasingId={releasingId}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function EntitlementRow({
  row,
  onSaved,
  onMessage,
  onLiberar,
  releasingId,
}: {
  row: PlatformMarketplaceEntitlement;
  onSaved: () => void;
  onMessage: (m: { kind: "ok" | "err"; text: string } | null) => void;
  onLiberar: (id: number) => void;
  releasingId: number | null;
}) {
  const [status, setStatus] = useState(row.status);
  const [quantity, setQuantity] = useState(String(row.quantity || 1));
  const [notes, setNotes] = useState(row.internal_notes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStatus(row.status);
    setQuantity(String(row.quantity || 1));
    setNotes(row.internal_notes ?? "");
  }, [row.status, row.quantity, row.internal_notes, row.id]);

  async function save() {
    setSaving(true);
    onMessage(null);
    try {
      await patchPlatformMarketplaceEntitlement(row.id, {
        status: status as "requested" | "active" | "suspended" | "cancelled",
        quantity: Math.max(1, Number.parseInt(quantity || "1", 10) || 1),
        internal_notes: notes.trim() || null,
      });
      onMessage({ kind: "ok", text: "Status atualizado." });
      onSaved();
    } catch (e) {
      onMessage({ kind: "err", text: e instanceof Error ? e.message : "Falha ao salvar." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600 }}>{row.tenant_name}</div>
        <div className={`${styles.metaKey} ${styles.tableSubtle}`}>
          id {row.tenant_id}
        </div>
      </td>
      <td>
        <div>{row.app_display_name}</div>
        <code className={`${styles.inlineCode} ${styles.tableSubtle}`}>
          {row.app_slug}
        </code>
      </td>
      <td>
        <input
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className={styles.inputSmNarrow}
          style={{ marginBottom: 8 }}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={styles.inputSm}>
          <option value="requested">Solicitado</option>
          <option value="active">Ativo</option>
          <option value="suspended">Suspenso</option>
          <option value="cancelled">Cancelado</option>
        </select>
        <div className={styles.rowActions}>
          {row.status === "requested" ? (
            <button
              type="button"
              className={dash.releaseBtn}
              disabled={releasingId === row.id}
              onClick={() => onLiberar(row.id)}
            >
              {releasingId === row.id ? "…" : "Liberar"}
            </button>
          ) : null}
          <button type="button" onClick={() => void save()} disabled={saving} className={styles.btnTiny}>
            {saving ? "…" : "Salvar"}
          </button>
        </div>
      </td>
      <td>{fmtDate(row.updated_at)}</td>
      <td>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className={styles.textareaSmall}
          placeholder="Interno"
        />
        {row.tenant_notes ? (
          <div className={`${styles.metaKey} ${styles.tableSubtle}`}>
            Cliente: {row.tenant_notes}
          </div>
        ) : null}
      </td>
    </tr>
  );
}
