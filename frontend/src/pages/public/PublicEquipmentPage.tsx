import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getPublicEquipmentPage, type PublicEquipmentPagePayload } from "../../api/publicEquipment";
import { getAccessToken } from "../../lib/authStorage";
import styles from "./PublicEquipmentPage.module.css";

function formatDt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function PublicEquipmentPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicEquipmentPagePayload | null>(null);
  const [err, setErr] = useState("");
  const loggedIn = Boolean(getAccessToken());

  useEffect(() => {
    if (!token?.trim()) {
      setErr("Link inválido.");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const page = await getPublicEquipmentPage(token.trim());
        if (!cancelled) setData(page);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Erro ao carregar.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (err) {
    return (
      <div className={styles.wrap}>
        <p className={styles.err}>{err}</p>
        <Link to="/login" className={styles.link}>
          Entrar no sistema
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.wrap}>
        <p className={styles.muted}>Carregando…</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <p className={styles.brand}>{data.tenant_name}</p>
        <h1 className={styles.title}>{data.identificacao}</h1>
        <p className={styles.meta}>
          {[data.tipo, data.fabricante, data.modelo].filter(Boolean).join(" · ") || "Equipamento"}
        </p>
      </header>
      <p className={styles.lead}>
        Histórico público de serviços registrados neste aparelho. Não exibe dados pessoais do cliente.
      </p>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Registros</h2>
        {data.entries.length === 0 ? (
          <p className={styles.muted}>Nenhum serviço registrado ainda.</p>
        ) : (
          <ul className={styles.list}>
            {data.entries.map((e, idx) => (
              <li key={`${e.occurred_at}-${idx}`} className={styles.item}>
                <span className={styles.when}>{formatDt(e.occurred_at)}</span>
                <span className={styles.lineTitle}>{e.title}</span>
                {e.detail ? <span className={styles.detail}>{e.detail}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <footer className={styles.footer}>
        <p className={styles.muted}>É técnico da empresa?</p>
        <p className={styles.footerActions}>
          <Link to="/login" className={styles.link}>
            Entrar
          </Link>
          {loggedIn ? (
            <>
              {" · "}
              <Link to="/app/service-orders" className={styles.link}>
                Abrir ordens de serviço
              </Link>
            </>
          ) : null}
        </p>
        <p className={styles.hint}>
          Após login, abra a OS do cliente e vincule cada serviço ao aparelho correspondente.
        </p>
      </footer>
    </div>
  );
}
