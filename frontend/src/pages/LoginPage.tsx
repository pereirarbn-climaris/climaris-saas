import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { forgotPasswordRequest, loginRequest, resendVerificationEmailRequest } from "../api/auth";
import { isPlatformAdminEmail } from "../lib/platformAdmin";
import { setAccessToken, setRefreshToken, setTenantId, clearRefreshToken } from "../lib/authStorage";
import styles from "./LoginPage.module.css";

// Ícones SVG inline para melhor performance
const SnowflakeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={styles.logoIcon}>
    <line x1="12" y1="2" x2="12" y2="22" />
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    <line x1="19.07" y1="4.93" x2="4.93" y2="19.07" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <polyline points="12,6 9,3" />
    <polyline points="12,6 15,3" />
    <polyline points="12,18 9,21" />
    <polyline points="12,18 15,21" />
    <polyline points="6,12 3,9" />
    <polyline points="6,12 3,15" />
    <polyline points="18,12 21,9" />
    <polyline points="18,12 21,15" />
  </svg>
);

const MailIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.inputIcon}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const LockIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.inputIcon}>
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const EyeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
    <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
    <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
    <path d="m2 2 20 20" />
  </svg>
);

const ShieldCheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.inputIcon}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

type LoginLocationState = { fromRegister?: boolean; registeredEmail?: string; emailVerificationPending?: boolean } | null;

const FA_SESSION_KEY = "climaris_2fa_pending";
const FA_SESSION_MAX_MS = 18 * 60 * 1000; // um pouco acima do TTL do backend (2FA)
const LAST_LOGIN_EMAIL_KEY = "climaris_last_login_email";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "idle" | "success" | "error" }>({
    text: "",
    kind: "idle",
  });
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [sendingForgot, setSendingForgot] = useState(false);
  const [canResendVerification, setCanResendVerification] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaQuestion, setCaptchaQuestion] = useState<string>("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [twoFactorToken, setTwoFactorToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [trustThisDevice, setTrustThisDevice] = useState(false);
  /** Desbloqueia campos após foco — ajuda o preenchimento automático do Chrome em inputs controlados. */
  const [credentialFieldsUnlocked, setCredentialFieldsUnlocked] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);
  const submitLock = useRef(false);

  useEffect(() => {
    if (typeof sessionStorage === "undefined") return;
    try {
      const raw = sessionStorage.getItem(FA_SESSION_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { email?: string; token?: string; at?: number };
      if (!parsed.token || !parsed.at || Date.now() - parsed.at > FA_SESSION_MAX_MS) {
        sessionStorage.removeItem(FA_SESSION_KEY);
        return;
      }
      if (parsed.email) setEmail(parsed.email.trim().toLowerCase());
      setTwoFactorToken(parsed.token);
    } catch {
      sessionStorage.removeItem(FA_SESSION_KEY);
    }
  }, []);

  useEffect(() => {
    const st = location.state as LoginLocationState;
    if (st?.fromRegister && typeof st.registeredEmail === "string" && st.registeredEmail.trim()) {
      setEmail(st.registeredEmail.trim().toLowerCase());
      setMessage({
        text: st.emailVerificationPending
          ? "Cadastro criado. Confirme seu e-mail antes de entrar."
          : "Conta criada. Entre com o mesmo e-mail e senha.",
        kind: "success",
      });
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    try {
      const saved = localStorage.getItem(LAST_LOGIN_EMAIL_KEY);
      if (saved?.trim()) {
        setEmail(saved.trim().toLowerCase());
        setRememberEmail(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitLock.current) return;
    const mail = email.trim().toLowerCase();
    if (!mail) {
      setMessage({ text: "Informe o e-mail.", kind: "error" });
      return;
    }
    if (!password) {
      setMessage({ text: "Informe a senha.", kind: "error" });
      return;
    }

    submitLock.current = true;
    setSubmitting(true);
    setCanResendVerification(false);
    setMessage({ text: "Entrando...", kind: "idle" });

    try {
      const result = await loginRequest({
        email: mail,
        password,
        captcha_token: captchaToken ?? undefined,
        captcha_answer: captchaAnswer.trim() || undefined,
        two_factor_token: twoFactorToken ?? undefined,
        two_factor_code: twoFactorCode.trim() || undefined,
        trust_this_device: twoFactorToken ? trustThisDevice : undefined,
      });
      if (result.captcha_required) {
        setCaptchaToken(result.captcha_token ?? null);
        setCaptchaQuestion(result.captcha_question ?? "Complete o CAPTCHA de segurança.");
        setMessage({ text: "Confirme o CAPTCHA para continuar.", kind: "error" });
        return;
      }
      if (result.two_factor_required) {
        const t = result.two_factor_token ?? null;
        setTwoFactorToken(t);
        setTrustThisDevice(false);
        if (typeof sessionStorage !== "undefined" && t) {
          sessionStorage.setItem(FA_SESSION_KEY, JSON.stringify({ email: mail, token: t, at: Date.now() }));
        }
        setMessage({ text: "Enviamos um código de 2 fatores para seu e-mail.", kind: "success" });
        return;
      }
      setCaptchaToken(null);
      setCaptchaQuestion("");
      setCaptchaAnswer("");
      setTwoFactorToken(null);
      setTwoFactorCode("");
      setTrustThisDevice(false);
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(FA_SESSION_KEY);
      setAccessToken(result.access_token);
      setTenantId(result.tenant_id);
      if (result.refresh_token) setRefreshToken(result.refresh_token);
      else clearRefreshToken();
      setMessage({
        text: result.must_change_password
          ? "Login ok. Você precisa alterar a senha temporária (use o fluxo da API ou peça ao admin)."
          : "Login realizado com sucesso.",
        kind: "success",
      });
      try {
        if (typeof localStorage !== "undefined") {
          if (rememberEmail) localStorage.setItem(LAST_LOGIN_EMAIL_KEY, mail);
          else localStorage.removeItem(LAST_LOGIN_EMAIL_KEY);
        }
      } catch {
        /* ignore */
      }
      const goPlatform = result.is_platform_operator === true || isPlatformAdminEmail(mail);
      navigate(goPlatform ? "/operacao" : "/app", { replace: true });
    } catch (err) {
      const text = err instanceof Error ? err.message : "Não foi possível conectar ao servidor.";
      setMessage({ text, kind: "error" });
      setCanResendVerification(text.toLowerCase().includes("e-mail ainda não confirmado"));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  async function onResendVerificationEmail() {
    const mail = email.trim().toLowerCase();
    if (!mail) {
      setMessage({ text: "Informe seu e-mail para reenviar a confirmação.", kind: "error" });
      return;
    }
    setResending(true);
    try {
      const result = await resendVerificationEmailRequest(mail);
      setMessage({ text: result.message, kind: "success" });
      setCanResendVerification(false);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Não foi possível reenviar o e-mail de confirmação.";
      setMessage({ text, kind: "error" });
    } finally {
      setResending(false);
    }
  }

  async function onForgotPassword() {
    const mail = email.trim().toLowerCase();
    if (!mail) {
      setMessage({ text: "Informe seu e-mail para recuperar a senha.", kind: "error" });
      return;
    }
    setSendingForgot(true);
    try {
      const result = await forgotPasswordRequest(mail);
      setMessage({ text: result.message, kind: "success" });
    } catch (err) {
      const text = err instanceof Error ? err.message : "Não foi possível enviar e-mail de recuperação.";
      setMessage({ text, kind: "error" });
    } finally {
      setSendingForgot(false);
    }
  }

  return (
    <main className={styles.layout} id="conteudo-principal">
      <section className={styles.hero} aria-labelledby="login-hero-title">
        <div className={styles.heroPattern} aria-hidden="true" />
        <div className={styles.heroInner}>
          <div className={styles.brandRow}>
            <div className={styles.logoMark}>
              <SnowflakeIcon />
            </div>
            <span className={styles.brandName}>Climaris</span>
          </div>
          <h1 id="login-hero-title" className={styles.heroTitle}>
            Bem-vindo de volta!
          </h1>
          <p className={styles.heroText}>
            Acesse sua conta para gerenciar sua empresa de climatização de forma eficiente.
          </p>
          
          <div className={styles.heroFeatures}>
            <div className={styles.heroFeature}>
              <span className={styles.heroFeatureIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </span>
              <span>Ordens de Serviço</span>
            </div>
            <div className={styles.heroFeature}>
              <span className={styles.heroFeatureIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
              <span>Gestão de Clientes</span>
            </div>
            <div className={styles.heroFeature}>
              <span className={styles.heroFeatureIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <path d="M3 3v18h18" />
                  <path d="m19 9-5 5-4-4-3 3" />
                </svg>
              </span>
              <span>Relatórios Completos</span>
            </div>
          </div>
          
          <p className={styles.version}>Versão 1.0.1</p>
        </div>
      </section>

      <section className={styles.formSide} aria-labelledby="login-form-title">
        <div className={styles.card}>
          <div className={styles.mobileBrand}>
            <div className={styles.logoMark}>
              <SnowflakeIcon />
            </div>
            <span className={styles.brandName}>Climaris</span>
          </div>
          
          <div className={styles.cardHeader}>
            <h2 id="login-form-title" className={styles.cardTitle}>
              Entrar na sua conta
            </h2>
            <p className={styles.cardSubtitle}>
              Insira suas credenciais para acessar o painel. A senha pode ser salva pelo{" "}
              <strong>gerenciador de senhas do navegador</strong> (ex.: Chrome) ao entrar — o Climaris não armazena sua
              senha.
            </p>
          </div>

          <form
            className={styles.form}
            onSubmit={onSubmit}
            aria-busy={submitting}
            noValidate
            method="post"
          >
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="login-email">
                E-mail
              </label>
              <div className={styles.inputWrapper}>
                <MailIcon />
                <input
                  id="login-email"
                  name="username"
                  className={styles.inputWithIcon}
                  type="email"
                  required
                  value={email}
                  readOnly={!credentialFieldsUnlocked}
                  onFocus={() => setCredentialFieldsUnlocked(true)}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEmail(v);
                    if (twoFactorToken) {
                      setTwoFactorToken(null);
                      setTwoFactorCode("");
                      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(FA_SESSION_KEY);
                    }
                  }}
                  onInput={(e) => setEmail((e.currentTarget as HTMLInputElement).value)}
                  autoComplete="username"
                  inputMode="email"
                  spellCheck={false}
                  enterKeyHint="next"
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="login-password">
                Senha
              </label>
              <div className={styles.inputWrapper}>
                <LockIcon />
                <input
                  id="login-password"
                  name="password"
                  className={styles.inputWithIcon}
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  readOnly={!credentialFieldsUnlocked}
                  onFocus={() => setCredentialFieldsUnlocked(true)}
                  onChange={(e) => setPassword(e.target.value)}
                  onInput={(e) => setPassword((e.currentTarget as HTMLInputElement).value)}
                  autoComplete="current-password"
                  enterKeyHint="next"
                  placeholder="Digite sua senha"
                />
                <button
                  type="button"
                  className={styles.togglePw}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  aria-controls="login-password"
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <label className={styles.rememberEmailRow}>
              <input type="checkbox" checked={rememberEmail} onChange={(e) => setRememberEmail(e.target.checked)} />
              <span>Lembrar meu e-mail neste aparelho</span>
            </label>

            <div className={styles.forgotRow}>
              <button type="button" className={styles.link} onClick={() => void onForgotPassword()} disabled={sendingForgot}>
                {sendingForgot ? "Enviando..." : "Esqueceu a senha?"}
              </button>
            </div>

            {captchaToken ? (
              <div className={styles.inputGroup}>
                <label className={styles.label} htmlFor="login-captcha">
                  CAPTCHA
                </label>
                <p className={styles.captchaHint}>{captchaQuestion}</p>
                <div className={styles.inputWrapper}>
                  <ShieldCheckIcon />
                  <input
                    id="login-captcha"
                    className={styles.inputWithIcon}
                    type="text"
                    required
                    value={captchaAnswer}
                    onChange={(e) => setCaptchaAnswer(e.target.value)}
                    autoComplete="off"
                    enterKeyHint="next"
                    placeholder="Digite a resposta"
                  />
                </div>
              </div>
            ) : null}

            {twoFactorToken ? (
              <>
                <div className={styles.inputGroup}>
                  <label className={styles.label} htmlFor="login-2fa">
                    Código de verificação (2FA)
                  </label>
                  <p className={styles.fieldHint}>
                    Digite os 6 dígitos enviados ao seu e-mail. Depois você pode marcar a opção abaixo para não repetir o código neste navegador.
                  </p>
                  <div className={styles.inputWrapper}>
                    <ShieldCheckIcon />
                    <input
                      id="login-2fa"
                      className={styles.inputWithIcon}
                      type="text"
                      required
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value)}
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      enterKeyHint="done"
                      placeholder="000000"
                    />
                  </div>
                </div>
                <div className={styles.trustDevicePanel} role="group" aria-labelledby="login-trust-heading">
                  <p id="login-trust-heading" className={styles.trustDeviceHeading}>
                    Dispositivo confiável (opcional)
                  </p>
                  <label className={styles.trustDeviceRow}>
                    <input
                      type="checkbox"
                      checked={trustThisDevice}
                      onChange={(e) => setTrustThisDevice(e.target.checked)}
                    />
                    <span>
                      Confiar neste dispositivo — na próxima vez não pedimos o código 2FA neste navegador (prazo configurado no servidor).
                    </span>
                  </label>
                </div>
              </>
            ) : null}

            <button className={styles.primaryBtn} type="submit" disabled={submitting}>
              {submitting ? (
                <span className={styles.btnLoading}>
                  <span className={styles.spinner} />
                  Entrando...
                </span>
              ) : twoFactorToken ? (
                "Validar código"
              ) : (
                <>
                  Entrar
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" className={styles.btnIcon}>
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
          </form>

          <div className={styles.divider}>
            <span>Novo por aqui?</span>
          </div>

          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => navigate("/register")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" x2="19" y1="8" y2="14" />
              <line x1="22" x2="16" y1="11" y2="11" />
            </svg>
            Criar uma conta
          </button>

          <button
            type="button"
            className={styles.demoBtn}
            onClick={() => {
              setAccessToken("demo_token_climaris_erp_2024");
              setTenantId(1);
              setMessage({ text: "Entrando em modo demonstracao...", kind: "success" });
              setTimeout(() => navigate("/app", { replace: true }), 500);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <circle cx="12" cy="12" r="10" />
              <polygon points="10 8 16 12 10 16 10 8" />
            </svg>
            Entrar como Demo
          </button>
          
          {canResendVerification ? (
            <button type="button" className={styles.resendLink} onClick={() => void onResendVerificationEmail()} disabled={resending}>
              {resending ? "Reenviando..." : "Reenviar e-mail de confirmação"}
            </button>
          ) : null}

          {message.text && (
            <div
              className={
                message.kind === "error"
                  ? styles.messageError
                  : message.kind === "success"
                    ? styles.messageSuccess
                    : styles.message
              }
              role={message.kind === "error" ? "alert" : "status"}
              aria-live={message.kind === "error" ? "assertive" : "polite"}
            >
              {message.kind === "error" && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" x2="12" y1="8" y2="12" />
                  <line x1="12" x2="12.01" y1="16" y2="16" />
                </svg>
              )}
              {message.kind === "success" && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              )}
              {message.text}
            </div>
          )}
        </div>
        
        <p className={styles.footerText}>
          Climaris ERP - Gestao inteligente para climatizacao
        </p>
      </section>
    </main>
  );
}
