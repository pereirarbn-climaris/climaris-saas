import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { deleteAllTrustedDevices, deleteTrustedDevice, listTrustedDevices } from "../../api/auth";
import type { DashboardOutletContext } from "../dashboardContext";
import styles from "./TrustedDevicesPage.module.css";

function fmt(d: string): string {
  try {
    return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return d;
  }
}

export function TrustedDevicesPage() {
  const { user } = useOutletContext<DashboardOutletContext>();
  const isAdmin = user.role === "admin";
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listTrustedDevices>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function load() {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRows(await listTrustedDevices());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar dispositivos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <section className={styles.page}>
        <p className={styles.muted}>Disponível apenas para administradores do workspace.</p>
        <Link className={styles.back} to="/app">
          Voltar ao painel
        </Link>
      </section>
    );
  }

  if (loading) {
    return (
      <section className={styles.page}>
        <p className={styles.muted}>Carregando...</p>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <Link className={styles.back} to="/app">
        ← Voltar ao painel
      </Link>
      <header className={styles.header}>
        <h1>Dispositivos confiáveis</h1>
        <p>
          Sessões que podem pular o código 2FA por e-mail após você marcar &quot;Confiar neste dispositivo&quot; no login. Revogue se trocar de
          computador ou suspeitar de acesso indevido.
        </p>
      </header>

      {msg ? <div className={styles.msgOk}>{msg}</div> : null}
      {error ? <div className={styles.msgErr}>{error}</div> : null}

      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.btnDanger}
          disabled={working || rows.length === 0}
          onClick={() => {
            if (!window.confirm("Revogar todos os dispositivos confiáveis? No próximo login será necessário o código 2FA.")) return;
            setWorking(true);
            setMsg(null);
            setError(null);
            void (async () => {
              try {
                await deleteAllTrustedDevices();
                setMsg("Todos os dispositivos foram revogados.");
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Falha ao revogar.");
              } finally {
                setWorking(false);
              }
            })();
          }}
        >
          Revogar todos
        </button>
      </div>

      {rows.length === 0 ? (
        <p className={styles.muted}>Nenhum dispositivo confiável ativo. Eles aparecem após um login com 2FA e a opção de confiar no navegador.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Situação</th>
              <th>Criado</th>
              <th>Último uso</th>
              <th>Expira</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.is_current_browser ? <span className={styles.badge}>Este navegador</span> : <span className={styles.muted}>Outro</span>}
                </td>
                <td>{fmt(r.created_at)}</td>
                <td>{r.last_used_at ? fmt(r.last_used_at) : "—"}</td>
                <td>{fmt(r.expires_at)}</td>
                <td>
                  <button
                    type="button"
                    className={styles.btnRow}
                    disabled={working}
                    onClick={() => {
                      setWorking(true);
                      setMsg(null);
                      setError(null);
                      void (async () => {
                        try {
                          await deleteTrustedDevice(r.id);
                          setMsg("Dispositivo revogado.");
                          await load();
                        } catch (e) {
                          setError(e instanceof Error ? e.message : "Falha ao revogar.");
                        } finally {
                          setWorking(false);
                        }
                      })();
                    }}
                  >
                    Revogar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
