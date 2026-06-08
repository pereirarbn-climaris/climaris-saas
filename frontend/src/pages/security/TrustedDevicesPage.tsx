import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  deleteAllTrustedDevices,
  deleteTrustedDevice,
  listTrustedDevices,
  type TrustedDeviceOut,
} from "../../api/auth";
import { ToastHost } from "../../components/ToastHost";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { DeleteConfirmModal } from "../../components/ui/delete-confirm-modal";
import { toast } from "../../lib/toast";
import type { DashboardOutletContext } from "../dashboardContext";
import layout from "../admin/ManagementView.module.css";
import styles from "./TrustedDevicesPage.module.css";

function DevicesHeaderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 9h.01" />
      <path d="M11 9h6" />
      <path d="M7 13h10" />
    </svg>
  );
}

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
  const [rows, setRows] = useState<TrustedDeviceOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<TrustedDeviceOut | null>(null);

  const load = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setRows(await listTrustedDevices());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar dispositivos.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRevokeAll() {
    setWorking(true);
    try {
      await deleteAllTrustedDevices();
      setRevokeAllOpen(false);
      await load();
      toast.success("Todos os dispositivos foram revogados.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao revogar dispositivos.");
    } finally {
      setWorking(false);
    }
  }

  async function onRevokeOne() {
    if (!revokeTarget) return;
    setWorking(true);
    try {
      await deleteTrustedDevice(revokeTarget.id);
      setRevokeTarget(null);
      await load();
      toast.success("Dispositivo revogado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao revogar dispositivo.");
    } finally {
      setWorking(false);
    }
  }

  if (!isAdmin) {
    return (
      <section className={layout.wrap}>
        <Card>
          <CardContent className={styles.cardStack}>
            <p className={styles.muted}>Disponível apenas para administradores do workspace.</p>
            <Link to="/app" style={{ textDecoration: "none", width: "fit-content" }}>
              <Button type="button" variant="outline" size="sm">
                Voltar ao painel
              </Button>
            </Link>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className={layout.wrap} aria-labelledby="trusted-devices-title">
      <ToastHost />

      <DeleteConfirmModal
        open={revokeAllOpen}
        onOpenChange={(open) => {
          if (!open && !working) setRevokeAllOpen(false);
        }}
        title="Revogar todos os dispositivos"
        description="Revogar todos os dispositivos confiáveis? No próximo login será necessário o código 2FA por e-mail em cada navegador."
        confirmLabel="Revogar todos"
        busyLabel="Revogando…"
        busy={working}
        onConfirm={() => void onRevokeAll()}
      />

      <DeleteConfirmModal
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open && !working) setRevokeTarget(null);
        }}
        title="Revogar dispositivo"
        description={
          revokeTarget?.is_current_browser
            ? "Revogar a confiança deste navegador? Você precisará do código 2FA no próximo login aqui."
            : "Revogar a confiança deste dispositivo? O usuário precisará do código 2FA no próximo acesso por ele."
        }
        confirmLabel="Revogar"
        busyLabel="Revogando…"
        busy={working}
        onConfirm={() => void onRevokeOne()}
      />

      <header className={layout.pageHeader}>
        <nav className={layout.breadcrumb} aria-label="Navegação">
          <Link to="/app" className={layout.breadcrumbCurrent}>
            Painel
          </Link>
          <span className={layout.breadcrumbSep} aria-hidden>
            /
          </span>
          <span>Dispositivos confiáveis</span>
        </nav>
        <div className={layout.pageHeaderMain}>
          <span className={layout.pageHeaderIcon} aria-hidden>
            <DevicesHeaderIcon />
          </span>
          <div className={layout.pageHeaderText}>
            <h1 id="trusted-devices-title" className={layout.pageTitle}>
              Dispositivos confiáveis
            </h1>
            <p className={layout.pageLead}>
              Sessões que podem pular o código 2FA por e-mail após marcar &quot;Confiar neste dispositivo&quot; no login.
              Revogue se trocar de computador ou suspeitar de acesso indevido.
            </p>
          </div>
        </div>
      </header>

      <Card>
        <CardContent className={styles.cardStack}>
          <div className={layout.sectionHeaderRow}>
            <div>
              <h2 className={layout.sectionTitle}>Sessões ativas</h2>
              <p className={layout.sectionLead}>
                {loading ? "Carregando…" : `${rows.length} dispositivo(s) confiável(is).`}
              </p>
            </div>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={working || loading || rows.length === 0}
              onClick={() => setRevokeAllOpen(true)}
            >
              Revogar todos
            </Button>
          </div>

          {!loading && rows.length === 0 ? (
            <p className={styles.empty}>
              Nenhum dispositivo confiável ativo. Eles aparecem após um login com 2FA e a opção de confiar no navegador.
            </p>
          ) : null}

          {!loading && rows.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Situação</th>
                    <th>Criado</th>
                    <th>Último uso</th>
                    <th>Expira</th>
                    <th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.is_current_browser ? (
                          <span className={styles.badgeCurrent}>Este navegador</span>
                        ) : (
                          <span className={styles.muted}>Outro dispositivo</span>
                        )}
                      </td>
                      <td>{fmt(r.created_at)}</td>
                      <td>{r.last_used_at ? fmt(r.last_used_at) : "—"}</td>
                      <td>{fmt(r.expires_at)}</td>
                      <td>
                        <div className={styles.actionsCell}>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={working}
                            onClick={() => setRevokeTarget(r)}
                          >
                            Revogar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
