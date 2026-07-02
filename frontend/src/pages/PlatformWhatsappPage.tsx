import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  disconnectPlatformWhatsappConnection,
  getPlatformWhatsappConnection,
  getPlatformWhatsappSettings,
  sendPlatformWhatsappText,
  setupPlatformWhatsappConnection,
  type PlatformWhatsappConnection,
  type PlatformWhatsappProvider,
  type PlatformWhatsappSettings,
} from "../api/platformWhatsapp";
import styles from "./PlatformWhatsappPage.module.css";

type Tab = "conexao" | "demonstracoes" | "envio";

function qrCodeDataUrl(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = raw.trim().replace(/\s+/g, "");
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^data:image\//i.test(s)) return s;
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
  if (s === "connected" || s === "open") return { text: "Conectado", cls: styles.badgeOk };
  if (s === "connecting") return { text: "Aguardando QR", cls: styles.badgeWarn };
  if (s === "close" || s === "closed") return { text: "Desconectado", cls: styles.badgeErr };
  return { text: status ?? "—", cls: styles.badgeMuted };
}

function formatOperatorSource(source: string): string {
  if (source === "env") return "Variável PLATFORM_OPERATOR_WHATSAPP";
  if (source === "website_settings") return "Telefone do site institucional";
  return "Não configurado";
}

function providerLabel(provider: PlatformWhatsappProvider): string {
  return provider === "official" ? "API oficial (Meta)" : "Evolution";
}

export function PlatformWhatsappPage() {
  const [tab, setTab] = useState<Tab>("conexao");
  const [connection, setConnection] = useState<PlatformWhatsappConnection | null>(null);
  const [settings, setSettings] = useState<PlatformWhatsappSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [instanceOverride, setInstanceOverride] = useState("");
  const [selectedProvider, setSelectedProvider] = useState<PlatformWhatsappProvider>("evolution");
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrRawForModal, setQrRawForModal] = useState<string | null>(null);
  const [pairingForModal, setPairingForModal] = useState<string | null>(null);
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false);
  const [sendNumber, setSendNumber] = useState("");
  const [sendBody, setSendBody] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const st = await getPlatformWhatsappSettings();
      const provider = st.default_provider ?? "evolution";
      setSelectedProvider(provider);
      const conn = await getPlatformWhatsappConnection(provider);
      setConnection(conn);
      setSettings(st);
      setInstanceOverride((current) => (current.trim() ? current : st.evolution_instance_name || ""));
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Erro ao carregar WhatsApp." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!qrModalOpen || selectedProvider !== "evolution" || !connection?.instance_name) return;
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const conn = await getPlatformWhatsappConnection(selectedProvider);
          setConnection(conn);
          if (isConnectedStatus(conn.status)) {
            setQrModalOpen(false);
            setQrRawForModal(null);
            setPairingForModal(null);
            setMessage({ kind: "ok", text: "WhatsApp conectado com sucesso." });
          }
        } catch {
          /* poll silencioso */
        }
      })();
    }, 2800);
    return () => clearInterval(id);
  }, [qrModalOpen, connection?.instance_name, selectedProvider]);

  async function onProviderChange(nextProvider: PlatformWhatsappProvider) {
    setSelectedProvider(nextProvider);
    setQrModalOpen(false);
    setQrRawForModal(null);
    setPairingForModal(null);
    setMessage(null);
    setLoading(true);
    try {
      const conn = await getPlatformWhatsappConnection(nextProvider);
      setConnection(conn);
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Falha ao carregar provedor." });
    } finally {
      setLoading(false);
    }
  }

  async function onConnect() {
    setBusy(true);
    setMessage(null);
    try {
      const next = await setupPlatformWhatsappConnection(
        selectedProvider,
        selectedProvider === "evolution" ? instanceOverride.trim() || null : null,
      );
      setConnection(next);
      const raw = next.qrcode_base64?.trim() || null;
      if (selectedProvider === "evolution" && raw && !isConnectedStatus(next.status)) {
        setQrRawForModal(raw);
        setPairingForModal(next.pairing_code?.trim() || null);
        setQrModalOpen(true);
      } else if (isConnectedStatus(next.status)) {
        setMessage({ kind: "ok", text: `${providerLabel(selectedProvider)} conectado.` });
      } else if (selectedProvider === "evolution" && next.pairing_code?.trim()) {
        setPairingForModal(next.pairing_code.trim());
        setQrModalOpen(true);
      }
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Falha ao conectar." });
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnect() {
    setDisconnectModalOpen(false);
    setBusy(true);
    setMessage(null);
    try {
      const next = await disconnectPlatformWhatsappConnection(selectedProvider);
      setConnection(next);
      setQrModalOpen(false);
      setMessage({
        kind: "ok",
        text:
          selectedProvider === "official"
            ? "API oficial não usa desconexão por QR/sessão."
            : "WhatsApp desconectado.",
      });
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Falha ao desconectar." });
    } finally {
      setBusy(false);
    }
  }

  function askDisconnectConfirmation() {
    if (busy) return;
    setDisconnectModalOpen(true);
  }

  async function onSendFreeText() {
    if (!sendNumber.trim() || !sendBody.trim()) {
      setMessage({ kind: "err", text: "Informe número e mensagem." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await sendPlatformWhatsappText({
        provider: selectedProvider,
        recipient_whatsapp: sendNumber.trim(),
        message: sendBody.trim(),
      });
      setMessage({ kind: "ok", text: `Mensagem enviada via ${providerLabel(selectedProvider)}.` });
      setSendBody("");
    } catch (e) {
      setMessage({ kind: "err", text: e instanceof Error ? e.message : "Falha ao enviar." });
    } finally {
      setBusy(false);
    }
  }

  const badge = statusLabel(connection?.status);

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Operação · Comunicação</p>
        <h2 className={styles.title}>WhatsApp da operação</h2>
        <p className={styles.lead}>
          Conexão WhatsApp da operação (Evolution ou API oficial) usada para confirmações de demonstração,
          alertas à equipe comercial e envios manuais. Integrado à{" "}
          <Link to="/operacao/agenda-demonstracoes">agenda de demonstrações</Link>.
        </p>
      </section>

      {message ? (
        <p className={`${styles.message} ${message.kind === "ok" ? styles.messageOk : styles.messageErr}`}>
          {message.text}
        </p>
      ) : null}

      <div className={styles.tabs}>
        {(
          [
            ["conexao", "Conexão"],
            ["demonstracoes", "Demonstrações"],
            ["envio", "Envio manual"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`${styles.tab} ${tab === key ? styles.tabActive : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? <p>Carregando…</p> : null}

      {!loading && tab === "conexao" ? (
        <div className={styles.card}>
          <h3>Conexão do provedor</h3>
          <div className={styles.field}>
            <label htmlFor="wa-provider">Provedor</label>
            <select
              id="wa-provider"
              value={selectedProvider}
              onChange={(e) => void onProviderChange(e.target.value as PlatformWhatsappProvider)}
              disabled={busy}
            >
              {(settings?.available_providers ?? (["evolution", "official"] as PlatformWhatsappProvider[])).map((provider) => (
                <option key={provider} value={provider}>
                  {providerLabel(provider)}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.metaGrid}>
            <p>
              <span>Status</span>
              <span className={`${styles.badge} ${badge.cls}`}>{badge.text}</span>
            </p>
            <p>
              <span>{selectedProvider === "official" ? "Phone Number ID" : "Instância"}</span>
              {connection?.instance_name || settings?.evolution_instance_name || "—"}
            </p>
            <p>
              <span>Configuração</span>
              {selectedProvider === "official"
                ? connection?.official_configured
                  ? "API oficial configurada"
                  : "API oficial não configurada (env)"
                : connection?.evolution_configured
                  ? "Evolution configurada"
                  : "Evolution não configurada (env)"}
            </p>
            <p>
              <span>Alertas à operação</span>
              {settings?.operator_whatsapp ?? "—"}
              <br />
              <small style={{ color: "#94a3b8" }}>
                {formatOperatorSource(settings?.operator_whatsapp_source ?? "none")}
              </small>
            </p>
          </div>

          {selectedProvider === "evolution" ? (
            <div className={styles.field}>
              <label htmlFor="wa-instance">Nome da instância</label>
              <input
                id="wa-instance"
                value={instanceOverride}
                onChange={(e) => setInstanceOverride(e.target.value)}
                placeholder="climaris-platform"
              />
            </div>
          ) : null}

          <div className={styles.actions}>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy} onClick={() => void onConnect()}>
              {busy ? "Conectando…" : selectedProvider === "official" ? "Validar conexão" : "Conectar / gerar QR"}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDanger}`}
              disabled={busy}
              onClick={askDisconnectConfirmation}
            >
              Desconectar
            </button>
            <button
              type="button"
              className={styles.btn}
              disabled={busy}
              onClick={() => void onProviderChange(selectedProvider)}
            >
              Atualizar status
            </button>
          </div>
        </div>
      ) : null}

      {!loading && tab === "demonstracoes" ? (
        <div className={styles.card}>
          <h3>Notificações automáticas</h3>
          <p style={{ margin: "0 0 1rem", color: "#64748b", fontSize: "0.88rem", lineHeight: 1.55 }}>
            Ao agendar pelo site, o lead e a operação recebem WhatsApp. Ao alterar o status na agenda
            (confirmar, cancelar, realizar, faltou), o lead recebe mensagem automática.
          </p>
          <div className={styles.field}>
            <label>Mensagem ao lead (agendamento)</label>
            <pre className={styles.preview}>{settings?.demo_client_message_preview}</pre>
          </div>
          <div className={styles.field}>
            <label>Alerta à operação (novo agendamento)</label>
            <pre className={styles.preview}>{settings?.demo_operator_message_preview}</pre>
          </div>
          <p style={{ margin: 0, fontSize: "0.82rem", color: "#94a3b8" }}>
            O número da operação vem de <code>PLATFORM_OPERATOR_WHATSAPP</code> ou do telefone do site
            institucional.
          </p>
        </div>
      ) : null}

      {!loading && tab === "envio" ? (
        <div className={styles.card}>
          <h3>Enviar mensagem</h3>
          <div className={styles.field}>
            <label htmlFor="wa-send-number">WhatsApp do destinatário</label>
            <input
              id="wa-send-number"
              value={sendNumber}
              onChange={(e) => setSendNumber(e.target.value)}
              placeholder="(16) 99999-9999"
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="wa-send-body">Mensagem</label>
            <textarea
              id="wa-send-body"
              value={sendBody}
              onChange={(e) => setSendBody(e.target.value)}
              placeholder="Texto livre enviado pela instância da operação…"
            />
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={busy}
              onClick={() => void onSendFreeText()}
            >
              {busy ? "Enviando…" : "Enviar WhatsApp"}
            </button>
          </div>
        </div>
      ) : null}

      {qrModalOpen ? (
        <div className={styles.modalBackdrop} role="presentation" onClick={() => setQrModalOpen(false)}>
          <div className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Conectar WhatsApp</h3>
            {qrRawForModal ? (
              <img className={styles.qrImg} src={qrCodeDataUrl(qrRawForModal) ?? undefined} alt="QR Code WhatsApp" />
            ) : null}
            {pairingForModal ? <p className={styles.pairing}>Código de pareamento: <strong>{pairingForModal}</strong></p> : null}
            <p style={{ fontSize: "0.82rem", color: "#64748b", textAlign: "center" }}>
              Escaneie no celular ou use o código. Esta janela fecha ao conectar.
            </p>
            <div className={styles.actions} style={{ justifyContent: "center" }}>
              <button type="button" className={styles.btn} onClick={() => setQrModalOpen(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {disconnectModalOpen ? (
        <div className={styles.modalBackdrop} role="presentation" onClick={() => setDisconnectModalOpen(false)}>
          <div className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Desconectar WhatsApp</h3>
            <p className={styles.modalText}>
              {selectedProvider === "official"
                ? "A API oficial não possui desconexão por sessão. Deseja apenas confirmar?"
                : "Tem certeza que deseja desconectar o WhatsApp da operação na Evolution?"}
            </p>
            <div className={styles.actions} style={{ justifyContent: "center" }}>
              <button type="button" className={styles.btn} disabled={busy} onClick={() => setDisconnectModalOpen(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnDanger}`}
                disabled={busy}
                onClick={() => void onDisconnect()}
              >
                Confirmar desconexao
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
