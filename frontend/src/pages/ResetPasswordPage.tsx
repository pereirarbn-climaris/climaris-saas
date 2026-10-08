import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { resetPasswordRequest } from "../api/auth";
import styles from "./LoginPage.module.css";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "idle" | "success" | "error" }>({
    text: token ? "" : "Link inválido: token ausente.",
    kind: token ? "idle" : "error",
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) {
      setMessage({ text: "Link inválido: token ausente.", kind: "error" });
      return;
    }
    if (password.length < 8) {
      setMessage({ text: "A nova senha deve ter pelo menos 8 caracteres.", kind: "error" });
      return;
    }
    if (password !== confirmPassword) {
      setMessage({ text: "As senhas não coincidem.", kind: "error" });
      return;
    }
    setSubmitting(true);
    try {
      const result = await resetPasswordRequest(token, password);
      setMessage({ text: result.message, kind: "success" });
      setTimeout(() => {
        navigate("/login", { replace: true });
      }, 1000);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Não foi possível redefinir a senha.";
      setMessage({ text, kind: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.layout} id="conteudo-principal">
      <section className={styles.hero} aria-labelledby="reset-password-hero-title">
        <div className={styles.heroInner}>
          <div className={styles.brandRow}>
            <span className={styles.logoMark} />
            <span className={styles.brandName}>Climaris</span>
          </div>
          <h1 id="reset-password-hero-title" className={styles.heroTitle}>
            Nova senha
          </h1>
          <p className={styles.heroText}>Crie sua nova senha para acessar a plataforma.</p>
        </div>
      </section>

      <section className={styles.formSide} aria-labelledby="reset-password-form-title">
        <div className={styles.card}>
          <h2 id="reset-password-form-title" className={styles.cardTitle}>
            Redefinir senha
          </h2>

          <form className={styles.form} onSubmit={onSubmit} aria-busy={submitting} noValidate>
            <label className={styles.label} htmlFor="new-password">
              Nova senha
            </label>
            <div className={styles.passwordWrap}>
              <input
                id="new-password"
                className={styles.input}
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                enterKeyHint="next"
              />
              <button
                type="button"
                className={styles.togglePw}
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={showPassword}
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>

            <label className={styles.label} htmlFor="confirm-new-password">
              Confirmar nova senha
            </label>
            <input
              id="confirm-new-password"
              className={styles.input}
              type={showPassword ? "text" : "password"}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              enterKeyHint="go"
            />

            <button className={styles.primaryBtn} type="submit" disabled={submitting || !token}>
              {submitting ? "Salvando..." : "Salvar nova senha"}
            </button>
          </form>

          <div
            className={
              message.kind === "error" ? styles.messageError : message.kind === "success" ? styles.messageSuccess : styles.message
            }
            role={message.kind === "error" ? "alert" : "status"}
            aria-live={message.kind === "error" ? "assertive" : "polite"}
          >
            {message.text}
          </div>

          <div className={styles.divider}>
            <span>Voltar</span>
          </div>
          <Link to="/login" className={styles.secondaryBtn}>
            Ir para login
          </Link>
        </div>
      </section>
    </main>
  );
}
