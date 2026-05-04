import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  createTenantApiKey,
  listTenantApiKeys,
  revokeTenantApiKey,
  type TenantApiKeyCreated,
  type TenantApiKeyOut,
} from "../../api/apiKeys";
import loginStyles from "../LoginPage.module.css";
import styles from "./AdminPage.module.css";

function formatDt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

export function AdminApiKeysTab() {
  const [rows, setRows] = useState<TenantApiKeyOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [listErr, setListErr] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");
  const [revealed, setRevealed] = useState<TenantApiKeyCreated | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setListErr("");
    setLoading(true);
    try {
      const list = await listTenantApiKeys({ limit: 100 });
      setRows(list);
    } catch (e) {
      setListErr(e instanceof Error ? e.message : "Erro ao carregar chaves.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) {
      setCreateErr("Informe um nome para identificar esta chave.");
      return;
    }
    setCreateErr("");
    setCreating(true);
    try {
      const created = await createTenantApiKey({ name: n });
      setName("");
      setRevealed(created);
      await load();
    } catch (err) {
      setCreateErr(err instanceof Error ? err.message : "Não foi possível criar a chave.");
    } finally {
      setCreating(false);
    }
  }

  async function onRevoke(id: number) {
    if (
      !window.confirm(
        "Revogar esta chave? Integrações que ainda a usarem deixarão de funcionar. Esta ação não pode ser desfeita.",
      )
    ) {
      return;
    }
    setRevokingId(id);
    try {
      await revokeTenantApiKey(id);
      await load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Erro ao revogar.");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="admin-keys-title">
      <h2 id="admin-keys-title" className={styles.panelTitle}>
        Chaves de API
      </h2>
      <p className={styles.panelLead}>
        Use chaves para integrações e automações. O texto completo da chave só aparece uma vez, ao criar — depois disso a
        interface só mostra um prefixo para você saber qual é qual. Guarde a chave em cofre ou variável de ambiente.
      </p>

      <form className={styles.toolbar} onSubmit={onCreate}>
        <div className={styles.toolbarFields}>
          <div>
            <label className={loginStyles.label} htmlFor="api-key-name">
              Nome da chave
            </label>
            <input
              id="api-key-name"
              className={loginStyles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Integração CRM, Robô de OS…"
              maxLength={120}
              autoComplete="off"
            />
          </div>
        </div>
        <button type="submit" className={styles.btnPrimary} disabled={creating}>
          {creating ? "Gerando…" : "Gerar nova chave"}
        </button>
      </form>
      {createErr ? <p className={styles.msgErr}>{createErr}</p> : null}

      {loading ? <p className={styles.empty}>Carregando chaves…</p> : null}
      {listErr ? <p className={styles.msgErr}>{listErr}</p> : null}

      {!loading && !listErr && rows.length === 0 ? (
        <p className={styles.empty}>Nenhuma chave ainda. Gere uma acima.</p>
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Prefixo</th>
                <th>Criada em</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <tr key={k.id}>
                  <td>{k.name}</td>
                  <td>
                    <code className={styles.code}>{k.key_prefix}…</code>
                  </td>
                  <td>{formatDt(k.created_at)}</td>
                  <td>
                    {k.revoked_at ? (
                      <span className={styles.badgeOff}>Revogada</span>
                    ) : (
                      <span className={styles.badgeOn}>Ativa</span>
                    )}
                  </td>
                  <td className={styles.userActionsCell}>
                    {!k.revoked_at ? (
                      <button
                        type="button"
                        className={styles.btnGhost}
                        disabled={revokingId === k.id}
                        onClick={() => void onRevoke(k.id)}
                      >
                        {revokingId === k.id ? "Revogando…" : "Revogar"}
                      </button>
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {revealed ? (
        <div className={styles.modalRoot} role="presentation">
          <button
            type="button"
            className={styles.modalBackdrop}
            aria-label="Fechar"
            onClick={() => setRevealed(null)}
          />
          <div className={styles.modalCard} role="dialog" aria-modal="true" aria-labelledby="reveal-key-title">
            <h3 id="reveal-key-title" className={styles.modalTitle}>
              Chave criada — copie agora
            </h3>
            <p className={styles.muted}>
              Por segurança, o valor completo <strong>não será exibido de novo</strong> nesta tela. Se perder, revogue e
              crie outra chave.
            </p>
            <p className={styles.provisionTitle}>Sua chave</p>
            <div className={styles.provisionRow}>
              <code className={styles.code}>{revealed.api_key}</code>
              <button
                type="button"
                className={styles.btnGhost}
                onClick={() => {
                  void navigator.clipboard.writeText(revealed.api_key);
                }}
              >
                Copiar
              </button>
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.btnPrimary} onClick={() => setRevealed(null)}>
                Entendi, fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
