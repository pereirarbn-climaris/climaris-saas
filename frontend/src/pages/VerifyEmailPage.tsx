import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { verifyEmailRequest } from "../api/auth";
import styles from "./LoginPage.module.css";

type VerifyState = "loading" | "success" | "error";

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);
  const [state, setState] = useState<VerifyState>("loading");
  const [message, setMessage] = useState("Validando confirmação de e-mail...");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!token) {
        setState("error");
        setMessage("Link inválido: token ausente.");
        return;
      }
      try {
        const result = await verifyEmailRequest(token);
        if (cancelled) return;
        setState("success");
        setMessage(result.message || "E-mail confirmado com sucesso. Você já pode entrar.");
      } catch (err) {
        if (cancelled) return;
        const text = err instanceof Error ? err.message : "Não foi possível confirmar o e-mail.";
        setState("error");
        setMessage(text);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className={styles.layout} id="conteudo-principal">
      <section className={styles.hero} aria-labelledby="verify-hero-title">
        <div className={styles.heroInner}>
          <div className={styles.brandRow}>
            <span className={styles.logoMark} />
            <span className={styles.brandName}>Climaris</span>
          </div>
          <h1 id="verify-hero-title" className={styles.heroTitle}>
            Confirmação de e-mail
          </h1>
          <p className={styles.heroText}>Ative sua conta para continuar.</p>
        </div>
      </section>

      <section className={styles.formSide}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Verificação da conta</h2>
          <div
            className={state === "error" ? styles.messageError : state === "success" ? styles.messageSuccess : styles.message}
            role={state === "error" ? "alert" : "status"}
            aria-live={state === "error" ? "assertive" : "polite"}
          >
            {message}
          </div>
          <div className={styles.divider}>
            <span>Próximo passo</span>
          </div>
          <Link to="/login" className={styles.secondaryBtn}>
            Ir para login
          </Link>
        </div>
      </section>
    </main>
  );
}
