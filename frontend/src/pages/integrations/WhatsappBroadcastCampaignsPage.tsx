import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  createWhatsappBroadcastCampaign,
  deleteWhatsappBroadcastCampaign,
  listWhatsappBroadcastCampaignRuns,
  listWhatsappBroadcastCampaigns,
  patchWhatsappBroadcastCampaign,
  previewWhatsappBroadcastCampaign,
  runWhatsappBroadcastCampaign,
  type WhatsappBroadcastCampaign,
  type WhatsappBroadcastCampaignPreview,
  type WhatsappBroadcastCampaignRun,
} from "../../api/whatsappBroadcastCampaigns";
import { getWhatsappModuleStatus, type WhatsappModuleStatus } from "../../api/whatsapp";
import type { DashboardOutletContext } from "../dashboardContext";
import styles from "./WhatsappIntegrationPage.module.css";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

const SEGMENT_OPTIONS: { value: string; label: string; hint: string }[] = [
  {
    value: "inactive_no_os_recent",
    label: "Clientes sem OS concluída recente",
    hint: "Exclui quem tem ordem de serviço concluída nos últimos N dias (parâmetro inactive_days).",
  },
  {
    value: "open_budgets",
    label: "Orçamentos em aberto (não viraram OS)",
    hint: "Orçamentos com status escolhido, criados há pelo menos N dias, sem OS gerada.",
  },
];

export function WhatsappBroadcastCampaignsPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const role = ctx?.user.role;
  const isAdmin = role === "admin";
  const canView = role === "admin" || role === "receptionist";

  const [moduleStatus, setModuleStatus] = useState<WhatsappModuleStatus | null>(null);
  const [campaigns, setCampaigns] = useState<WhatsappBroadcastCampaign[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [preview, setPreview] = useState<WhatsappBroadcastCampaignPreview | null>(null);
  const [runs, setRuns] = useState<WhatsappBroadcastCampaignRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const [newName, setNewName] = useState("Reativação trimestral");
  const [newSegment, setNewSegment] = useState("inactive_no_os_recent");
  const [newMessage, setNewMessage] = useState(
    "Olá {nome_cliente}! Aqui é da {empresa}. Faz tempo que não nos vemos — quer renovar a revisão do ar-condicionado? Responda esta mensagem.",
  );
  const [newParamsJson, setNewParamsJson] = useState('{\n  "inactive_days": 120,\n  "respect_preventive_opt_out": true\n}');

  const selected = campaigns.find((c) => c.id === selectedId) ?? null;

  const refresh = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setErr("");
    try {
      const mod = await getWhatsappModuleStatus();
      setModuleStatus(mod);
      if (!mod.entitlement_active) {
        setCampaigns([]);
        return;
      }
      const list = await listWhatsappBroadcastCampaigns();
      setCampaigns(list);
      setSelectedId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar.");
      setModuleStatus(null);
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedId || !moduleStatus?.entitlement_active) {
      setPreview(null);
      setRuns([]);
      return;
    }
    void (async () => {
      try {
        const [pr, rs] = await Promise.all([
          previewWhatsappBroadcastCampaign(selectedId, 15),
          listWhatsappBroadcastCampaignRuns(selectedId, 20),
        ]);
        setPreview(pr);
        setRuns(rs);
      } catch {
        setPreview(null);
        setRuns([]);
      }
    })();
  }, [selectedId, moduleStatus?.entitlement_active, campaigns.length]);

  async function onCreate() {
    if (!isAdmin) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      let segmentParams: Record<string, unknown> = {};
      try {
        segmentParams = newParamsJson.trim() ? (JSON.parse(newParamsJson) as Record<string, unknown>) : {};
      } catch {
        throw new Error("JSON de parâmetros inválido.");
      }
      const c = await createWhatsappBroadcastCampaign({
        name: newName.trim(),
        message_template: newMessage.trim(),
        segment_kind: newSegment,
        segment_params: segmentParams,
      });
      setCampaigns((prev) => [c, ...prev]);
      setSelectedId(c.id);
      setOk("Campanha criada.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao criar.");
    } finally {
      setBusy(false);
    }
  }

  async function onToggleEnabled(c: WhatsappBroadcastCampaign) {
    if (!isAdmin) return;
    setBusy(true);
    setErr("");
    try {
      const next = await patchWhatsappBroadcastCampaign(c.id, { enabled: !c.enabled });
      setCampaigns((rows) => rows.map((x) => (x.id === c.id ? next : x)));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao atualizar.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(c: WhatsappBroadcastCampaign) {
    if (!isAdmin || !window.confirm(`Excluir campanha "${c.name}"?`)) return;
    setBusy(true);
    setErr("");
    try {
      await deleteWhatsappBroadcastCampaign(c.id);
      setCampaigns((rows) => rows.filter((x) => x.id !== c.id));
      if (selectedId === c.id) setSelectedId(null);
      setOk("Campanha excluída.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao excluir.");
    } finally {
      setBusy(false);
    }
  }

  async function onRefreshPreview() {
    if (!selectedId) return;
    setBusy(true);
    setErr("");
    try {
      const pr = await previewWhatsappBroadcastCampaign(selectedId, 20);
      setPreview(pr);
      setOk("Prévia atualizada.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha na prévia.");
    } finally {
      setBusy(false);
    }
  }

  async function onRun() {
    if (!isAdmin || !selectedId) return;
    if (!window.confirm("Enviar mensagem agora para todos os destinatários elegíveis (até o limite da campanha)?")) return;
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const result = await runWhatsappBroadcastCampaign(selectedId);
      setCampaigns((rows) => rows.map((x) => (x.id === result.campaign.id ? result.campaign : x)));
      const rs = await listWhatsappBroadcastCampaignRuns(selectedId, 20);
      setRuns(rs);
      setOk(
        `Envio concluído: ${result.run.sent_ok} enviados, ${result.run.sent_failed} falhas, ` +
          `${result.run.skipped_cooldown} ignorados (cooldown), ${result.run.skipped_no_phone} sem WhatsApp.`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha no envio.");
    } finally {
      setBusy(false);
    }
  }

  if (!canView) {
    return (
      <div className={styles.page}>
        <div className={styles.errBox}>Você não tem permissão para ver esta página.</div>
        <Link to="/app" className={styles.btnGhost}>
          Voltar ao painel
        </Link>
      </div>
    );
  }

  if (!loading && moduleStatus && !moduleStatus.entitlement_active) {
    return (
      <div className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroInner}>
            <p className={styles.eyebrow}>Integrações</p>
            <h1 className={styles.heroTitle}>Campanhas WhatsApp</h1>
            <p className={styles.heroLead}>Disponível após liberação do módulo WhatsApp.</p>
            <p className={styles.heroLead} style={{ marginTop: "0.75rem" }}>
              <Link to="/app/marketplace" className={styles.btnGhost} style={{ color: "#ecfdf5", borderColor: "rgba(255,255,255,0.35)" }}>
                Abrir Loja de integrações
              </Link>
            </p>
          </div>
        </header>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Acesso bloqueado</h2>
          <p className={styles.hint}>
            {moduleStatus.blocked_reason ?? "Módulo WhatsApp não contratado ou pendente de aprovação."}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>Integrações</p>
          <h1 className={styles.heroTitle}>Campanhas WhatsApp</h1>
          <p className={styles.heroLead}>
            Reative clientes sem serviço recente ou lembre orçamentos em aberto. Use{" "}
            <code className={styles.mono}>{"{nome_cliente}"}</code> e <code className={styles.mono}>{"{empresa}"}</code> na mensagem.
            Opcionalmente respeita o opt-out de campanha preventiva do cadastro do cliente.
          </p>
          <p className={styles.heroLead} style={{ marginTop: "0.75rem" }}>
            <Link to="/app/integrations/whatsapp" className={styles.btnGhost} style={{ color: "#ecfdf5", borderColor: "rgba(255,255,255,0.35)" }}>
              Conexão WhatsApp
            </Link>
            <Link to="/app/integrations/whatsapp-bot" className={styles.btnGhost} style={{ color: "#ecfdf5", borderColor: "rgba(255,255,255,0.35)", marginLeft: "0.5rem" }}>
              Bot WhatsApp
            </Link>
          </p>
        </div>
      </header>

      {err ? <div className={styles.errBox}>{err}</div> : null}
      {ok ? <div className={styles.card} style={{ marginBottom: "1rem", color: "#15803d" }}>{ok}</div> : null}

      {loading ? (
        <p className={styles.hint}>Carregando…</p>
      ) : (
        <div className={styles.grid}>
          <section className={styles.card}>
            <h2 className={styles.cardTitle}>Campanhas</h2>
            {campaigns.length ? (
              <ul className={styles.hint} style={{ listStyle: "none", padding: 0, margin: "0.75rem 0 0" }}>
                {campaigns.map((c) => (
                  <li key={c.id} style={{ marginBottom: "0.5rem" }}>
                    <button
                      type="button"
                      className={styles.btnGhost}
                      style={{ fontWeight: selectedId === c.id ? 700 : 400 }}
                      onClick={() => {
                        setSelectedId(c.id);
                        setOk("");
                      }}
                    >
                      {c.name}
                    </button>
                    <span className={styles.mono} style={{ marginLeft: "0.35rem" }}>
                      {c.enabled ? "ativa" : "pausada"}
                    </span>
                    {isAdmin ? (
                      <>
                        <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => void onToggleEnabled(c)}>
                          {c.enabled ? "Pausar" : "Ativar"}
                        </button>
                        <button type="button" className={styles.btnDanger} disabled={busy} onClick={() => void onDelete(c)}>
                          Excluir
                        </button>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.hint}>Nenhuma campanha ainda. Crie uma ao lado (admin).</p>
            )}
          </section>

          {isAdmin ? (
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Nova campanha</h2>
              <label className={styles.fieldLabel} htmlFor="camp-name">
                Nome
              </label>
              <input id="camp-name" className={styles.textInput} value={newName} onChange={(e) => setNewName(e.target.value)} />
              <label className={styles.fieldLabel} htmlFor="camp-seg" style={{ marginTop: "0.75rem" }}>
                Público
              </label>
              <select id="camp-seg" className={styles.textInput} value={newSegment} onChange={(e) => setNewSegment(e.target.value)}>
                {SEGMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className={styles.hint}>{SEGMENT_OPTIONS.find((x) => x.value === newSegment)?.hint}</p>
              <label className={styles.fieldLabel} htmlFor="camp-msg" style={{ marginTop: "0.75rem" }}>
                Mensagem
              </label>
              <textarea id="camp-msg" className={styles.textarea} rows={5} value={newMessage} onChange={(e) => setNewMessage(e.target.value)} />
              <label className={styles.fieldLabel} htmlFor="camp-par" style={{ marginTop: "0.75rem" }}>
                Parâmetros (JSON)
              </label>
              <textarea id="camp-par" className={styles.textarea} rows={6} value={newParamsJson} onChange={(e) => setNewParamsJson(e.target.value)} />
              <div className={styles.actions}>
                <button type="button" className={styles.btnPrimary} disabled={busy} onClick={() => void onCreate()}>
                  Criar campanha
                </button>
              </div>
            </section>
          ) : null}

          {selected ? (
            <section className={styles.card} style={{ gridColumn: "1 / -1" }}>
              <h2 className={styles.cardTitle}>Detalhe: {selected.name}</h2>
              <p className={styles.hint}>
                Slug <span className={styles.mono}>{selected.slug}</span> · Limite {selected.max_recipients_per_run} · Cooldown{" "}
                {selected.cooldown_days} dias
              </p>
              <p className={styles.hint}>Último envio: {formatDateTime(selected.last_run_at)}</p>
              <h3 className={styles.cardTitle} style={{ marginTop: "1rem", fontSize: "1rem" }}>
                Prévia do público
              </h3>
              <p className={styles.hint}>
                Estimativa total: <strong>{preview?.estimated_total ?? "—"}</strong> clientes
              </p>
              <div className={styles.actions}>
                <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => void onRefreshPreview()}>
                  Atualizar prévia
                </button>
                {isAdmin ? (
                  <button type="button" className={styles.btnPrimary} disabled={busy || !selected.enabled} onClick={() => void onRun()}>
                    Enviar agora (admin)
                  </button>
                ) : null}
              </div>
              {preview?.sample?.length ? (
                <div className={styles.tableWrap} style={{ marginTop: "0.75rem" }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th>WhatsApp</th>
                        <th>Prévia da mensagem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sample.map((s) => (
                        <tr key={s.client_id}>
                          <td>{s.name}</td>
                          <td>{s.whatsapp_ok ? s.destination_preview : "—"}</td>
                          <td className={styles.mono} style={{ whiteSpace: "pre-wrap", maxWidth: "28rem" }}>
                            {s.message_preview}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={styles.hint}>Sem amostras (público vazio ou ainda carregando).</p>
              )}

              <h3 className={styles.cardTitle} style={{ marginTop: "1.25rem", fontSize: "1rem" }}>
                Histórico de execuções
              </h3>
              {runs.length ? (
                <div className={styles.tableWrap} style={{ marginTop: "0.5rem" }}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Quando</th>
                        <th>Status</th>
                        <th>Planejado</th>
                        <th>OK</th>
                        <th>Falha</th>
                        <th>Cooldown</th>
                        <th>Sem WA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runs.map((r) => (
                        <tr key={r.id}>
                          <td>{formatDateTime(r.started_at)}</td>
                          <td>{r.status}</td>
                          <td>{r.planned}</td>
                          <td>{r.sent_ok}</td>
                          <td>{r.sent_failed}</td>
                          <td>{r.skipped_cooldown}</td>
                          <td>{r.skipped_no_phone}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={styles.hint}>Nenhuma execução registrada.</p>
              )}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
