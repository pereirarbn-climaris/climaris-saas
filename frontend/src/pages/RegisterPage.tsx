import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getPlanDisplayLabel, normalizePlanKey } from "../lib/planRules";
import { isPaidContractPlan, rememberPendingCheckoutPlan } from "../lib/paidPlanCheckout";
import { getGoogleAuthConfig, registerGoogleRequest, registerRequest, resendVerificationEmailRequest } from "../api/auth";
import { PlatformBrandMark } from "../components/branding/PlatformBrandMark";
import { usePlatformBranding } from "../context/PlatformBrandingContext";
import { toast } from "../lib/toast";
import { renderGoogleButton, setGoogleClientIdRuntime } from "../lib/googleIdentity";
import styles from "./LoginPage.module.css";

const BuildingIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.inputIcon}>
    <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
    <path d="M9 22v-4h6v4" />
    <path d="M8 6h.01" />
    <path d="M16 6h.01" />
    <path d="M12 6h.01" />
    <path d="M12 10h.01" />
    <path d="M12 14h.01" />
    <path d="M16 10h.01" />
    <path d="M16 14h.01" />
    <path d="M8 10h.01" />
    <path d="M8 14h.01" />
  </svg>
);

const UserIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.inputIcon}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
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

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activePlan = normalizePlanKey(searchParams.get("plan") || "free_30d");
  const isFreeTrial = activePlan === "free_30d";
  const isPaidPlan = isPaidContractPlan(activePlan);
  const planLabel = getPlanDisplayLabel(activePlan);
  const { branding } = usePlatformBranding();
  const [tenantName, setTenantName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [lgpdConsent, setLgpdConsent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "idle" | "success" | "error" }>({
    text: "",
    kind: "idle",
  });
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [canResendVerification, setCanResendVerification] = useState(false);
  const [googleIdToken, setGoogleIdToken] = useState<string | null>(null);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!message.text || message.kind === "idle") return;
    if (message.kind === "error") toast.error(message.text);
    else if (message.kind === "success") toast.success(message.text);
  }, [message]);

  useEffect(() => {
    void (async () => {
      try {
        const cfg = await getGoogleAuthConfig();
        setGoogleClientIdRuntime(cfg.client_id);
        setGoogleEnabled(Boolean(cfg.enabled && cfg.client_id));
      } catch {
        setGoogleEnabled(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!googleEnabled) return;
    const target = googleButtonRef.current;
    if (!target) return;
    void renderGoogleButton(target, {
      text: "signup_with",
      onCredential: (idToken) => {
        setGoogleIdToken(idToken);
        setMessage({ text: "Conta Google conectada. Você já pode finalizar o cadastro.", kind: "success" });
      },
    }).catch((err) => {
      const text = err instanceof Error ? err.message : "Não foi possível carregar botão do Google.";
      setMessage({ text, kind: "error" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleEnabled]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage({ text: "", kind: "idle" });
    setCanResendVerification(false);

    const name = tenantName.trim();
    const adminName = fullName.trim();
    const mail = email.trim().toLowerCase();

    if (!name) {
      setMessage({ text: "Informe o nome da empresa.", kind: "error" });
      return;
    }
    if (!adminName) {
      setMessage({ text: "Informe seu nome completo.", kind: "error" });
      return;
    }
    if (!mail) {
      setMessage({ text: "Informe o e-mail.", kind: "error" });
      return;
    }
    if (password.length < 8) {
      setMessage({ text: "A senha deve ter pelo menos 8 caracteres.", kind: "error" });
      return;
    }
    if (password !== password2) {
      setMessage({ text: "As senhas nao coincidem.", kind: "error" });
      return;
    }
    if (!lgpdConsent) {
      setMessage({
        text: "É necessário aceitar a Política de Privacidade e o tratamento de dados conforme a LGPD.",
        kind: "error",
      });
      return;
    }

    setSubmitting(true);
    try {
      await registerRequest({
        tenant_name: name,
        full_name: adminName,
        email: mail,
        password,
        phone: undefined,
        whatsapp: undefined,
        active_plan: activePlan,
        lgpd_consent: true,
      });
      if (isPaidPlan) {
        rememberPendingCheckoutPlan(activePlan);
      }
      const loginPath = isPaidPlan
        ? `/login?plan=${encodeURIComponent(activePlan)}&checkout=1`
        : "/login";
      navigate(loginPath, {
        replace: true,
        state: {
          fromRegister: true,
          registeredEmail: mail,
          emailVerificationPending: true,
          pendingCheckoutPlan: isPaidPlan ? activePlan : undefined,
        },
      });
    } catch (err) {
      const text = err instanceof Error ? err.message : "Nao foi possivel criar a conta.";
      setMessage({ text, kind: "error" });
      setCanResendVerification(text.toLowerCase().includes("ja possui cadastro"));
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmitGoogleRegister() {
    const name = tenantName.trim();
    if (!googleIdToken) {
      setMessage({ text: "Clique primeiro em 'Cadastrar com Google'.", kind: "error" });
      return;
    }
    if (!name) {
      setMessage({ text: "Informe o nome da empresa para concluir com Google.", kind: "error" });
      return;
    }
    if (!lgpdConsent) {
      setMessage({
        text: "É necessário aceitar a Política de Privacidade e o tratamento de dados conforme a LGPD.",
        kind: "error",
      });
      return;
    }
    setGoogleSubmitting(true);
    try {
      await registerGoogleRequest({
        id_token: googleIdToken,
        tenant_name: name,
        active_plan: activePlan,
        lgpd_consent: true,
      });
      if (isPaidPlan) {
        rememberPendingCheckoutPlan(activePlan);
      }
      const loginPath = isPaidPlan
        ? `/login?plan=${encodeURIComponent(activePlan)}&checkout=1`
        : "/login";
      navigate(loginPath, {
        replace: true,
        state: {
          fromRegister: true,
          emailVerificationPending: false,
          pendingCheckoutPlan: isPaidPlan ? activePlan : undefined,
        },
      });
    } catch (err) {
      const text = err instanceof Error ? err.message : "Não foi possível criar conta com Google.";
      setMessage({ text, kind: "error" });
      setCanResendVerification(false);
    } finally {
      setGoogleSubmitting(false);
    }
  }

  async function onResendVerification() {
    const mail = email.trim().toLowerCase();
    if (!mail) {
      setMessage({ text: "Informe o e-mail para reenviar a confirmacao.", kind: "error" });
      return;
    }
    setResending(true);
    try {
      const result = await resendVerificationEmailRequest(mail);
      setMessage({ text: result.message, kind: "success" });
      setCanResendVerification(false);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Nao foi possivel reenviar o e-mail de confirmacao.";
      setMessage({ text, kind: "error" });
    } finally {
      setResending(false);
    }
  }

  return (
    <main className={styles.layout} id="conteudo-principal">
      <section className={styles.hero} aria-labelledby="register-hero-title">
        <div className={styles.heroPattern} aria-hidden="true" />
        <div className={styles.heroInner}>
          <PlatformBrandMark variant="auth-dark" className={styles.brandRow} />
          <h1 id="register-hero-title" className={styles.heroTitle}>
            {isFreeTrial ? "30 dias grátis no Climaris" : isPaidPlan ? `Plano ${planLabel}` : "Comece agora!"}
          </h1>
          <p className={styles.heroText}>
            {isFreeTrial
              ? "Crie sua conta em minutos e teste gestão de OS, financeiro básico e PMOC — sem cartão de crédito."
              : isPaidPlan
                ? "Crie sua conta, confirme o e-mail e conclua o pagamento seguro no Stripe para ativar o plano escolhido."
                : "Crie sua conta e comece a gerenciar sua empresa de climatizacao de forma eficiente."}
          </p>
          
          <div className={styles.heroFeatures}>
            <div className={styles.heroFeature}>
              <span className={styles.heroFeatureIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </span>
              <span>Cadastro rapido e facil</span>
            </div>
            <div className={styles.heroFeature}>
              <span className={styles.heroFeatureIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </span>
              <span>Dados seguros e protegidos</span>
            </div>
            <div className={styles.heroFeature}>
              <span className={styles.heroFeatureIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </span>
              <span>Acesso imediato ao sistema</span>
            </div>
          </div>
          
          <p className={styles.version}>Versao 1.0.1</p>
        </div>
      </section>

      <section className={styles.formSide} aria-labelledby="register-form-title">
        <div className={styles.card}>
          <PlatformBrandMark variant="auth" className={styles.mobileBrand} />
          
          <div className={styles.cardHeader}>
            <h2 id="register-form-title" className={styles.cardTitle}>
              {isFreeTrial ? "Criar conta grátis" : isPaidPlan ? `Assinar plano ${planLabel}` : "Criar nova conta"}
            </h2>
            <p className={styles.cardSubtitle}>
              {isFreeTrial
                ? "Teste gratuito de 30 dias — confirme o e-mail para acessar o sistema"
                : isPaidPlan
                  ? "Após confirmar o e-mail e entrar, você será direcionado ao pagamento no Stripe"
                  : "Preencha os dados abaixo para comecar"}
            </p>
          </div>

          <form className={styles.form} onSubmit={onSubmit} aria-busy={submitting} noValidate>
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="tenant_name">
                Nome da empresa
              </label>
              <div className={styles.inputWrapper}>
                <BuildingIcon />
                <input
                  id="tenant_name"
                  className={styles.inputWithIcon}
                  type="text"
                  name="tenant_name"
                  required
                  autoComplete="organization"
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  enterKeyHint="next"
                  placeholder="Nome da sua empresa"
                />
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="full_name">
                Seu nome completo
              </label>
              <div className={styles.inputWrapper}>
                <UserIcon />
                <input
                  id="full_name"
                  className={styles.inputWithIcon}
                  type="text"
                  name="full_name"
                  required
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  enterKeyHint="next"
                  placeholder="Seu nome completo"
                />
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="reg_email">
                E-mail
              </label>
              <div className={styles.inputWrapper}>
                <MailIcon />
                <input
                  id="reg_email"
                  className={styles.inputWithIcon}
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  enterKeyHint="next"
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="reg_password">
                Senha
              </label>
              <div className={styles.inputWrapper}>
                <LockIcon />
                <input
                  id="reg_password"
                  className={styles.inputWithIcon}
                  type={showPassword ? "text" : "password"}
                  name="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  enterKeyHint="next"
                  placeholder="Minimo 8 caracteres"
                />
                <button
                  type="button"
                  className={styles.togglePw}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="reg_password2">
                Confirmar senha
              </label>
              <div className={styles.inputWrapper}>
                <LockIcon />
                <input
                  id="reg_password2"
                  className={styles.inputWithIcon}
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  enterKeyHint="go"
                  placeholder="Repita a senha"
                />
              </div>
            </div>

            <label className={styles.rememberEmailRow} htmlFor="lgpd_consent">
              <input
                id="lgpd_consent"
                type="checkbox"
                checked={lgpdConsent}
                onChange={(e) => setLgpdConsent(e.target.checked)}
                required
              />
              <span>
                Li e estou ciente da{" "}
                <Link to="/privacidade" target="_blank" rel="noopener noreferrer">
                  Política de Privacidade e LGPD
                </Link>{" "}
                e autorizo o tratamento dos meus dados para criação e uso da conta no Climaris.
              </span>
            </label>

            <button className={styles.primaryBtn} type="submit" disabled={submitting || !lgpdConsent}>
              {submitting ? (
                <span className={styles.btnLoading}>
                  <span className={styles.spinner} />
                  Criando conta...
                </span>
              ) : (
                <>
                  Criar conta
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18" className={styles.btnIcon}>
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                </>
              )}
            </button>

            {googleEnabled ? (
              <>
                <div className={styles.googleArea}>
                  <p className={styles.googleLabel}>Cadastro rápido com Google</p>
                  <div ref={googleButtonRef} className={styles.googleButtonMount} />
                </div>
                <button
                  className={styles.secondaryBtn}
                  type="button"
                  onClick={() => void onSubmitGoogleRegister()}
                  disabled={googleSubmitting || !lgpdConsent}
                >
                  {googleSubmitting ? "Criando com Google..." : "Concluir cadastro com Google"}
                </button>
              </>
            ) : null}
          </form>

          {canResendVerification && (
            <button type="button" className={styles.resendLink} onClick={() => void onResendVerification()} disabled={resending}>
              {resending ? "Reenviando..." : "Reenviar e-mail de confirmacao"}
            </button>
          )}

          <div className={styles.divider}>
            <span>Ja tem conta?</span>
          </div>

          <button type="button" className={styles.secondaryBtn} onClick={() => navigate("/login")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" x2="3" y1="12" y2="12" />
            </svg>
            Entrar na minha conta
          </button>
        </div>
        
        <p className={styles.footerText}>
          {branding.platform_name} ERP - Gestao inteligente para climatizacao
        </p>
      </section>
    </main>
  );
}
