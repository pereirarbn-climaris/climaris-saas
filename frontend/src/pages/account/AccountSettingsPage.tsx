import { useEffect, useState, type FormEvent } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { changeMyPassword, patchCurrentUser } from "../../api/auth";
import { Button } from "../../components/ui/button";
import { digitsOnlyPhoneForApi, formatPhoneBrInput } from "../../lib/brMask";
import { roleLabel } from "../../lib/userDisplay";
import type { DashboardOutletContext } from "../dashboardContext";
import layout from "../admin/ManagementView.module.css";
import loginStyles from "../LoginPage.module.css";
import formLayout from "../formLayout.module.css";
import styles from "./AccountSettingsPage.module.css";

function AccountHeaderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M6 20v-1a6 6 0 0 1 12 0v1" />
    </svg>
  );
}

type AccountSection = "perfil" | "seguranca" | "privacidade";

function sectionFromSearch(value: string | null): AccountSection {
  if (value === "seguranca") return "seguranca";
  if (value === "privacidade") return "privacidade";
  return "perfil";
}

function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={formLayout.field}>
      <label className={loginStyles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.passwordField}>
        <input
          id={id}
          className={`${loginStyles.input} ${styles.passwordInput}`}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className={styles.passwordToggle}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        >
          {visible ? "Ocultar" : "Mostrar"}
        </button>
      </div>
    </div>
  );
}

export function AccountSettingsPage() {
  const { user, updateUser } = useOutletContext<DashboardOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const section = sectionFromSearch(searchParams.get("secao"));

  const [fullName, setFullName] = useState(user.full_name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone ? formatPhoneBrInput(String(user.phone)) : "");
  const [whatsapp, setWhatsapp] = useState(user.whatsapp ? formatPhoneBrInput(String(user.whatsapp)) : "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    setFullName(user.full_name);
    setEmail(user.email);
    setPhone(user.phone ? formatPhoneBrInput(String(user.phone)) : "");
    setWhatsapp(user.whatsapp ? formatPhoneBrInput(String(user.whatsapp)) : "");
  }, [user]);

  useEffect(() => {
    if (!user.must_change_password) return;
    if (searchParams.get("secao") === "seguranca") return;
    setSearchParams({ secao: "seguranca" }, { replace: true });
  }, [user.must_change_password, searchParams, setSearchParams]);

  function setSection(next: AccountSection) {
    if (next === "seguranca") {
      setSearchParams({ secao: "seguranca" }, { replace: true });
      return;
    }
    if (next === "privacidade") {
      setSearchParams({ secao: "privacidade" }, { replace: true });
      return;
    }
    setSearchParams({}, { replace: true });
  }

  async function submitProfile(e: FormEvent) {
    e.preventDefault();
    const name = fullName.trim();
    const mail = email.trim();
    if (!name || !mail) {
      setProfileMsg({ kind: "err", text: "Nome e e-mail são obrigatórios." });
      return;
    }
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const phoneDigits = phone.trim() ? digitsOnlyPhoneForApi(phone) : "";
      const waDigits = whatsapp.trim() ? digitsOnlyPhoneForApi(whatsapp) : "";
      const updated = await patchCurrentUser({
        full_name: name,
        email: mail,
        phone: phoneDigits || null,
        whatsapp: waDigits || null,
      });
      updateUser(updated);
      setProfileMsg({ kind: "ok", text: "Perfil atualizado com sucesso." });
    } catch (err) {
      setProfileMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Não foi possível salvar o perfil.",
      });
    } finally {
      setSavingProfile(false);
    }
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordMsg({ kind: "err", text: "Preencha todos os campos de senha." });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordMsg({ kind: "err", text: "A nova senha deve ter pelo menos 8 caracteres." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ kind: "err", text: "A confirmação da nova senha não confere." });
      return;
    }
    if (currentPassword === newPassword) {
      setPasswordMsg({ kind: "err", text: "A nova senha deve ser diferente da senha atual." });
      return;
    }
    setChangingPassword(true);
    setPasswordMsg(null);
    try {
      await changeMyPassword({ current_password: currentPassword, new_password: newPassword });
      updateUser({ ...user, must_change_password: false });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMsg({ kind: "ok", text: "Senha alterada com sucesso." });
    } catch (err) {
      setPasswordMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Não foi possível alterar a senha.",
      });
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className={styles.wrap}>

      <header className={layout.pageHeader}>
        <div className={layout.pageHeaderMain}>
          <span className={layout.pageHeaderIcon} aria-hidden>
            <AccountHeaderIcon />
          </span>
          <div className={layout.pageHeaderText}>
            <h1 id="account-settings-title" className={layout.pageTitle}>
              Minha conta
            </h1>
            <p className={layout.pageLead}>
              Gerencie seu perfil, credenciais de acesso e preferências de segurança.
            </p>
          </div>
        </div>
      </header>

      {user.must_change_password ? (
        <div className={styles.alertBanner} role="status">
          <div>
            <strong>Senha temporária ativa</strong>
            Por segurança, defina uma nova senha na seção Segurança antes de continuar usando o sistema.
          </div>
        </div>
      ) : null}

      <div className={styles.layout}>
        <nav className={styles.nav} aria-label="Seções da conta">
          <button
            type="button"
            className={`${styles.navItem} ${section === "perfil" ? styles.navItemActive : ""}`}
            onClick={() => setSection("perfil")}
            aria-current={section === "perfil" ? "page" : undefined}
          >
            Perfil
          </button>
          <button
            type="button"
            className={`${styles.navItem} ${section === "seguranca" ? styles.navItemActive : ""}`}
            onClick={() => setSection("seguranca")}
            aria-current={section === "seguranca" ? "page" : undefined}
          >
            Segurança
          </button>
          <button
            type="button"
            className={`${styles.navItem} ${section === "privacidade" ? styles.navItemActive : ""}`}
            onClick={() => setSection("privacidade")}
            aria-current={section === "privacidade" ? "page" : undefined}
          >
            Privacidade
          </button>
        </nav>

        <div className={styles.content}>
          {section === "privacidade" ? (
            <section className={styles.card} aria-labelledby="account-privacy-title">
              <div className={styles.cardHeader}>
                <h2 id="account-privacy-title" className={styles.cardTitle}>
                  Privacidade e LGPD
                </h2>
                <p className={styles.cardLead}>
                  Informações sobre o tratamento dos seus dados pessoais e o aceite registrado no cadastro.
                </p>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.securityLinkRow}>
                  <div className={styles.securityLinkText}>
                    <p className={styles.securityLinkTitle}>Política de Privacidade</p>
                    <p className={styles.securityLinkLead}>
                      Consulte como coletamos, utilizamos e protegemos dados pessoais em conformidade com a LGPD.
                    </p>
                  </div>
                  <Link className={styles.inlineLink} to="/privacidade" target="_blank" rel="noopener noreferrer">
                    Ler política →
                  </Link>
                </div>
                <div className={`${formLayout.field} ${styles.formGridFull}`} style={{ marginTop: "1.25rem" }}>
                  <span className={loginStyles.label}>Aceite registrado</span>
                  <span className={styles.roleReadonly}>
                    {user.lgpd_accepted_at
                      ? new Date(user.lgpd_accepted_at).toLocaleString("pt-BR")
                      : "Não registrado (conta criada antes da política vigente)"}
                  </span>
                  {user.lgpd_policy_version ? (
                    <p className={styles.fieldHint}>Versão da política: {user.lgpd_policy_version}</p>
                  ) : null}
                </div>
                <p className={styles.fieldHint} style={{ marginTop: "1rem" }}>
                  Para solicitar acesso, correção ou exclusão de dados pessoais, entre em contato pelo canal indicado na
                  política de privacidade.
                </p>
              </div>
            </section>
          ) : section === "perfil" ? (
            <section className={styles.card} aria-labelledby="account-profile-title">
              <div className={styles.cardHeader}>
                <h2 id="account-profile-title" className={styles.cardTitle}>
                  Informações pessoais
                </h2>
                <p className={styles.cardLead}>Dados exibidos no workspace e usados em comunicações com clientes.</p>
              </div>
              <form className={styles.cardBody} onSubmit={(e) => void submitProfile(e)}>
                <div className={styles.formGrid}>
                  <div className={formLayout.field}>
                    <label className={loginStyles.label} htmlFor="account-full-name">
                      Nome completo
                    </label>
                    <input
                      id="account-full-name"
                      className={loginStyles.input}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      autoComplete="name"
                      required
                    />
                  </div>
                  <div className={formLayout.field}>
                    <label className={loginStyles.label} htmlFor="account-email">
                      E-mail
                    </label>
                    <input
                      id="account-email"
                      className={loginStyles.input}
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>
                  <div className={formLayout.field}>
                    <label className={loginStyles.label} htmlFor="account-phone">
                      Telefone
                    </label>
                    <input
                      id="account-phone"
                      className={loginStyles.input}
                      value={phone}
                      onChange={(e) => setPhone(formatPhoneBrInput(e.target.value))}
                      autoComplete="tel"
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <div className={formLayout.field}>
                    <label className={loginStyles.label} htmlFor="account-whatsapp">
                      WhatsApp
                    </label>
                    <input
                      id="account-whatsapp"
                      className={loginStyles.input}
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(formatPhoneBrInput(e.target.value))}
                      autoComplete="tel"
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                  <div className={`${formLayout.field} ${styles.formGridFull}`}>
                    <span className={loginStyles.label}>Função no workspace</span>
                    <span className={styles.roleReadonly}>{roleLabel(user.role)}</span>
                    <p className={styles.fieldHint}>A função é definida pelo administrador do workspace.</p>
                  </div>
                </div>

                {profileMsg ? (
                  <p className={profileMsg.kind === "ok" ? styles.msgOk : styles.msgErr}>{profileMsg.text}</p>
                ) : null}

                <div className={styles.cardActions}>
                  <Button type="submit" disabled={savingProfile}>
                    {savingProfile ? "Salvando…" : "Salvar alterações"}
                  </Button>
                </div>
              </form>
            </section>
          ) : (
            <>
              <section className={styles.card} aria-labelledby="account-password-title">
                <div className={styles.cardHeader}>
                  <h2 id="account-password-title" className={styles.cardTitle}>
                    Alterar senha
                  </h2>
                  <p className={styles.cardLead}>
                    Use uma senha forte e exclusiva. Você precisará informar a senha atual para confirmar a troca.
                  </p>
                </div>
                <form className={styles.cardBody} onSubmit={(e) => void submitPassword(e)}>
                  <div className={formLayout.stack}>
                    <PasswordInput
                      id="account-current-password"
                      label="Senha atual"
                      value={currentPassword}
                      onChange={setCurrentPassword}
                      autoComplete="current-password"
                    />
                    <PasswordInput
                      id="account-new-password"
                      label="Nova senha"
                      value={newPassword}
                      onChange={setNewPassword}
                      autoComplete="new-password"
                    />
                    <PasswordInput
                      id="account-confirm-password"
                      label="Confirmar nova senha"
                      value={confirmPassword}
                      onChange={setConfirmPassword}
                      autoComplete="new-password"
                    />
                  </div>

                  <div className={styles.requirements}>
                    Requisitos recomendados:
                    <ul>
                      <li>Mínimo de 8 caracteres</li>
                      <li>Combine letras, números e símbolos</li>
                      <li>Não reutilize senhas de outros serviços</li>
                    </ul>
                  </div>

                  {passwordMsg ? (
                    <p className={passwordMsg.kind === "ok" ? styles.msgOk : styles.msgErr}>{passwordMsg.text}</p>
                  ) : null}

                  <div className={styles.cardActions}>
                    <Button type="submit" disabled={changingPassword}>
                      {changingPassword ? "Salvando…" : "Atualizar senha"}
                    </Button>
                  </div>
                </form>
              </section>

              {user.role === "admin" ? (
                <section className={styles.card} aria-labelledby="account-devices-title">
                  <div className={styles.cardHeader}>
                    <h2 id="account-devices-title" className={styles.cardTitle}>
                      Dispositivos confiáveis
                    </h2>
                    <p className={styles.cardLead}>
                      Gerencie os aparelhos autorizados a acessar o workspace sem solicitar verificação em duas etapas.
                    </p>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.securityLinkRow}>
                      <div className={styles.securityLinkText}>
                        <p className={styles.securityLinkTitle}>Sessões e dispositivos</p>
                        <p className={styles.securityLinkLead}>
                          Revogue acessos antigos ou desconhecidos para manter a conta protegida.
                        </p>
                      </div>
                      <Link className={styles.inlineLink} to="/app/security/trusted-devices">
                        Gerenciar dispositivos →
                      </Link>
                    </div>
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
