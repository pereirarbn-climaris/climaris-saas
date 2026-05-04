import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  disconnectWhatsapp,
  getWhatsappConnection,
  getWhatsappMessageSettings,
  getWhatsappReminderRules,
  listWhatsappJobs,
  patchWhatsappMessageSettings,
  patchWhatsappReminderRules,
  setupWhatsappConnection,
  type WhatsappAppointmentMessageSettings,
  type WhatsappMessageJob,
  type WhatsappReminderRules,
  type WhatsappTenantConnection,
} from "../../api/whatsapp";
import type { DashboardOutletContext } from "../dashboardContext";
import styles from "./WhatsappIntegrationPage.module.css";

/** Evolution às vezes envia base64 puro, data URL completa ou URL — evita prefixo duplicado que quebra o <img>. */
function qrCodeDataUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = raw.trim().replace(/\s+/g, "");
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^data:image\//i.test(s)) {
    const lower = s.toLowerCase();
    const n = lower.split("base64,").length - 1;
    if (n > 1) {
      const idx = s.lastIndexOf("base64,");
      const payload = s.slice(idx + "base64,".length);
      return `data:image/png;base64,${payload}`;
    }
    return s;
  }
  if (s.startsWith("/9j")) return `data:image/jpeg;base64,${s}`;
  if (s.startsWith("iVBOR")) return `data:image/png;base64,${s}`;
  return `data:image/png;base64,${s}`;
}

function isConnectedStatus(status: string | null | undefined): boolean {
  const x = (status ?? "").toLowerCase();
  return x === "connected" || x === "open";
}

function statusLabel(status: string | null | undefined): { text: string; cls: string } {
  const s = (status ?? "").toLowerCase();
  if (!s || s === "not_configured") return { text: "Não configurado", cls: styles.badgeMuted };
  if (s === "connected" || s === "open")
    return { text: s === "open" ? "Conectado (aberto)" : "Conectado", cls: styles.badgeOk };
  if (s === "connecting") return { text: "Aguardando QR", cls: styles.badgeWarn };
  if (s === "close" || s === "closed") return { text: "Desconectado", cls: styles.badgeErr };
  return { text: status ?? "—", cls: styles.badgeMuted };
}

function jobStatusPt(s: string): string {
  const m: Record<string, string> = {
    pending: "Pendente",
    queued: "Na fila",
    sending: "Enviando",
    sent: "Enviado",
    delivered: "Entregue",
    read: "Lido",
    failed: "Falhou",
  };
  return m[s] ?? s;
}

export function WhatsappIntegrationPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const role = ctx?.user.role;
  const isAdmin = role === "admin";
  const canConfigure = isAdmin;
  const canViewMessaging = role === "admin" || role === "receptionist";

  const [connection, setConnection] = useState<WhatsappTenantConnection | null>(null);
  const [msgSettings, setMsgSettings] = useState<WhatsappAppointmentMessageSettings | null>(null);
  const [rules, setRules] = useState<WhatsappReminderRules | null>(null);
  const [jobs, setJobs] = useState<WhatsappMessageJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [instanceOverride, setInstanceOverride] = useState("");

  const [tplBody, setTplBody] = useState("");
  const [kwConfirm, setKwConfirm] = useState("");
  const [kwReschedule, setKwReschedule] = useState("");
  const [savingMsg, setSavingMsg] = useState(false);

  const [r15, setR15] = useState(false);
  const [r30, setR30] = useState(false);
  const [r1h, setR1h] = useState(false);
  const [r1d, setR1d] = useState(false);
  const [rCustomOn, setRCustomOn] = useState(false);
  const [rCustomMin, setRCustomMin] = useState<number | "">("");
  const [savingRules, setSavingRules] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  /** Mantém o último QR retornado pelo setup — o GET /connection não devolve base64 de novo. */
  const [qrRawForModal, setQrRawForModal] = useState<string | null>(null);
  const [pairingForModal, setPairingForModal] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const conn = await getWhatsappConnection();
      setConnection(conn);
      if (canViewMessaging) {
        const [ms, rs, jb] = await Promise.all([
          getWhatsappMessageSettings(),
          getWhatsappReminderRules(),
          listWhatsappJobs({ limit: 15 }),
        ]);
        setMsgSettings(ms);
        setTplBody(ms.template_body);
        setKwConfirm(ms.confirm_keyword);
        setKwReschedule(ms.reschedule_keyword);
        setRules(rs);
        setR15(rs.offset_15m);
        setR30(rs.offset_30m);
        setR1h(rs.offset_1h);
        setR1d(rs.offset_1d);
        setRCustomOn(rs.custom_enabled);
        setRCustomMin(rs.custom_minutes ?? "");
        setJobs(jb);
      } else {
        setMsgSettings(null);
        setRules(null);
        setJobs([]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao carregar.");
      setConnection(null);
    } finally {
      setLoading(false);
    }
  }, [canViewMessaging]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!qrModalOpen || !connection?.instance_name) return;
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const conn = await getWhatsappConnection();
          setConnection((prev) => ({
            ...conn,
            qrcode_base64: conn.qrcode_base64 ?? prev?.qrcode_base64 ?? null,
          }));
          if (isConnectedStatus(conn.status)) {
            setQrModalOpen(false);
            setQrRawForModal(null);
            setPairingForModal(null);
            await refresh();
          }
        } catch {
          /* ignorar falhas pontuais do poll */
        }
      })();
    }, 2800);
    return () => clearInterval(id);
  }, [qrModalOpen, connection?.instance_name, refresh]);

  useEffect(() => {
    if (!qrModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setQrModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qrModalOpen]);

  async function onConnect() {
    if (!canConfigure) return;
    setBusy(true);
    setErr("");
    try {
      const name = instanceOverride.trim() || undefined;
      const next = await setupWhatsappConnection(name || null);
      setConnection(next);
      const raw = next.qrcode_base64?.trim() || null;
      if (raw && !isConnectedStatus(next.status)) {
        setQrRawForModal(raw);
        setPairingForModal(next.pairing_code?.trim() || null);
        setQrModalOpen(true);
      } else {
        setPairingForModal(next.pairing_code?.trim() || null);
        if (isConnectedStatus(next.status)) {
          setQrModalOpen(false);
          setQrRawForModal(null);
          setPairingForModal(null);
        } else if (next.pairing_code?.trim() && !isConnectedStatus(next.status)) {
          setQrModalOpen(true);
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao conectar.");
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnect() {
    if (!canConfigure || !window.confirm("Desconectar WhatsApp deste workspace na Evolution?")) return;
    setBusy(true);
    setErr("");
    try {
      const next = await disconnectWhatsapp();
      setConnection(next);
      setQrModalOpen(false);
      setQrRawForModal(null);
      setPairingForModal(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao desconectar.");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveMessages() {
    if (!canConfigure) return;
    setSavingMsg(true);
    setErr("");
    try {
      const ms = await patchWhatsappMessageSettings({
        template_body: tplBody.trim(),
        confirm_keyword: kwConfirm.trim(),
        reschedule_keyword: kwReschedule.trim(),
      });
      setMsgSettings(ms);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao salvar mensagens.");
    } finally {
      setSavingMsg(false);
    }
  }

  async function onSaveRules() {
    if (!canConfigure) return;
    setSavingRules(true);
    setErr("");
    try {
      const minutes =
        rCustomOn && rCustomMin !== "" && typeof rCustomMin === "number" && rCustomMin > 0 ? rCustomMin : null;
      const rs = await patchWhatsappReminderRules({
        offset_15m: r15,
        offset_30m: r30,
        offset_1h: r1h,
        offset_1d: r1d,
        custom_enabled: rCustomOn,
        custom_minutes: minutes,
      });
      setRules(rs);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falha ao salvar regras.");
    } finally {
      setSavingRules(false);
    }
  }

  const st = statusLabel(connection?.status);
  const isLinked =
    connection &&
    connection.instance_name &&
    ["connected", "open"].includes((connection.status ?? "").toLowerCase());
  const qrSrc = qrCodeDataUrl(qrRawForModal || connection?.qrcode_base64);
  const showQrAgain =
    canConfigure &&
    Boolean(qrSrc || pairingForModal) &&
    !isLinked &&
    !qrModalOpen &&
    (connection?.status ?? "").toLowerCase() === "connecting";

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>Integrações</p>
          <h1 className={styles.heroTitle}>WhatsApp (Evolution)</h1>
          <p className={styles.heroLead}>
            Conecte o número da empresa para lembretes e mensagens automáticas. Administradores gerenciam a conexão e as
            regras; recepção pode acompanhar o status e o histórico de envios.
          </p>
          <p className={styles.heroLead} style={{ marginTop: "0.75rem" }}>
            <Link to="/app" className={styles.btnGhost} style={{ color: "#ecfdf5", borderColor: "rgba(255,255,255,0.35)" }}>
              Voltar ao painel
            </Link>
          </p>
        </div>
      </header>

      {err ? <div className={styles.errBox}>{err}</div> : null}

      {loading ? (
        <p className={styles.hint}>Carregando…</p>
      ) : (
        <>
          <div className={styles.grid}>
            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Conexão</h2>
              <div className={styles.row}>
                <span className={`${styles.badge} ${st.cls}`}>{st.text}</span>
                {connection?.instance_name ? (
                  <span className={styles.mono}>Instância: {connection.instance_name}</span>
                ) : null}
              </div>
              {isLinked ? (
                <p className={styles.hint}>
                  Sessão ativa. Não é necessário escanear QR novamente enquanto o número permanecer conectado na Evolution.
                </p>
              ) : null}
              {!isLinked && (connection?.status ?? "").toLowerCase() === "connecting" ? (
                <p className={styles.hint}>
                  O código QR abre em uma janela ao clicar em &quot;Conectar / atualizar QR&quot;. Assim que o WhatsApp
                  conectar, a janela fecha sozinha.
                </p>
              ) : null}
              {showQrAgain ? (
                <div className={styles.actions} style={{ marginTop: "0.5rem" }}>
                  <button type="button" className={styles.btnGhost} onClick={() => setQrModalOpen(true)}>
                    Mostrar QR novamente
                  </button>
                </div>
              ) : null}
              {!isLinked &&
              (connection?.status ?? "").toLowerCase() === "connecting" &&
              !qrSrc &&
              !pairingForModal ? (
                <p className={styles.hint}>
                  Aguardando dados do QR. Clique em &quot;Conectar / atualizar QR&quot; ou atualize o status.
                </p>
              ) : null}

              {canConfigure ? (
                <>
                  <label className={styles.fieldLabel} htmlFor="wa-instance">
                    Nome da instância (opcional)
                  </label>
                  <input
                    id="wa-instance"
                    className={styles.textInput}
                    value={instanceOverride}
                    onChange={(e) => setInstanceOverride(e.target.value)}
                    placeholder="Deixe vazio para usar o padrão do workspace"
                    autoComplete="off"
                  />
                  <div className={styles.actions}>
                    <button type="button" className={styles.btnPrimary} disabled={busy} onClick={() => void onConnect()}>
                      {busy ? "Processando…" : "Conectar / atualizar QR"}
                    </button>
                    <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => void refresh()}>
                      Atualizar status
                    </button>
                    <button
                      type="button"
                      className={styles.btnDanger}
                      disabled={busy || !connection?.instance_name}
                      onClick={() => void onDisconnect()}
                    >
                      Desconectar
                    </button>
                  </div>
                </>
              ) : (
                <div className={styles.actions}>
                  <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => void refresh()}>
                    Atualizar status
                  </button>
                </div>
              )}
            </section>

            {canViewMessaging && msgSettings ? (
              <section className={styles.card}>
                <h2 className={styles.cardTitle}>Mensagem de agendamento</h2>
                <p className={styles.hint}>
                  Variáveis permitidas: {msgSettings.allowed_variables.join(", ")}
                </p>
                <label className={styles.fieldLabel} htmlFor="wa-tpl">
                  Corpo do template
                </label>
                <textarea
                  id="wa-tpl"
                  className={styles.textarea}
                  value={tplBody}
                  onChange={(e) => setTplBody(e.target.value)}
                  disabled={!canConfigure}
                />
                <label className={styles.fieldLabel} htmlFor="wa-kw1">
                  Palavra para confirmar
                </label>
                <input
                  id="wa-kw1"
                  className={styles.textInput}
                  value={kwConfirm}
                  onChange={(e) => setKwConfirm(e.target.value)}
                  disabled={!canConfigure}
                />
                <label className={styles.fieldLabel} htmlFor="wa-kw2">
                  Palavra para reagendar
                </label>
                <input
                  id="wa-kw2"
                  className={styles.textInput}
                  value={kwReschedule}
                  onChange={(e) => setKwReschedule(e.target.value)}
                  disabled={!canConfigure}
                />
                {canConfigure ? (
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.btnPrimary}
                      disabled={savingMsg}
                      onClick={() => void onSaveMessages()}
                    >
                      {savingMsg ? "Salvando…" : "Salvar mensagens"}
                    </button>
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>

          {canViewMessaging && rules ? (
            <section className={styles.card} style={{ marginBottom: "1.25rem" }}>
              <h2 className={styles.cardTitle}>Lembretes automáticos (antes do horário)</h2>
              <p className={styles.hint}>
                Ativos agora (minutos): {rules.active_offsets_minutes.length ? rules.active_offsets_minutes.join(", ") : "—"}
              </p>
              <div className={styles.checkGrid}>
                <label className={styles.checkRow}>
                  <input type="checkbox" checked={r15} onChange={(e) => setR15(e.target.checked)} disabled={!canConfigure} />
                  15 minutos
                </label>
                <label className={styles.checkRow}>
                  <input type="checkbox" checked={r30} onChange={(e) => setR30(e.target.checked)} disabled={!canConfigure} />
                  30 minutos
                </label>
                <label className={styles.checkRow}>
                  <input type="checkbox" checked={r1h} onChange={(e) => setR1h(e.target.checked)} disabled={!canConfigure} />
                  1 hora
                </label>
                <label className={styles.checkRow}>
                  <input type="checkbox" checked={r1d} onChange={(e) => setR1d(e.target.checked)} disabled={!canConfigure} />
                  1 dia
                </label>
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={rCustomOn}
                    onChange={(e) => setRCustomOn(e.target.checked)}
                    disabled={!canConfigure}
                  />
                  Personalizado (minutos antes)
                </label>
              </div>
              {rCustomOn ? (
                <>
                  <label className={styles.fieldLabel} htmlFor="wa-custom-min">
                    Minutos
                  </label>
                  <input
                    id="wa-custom-min"
                    type="number"
                    min={1}
                    className={styles.textInput}
                    value={rCustomMin}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRCustomMin(v === "" ? "" : Number(v));
                    }}
                    disabled={!canConfigure}
                  />
                </>
              ) : null}
              {canConfigure ? (
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    disabled={savingRules}
                    onClick={() => void onSaveRules()}
                  >
                    {savingRules ? "Salvando…" : "Salvar regras"}
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

          {canViewMessaging && jobs.length > 0 ? (
            <section className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Destino</th>
                    <th>Status</th>
                    <th>Mensagem</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id}>
                      <td className={styles.mono}>{new Date(j.created_at).toLocaleString()}</td>
                      <td>{j.recipient_whatsapp}</td>
                      <td>{jobStatusPt(j.status)}</td>
                      <td>{j.rendered_message.slice(0, 120)}{j.rendered_message.length > 120 ? "…" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
        </>
      )}

      {qrModalOpen ? (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="wa-qr-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setQrModalOpen(false);
          }}
        >
          <div className={styles.modalPanel} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.modalClose}
              aria-label="Fechar"
              onClick={() => setQrModalOpen(false)}
            >
              ×
            </button>
            <h2 id="wa-qr-modal-title" className={styles.modalTitle}>
              Conectar WhatsApp
            </h2>
            <div className={styles.modalBody}>
              {qrSrc ? (
                <div className={styles.modalQr}>
                  <img src={qrSrc} alt="QR Code para conectar o WhatsApp" width={280} height={280} />
                </div>
              ) : pairingForModal ? (
                <p className={styles.modalHint}>Use o código de pareamento abaixo neste aparelho.</p>
              ) : (
                <p className={styles.modalHint}>
                  Gerando QR… Se nada aparecer, feche e clique em &quot;Conectar / atualizar QR&quot; de novo.
                </p>
              )}
              <p className={styles.modalHint}>
                No celular: WhatsApp → menu (⋮) → Aparelhos conectados → Conectar um aparelho → escaneie o código.
              </p>
              {pairingForModal ? (
                <p className={styles.modalPairing}>
                  Código de pareamento: <span className={styles.mono}>{pairingForModal}</span>
                </p>
              ) : null}
              <p className={styles.modalHint} style={{ marginTop: "0.75rem", fontSize: "0.78rem" }}>
                Esta janela fecha automaticamente quando a conexão for detectada.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
