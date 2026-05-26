import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import {
  createTenantUser,
  listTenantUsers,
  resetTenantUserPassword,
  updateTenantUser,
  type UserOut,
  type UserProvisionOut,
  type UserRole,
} from "../../api/auth";
import { getTenantId } from "../../lib/authStorage";
import {
  getNfseSettings,
  listNfseTributacaoNacionalCatalog,
  patchNfseSettings,
  testNfseMeiCredentials,
  type NfseSettingsOut,
  type NfseTributacaoNacionalItem,
} from "../../api/nfse";
import { getFinanceGateways, getFinanceSettings, type FinanceGatewaysOut } from "../../api/finance";
import type { DashboardOutletContext } from "../dashboardContext";
import loginStyles from "../LoginPage.module.css";
import formLayout from "../formLayout.module.css";
import { AdminApiKeysTab } from "./AdminApiKeysTab";
import { ManagementView } from "./ManagementView";
import styles from "./AdminPage.module.css";

function tabFromSearch(tabParam: string | null): "company" | "users" | "pagamentos" | "fiscal" | "apikeys" {
  if (tabParam === "empresa" || tabParam === "company") return "company";
  if (tabParam === "usuarios" || tabParam === "users") return "users";
  if (tabParam === "pagamentos" || tabParam === "pagarme" || tabParam === "pagar-me") return "pagamentos";
  if (tabParam === "fiscal") return "fiscal";
  if (tabParam === "api-keys" || tabParam === "chaves") return "apikeys";
  return "company";
}

export function AdminPage() {
  const ctx = useOutletContext<DashboardOutletContext | undefined>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tab = tabFromSearch(searchParams.get("tab"));

  const [payLoading, setPayLoading] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);
  const [payFinanceEnabled, setPayFinanceEnabled] = useState<boolean | null>(null);
  const [payGateways, setPayGateways] = useState<FinanceGatewaysOut | null>(null);

  const [users, setUsers] = useState<UserOut[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersErr, setUsersErr] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("receptionist");
  const [creating, setCreating] = useState(false);
  const [provisioned, setProvisioned] = useState<UserProvisionOut | null>(null);
  const [createErr, setCreateErr] = useState("");

  const [editing, setEditing] = useState<UserOut | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("receptionist");
  const [editActive, setEditActive] = useState(true);
  const [savingUser, setSavingUser] = useState(false);
  const [editErr, setEditErr] = useState("");
  const [resettingPw, setResettingPw] = useState(false);
  const [nfseSettings, setNfseSettings] = useState<NfseSettingsOut | null>(null);
  const [nfseLoading, setNfseLoading] = useState(false);
  const [nfseSaving, setNfseSaving] = useState(false);
  const [nfseMsg, setNfseMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [meiCertFile, setMeiCertFile] = useState<File | null>(null);
  const [meiCertPassword, setMeiCertPassword] = useState("");
  const [meiPortalUser, setMeiPortalUser] = useState("");
  const [meiPortalPassword, setMeiPortalPassword] = useState("");
  const [focusApiKey, setFocusApiKey] = useState("");
  const [testingMei, setTestingMei] = useState(false);
  const [meiTestSefinConnectivity, setMeiTestSefinConnectivity] = useState(true);
  const [changeMeiCertPassword, setChangeMeiCertPassword] = useState(false);
  const [changePortalPassword, setChangePortalPassword] = useState(false);
  const [tribCatalogAdmin, setTribCatalogAdmin] = useState<NfseTributacaoNacionalItem[]>([]);
  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setUsersErr("");
    try {
      const list = await listTenantUsers({ limit: 200 });
      setUsers(list);
    } catch (e) {
      setUsersErr(friendlyError(e instanceof Error ? e.message : "Erro ao carregar usuários."));
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "users") void loadUsers();
  }, [tab, loadUsers]);

  useEffect(() => {
    if (tab !== "pagamentos") return;
    let cancelled = false;
    void (async () => {
      setPayLoading(true);
      setPayErr(null);
      try {
        const [st, gw] = await Promise.all([getFinanceSettings(), getFinanceGateways()]);
        if (cancelled) return;
        setPayFinanceEnabled(Boolean(st.finance_enabled));
        setPayGateways(gw);
      } catch (e) {
        if (!cancelled) setPayErr(e instanceof Error ? e.message : "Erro ao carregar integrações de pagamento.");
      } finally {
        if (!cancelled) setPayLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  useEffect(() => {
    if (tab !== "fiscal") return;
    let cancelled = false;
    void (async () => {
      setNfseLoading(true);
      setNfseMsg(null);
      try {
        const [row, tribCat] = await Promise.all([getNfseSettings(), listNfseTributacaoNacionalCatalog()]);
        if (!cancelled) {
          setNfseSettings({
            ...row,
            default_codigo_tributacao_nacional: row.default_codigo_tributacao_nacional ?? null,
            default_codigo_nbs: row.default_codigo_nbs ?? null,
            prestador_inscricao_municipal: row.prestador_inscricao_municipal ?? null,
            dps_serie: row.dps_serie ?? null,
          });
          setTribCatalogAdmin(tribCat);
        }
      } catch (e) {
        if (!cancelled) {
          setNfseMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao carregar NFS-e." });
          setTribCatalogAdmin([]);
        }
      } finally {
        if (!cancelled) setNfseLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  useEffect(() => {
    if (!editing) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setEditing(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  if (!ctx || ctx.user.role !== "admin") {
    return <Navigate to="/app" replace />;
  }

  const { tenant: workspaceTenant, user: adminUser, refreshWorkspace } = ctx;

  async function onCreateUser(e: FormEvent) {
    e.preventDefault();
    setCreateErr("");
    const tid = getTenantId();
    if (tid == null) {
      setCreateErr("Sessão inválida. Entre novamente.");
      return;
    }
    setCreating(true);
    try {
      const row = await createTenantUser({
        tenant_id: tid,
        full_name: newName.trim(),
        email: newEmail.trim().toLowerCase(),
        role: newRole,
      });
      setProvisioned(row);
      setNewName("");
      setNewEmail("");
      setNewRole("receptionist");
      await loadUsers();
      await refreshWorkspace();
    } catch (err) {
      setCreateErr(friendlyError(err instanceof Error ? err.message : "Erro ao criar usuário."));
    } finally {
      setCreating(false);
    }
  }

  function openEdit(u: UserOut) {
    setEditing(u);
    setEditName(u.full_name);
    setEditEmail(u.email);
    setEditRole(u.role);
    setEditActive(u.is_active);
    setEditErr("");
  }

  async function onResetPassword() {
    if (!editing || editing.id === adminUser.id) return;
    if (
      !window.confirm(
        `Gerar nova senha temporária para ${editing.full_name}? O usuário precisará usar essa senha no próximo login e será obrigado a trocá-la.`,
      )
    ) {
      return;
    }
    setEditErr("");
    setResettingPw(true);
    try {
      const row = await resetTenantUserPassword(editing.id);
      setProvisioned(row);
      setEditing(null);
      await loadUsers();
      await refreshWorkspace();
    } catch (err) {
      setEditErr(friendlyError(err instanceof Error ? err.message : "Erro ao redefinir senha."));
    } finally {
      setResettingPw(false);
    }
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditErr("");
    setSavingUser(true);
    try {
      const isSelf = editing.id === adminUser.id;
      if (isSelf) {
        await updateTenantUser(editing.id, {
          full_name: editName.trim(),
          email: editEmail.trim().toLowerCase(),
        });
      } else {
        await updateTenantUser(editing.id, {
          full_name: editName.trim(),
          email: editEmail.trim().toLowerCase(),
          role: editRole,
          is_active: editActive,
        });
      }
      setEditing(null);
      await loadUsers();
      await refreshWorkspace();
    } catch (err) {
      setEditErr(friendlyError(err instanceof Error ? err.message : "Erro ao salvar."));
    } finally {
      setSavingUser(false);
    }
  }

  async function onSaveNfse(e: FormEvent) {
    e.preventDefault();
    if (!nfseSettings) return;
    if (meiCertFile && !nfseSettings.has_mei_certificate && !meiCertPassword.trim()) {
      setNfseMsg({ kind: "err", text: "Para o primeiro cadastro do certificado A1, informe também a senha." });
      return;
    }
    setNfseSaving(true);
    setNfseMsg(null);
    try {
      let meiCertificateBase64: string | undefined;
      if (meiCertFile) meiCertificateBase64 = await fileToBase64(meiCertFile);
      const next = await patchNfseSettings({
        mei_opt_in: nfseSettings.mei_opt_in,
        default_optante_mei: nfseSettings.default_optante_mei,
        mei_environment: nfseSettings.mei_environment,
        auto_issue_on_payment: nfseSettings.auto_issue_on_payment,
        auto_nfse_provider: nfseSettings.auto_nfse_provider ?? null,
        default_codigo_tributacao_nacional: nfseSettings.default_codigo_tributacao_nacional?.trim() || null,
        default_codigo_nbs: nfseSettings.default_codigo_nbs?.trim() || null,
        prestador_inscricao_municipal: nfseSettings.prestador_inscricao_municipal?.trim() || null,
        dps_serie: nfseSettings.dps_serie?.trim() || null,
        ...(meiCertificateBase64 ? { mei_certificate_base64: meiCertificateBase64 } : {}),
        ...(meiCertFile ? { mei_certificate_file_name: meiCertFile.name } : {}),
        ...(meiCertPassword ? { mei_certificate_password: meiCertPassword } : {}),
        ...(meiPortalUser ? { mei_portal_username: meiPortalUser } : {}),
        ...(meiPortalPassword ? { mei_portal_password: meiPortalPassword } : {}),
        ...(focusApiKey ? { focus_api_key: focusApiKey } : {}),
      });
      setNfseSettings(next);
      setMeiCertFile(null);
      setMeiCertPassword("");
      setMeiPortalUser("");
      setMeiPortalPassword("");
      setFocusApiKey("");
      setChangeMeiCertPassword(false);
      setChangePortalPassword(false);
      setNfseMsg({ kind: "ok", text: "Configurações NFS-e salvas." });
    } catch (e) {
      setNfseMsg({ kind: "err", text: e instanceof Error ? e.message : "Erro ao salvar NFS-e." });
    } finally {
      setNfseSaving(false);
    }
  }

  async function onTestMeiCredentials() {
    if (!nfseSettings) return;
    setTestingMei(true);
    setNfseMsg(null);
    try {
      const mei_certificate_base64 = meiCertFile ? await fileToBase64(meiCertFile) : undefined;
      const out = await testNfseMeiCredentials({
        ...(mei_certificate_base64 ? { mei_certificate_base64 } : {}),
        ...(meiCertPassword ? { mei_certificate_password: meiCertPassword } : {}),
        ...(meiPortalUser ? { mei_portal_username: meiPortalUser } : {}),
        ...(meiPortalPassword ? { mei_portal_password: meiPortalPassword } : {}),
        test_sefin_connectivity: meiTestSefinConnectivity,
      });
      setNfseMsg({ kind: out.ok ? "ok" : "err", text: out.message });
      const refreshed = await getNfseSettings();
      setNfseSettings(refreshed);
    } catch (e) {
      setNfseMsg({ kind: "err", text: e instanceof Error ? e.message : "Falha ao testar credenciais MEI." });
    } finally {
      setTestingMei(false);
    }
  }

  return (
    <div className={styles.wrap}>
      {tab === "company" ? (
        <ManagementView tenant={workspaceTenant} refreshWorkspace={refreshWorkspace} />
      ) : tab === "users" ? (
        <section className={styles.panel} aria-labelledby="admin-users-title">
          <h2 id="admin-users-title" className={styles.panelTitle}>
            Usuários do workspace
          </h2>
          <p className={styles.panelLead}>
            Novos usuários recebem senha temporária e devem alterá-la no primeiro acesso. Perfis: administrador, técnico
            e recepção.
          </p>

          {provisioned ? (
            <div className={styles.provision}>
              <p className={styles.provisionTitle}>Senha temporária</p>
              <p className={styles.muted}>
                Envie este acesso com segurança para <strong>{provisioned.email}</strong> (novo usuário ou redefinição).
              </p>
              <div className={styles.provisionRow}>
                <span>Senha temporária:</span>
                <code className={styles.code}>{provisioned.temporary_password}</code>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => {
                    void navigator.clipboard.writeText(provisioned.temporary_password);
                  }}
                >
                  Copiar
                </button>
                <button type="button" className={styles.btnGhost} onClick={() => setProvisioned(null)}>
                  Ocultar
                </button>
              </div>
            </div>
          ) : null}

          <form className={styles.toolbar} onSubmit={onCreateUser}>
            <div className={styles.toolbarFields}>
              <div className={formLayout.field}>
                <label className={loginStyles.label} htmlFor="nu-name">
                  Nome completo
                </label>
                <input
                  id="nu-name"
                  className={loginStyles.input}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
              </div>
              <div className={formLayout.field}>
                <label className={loginStyles.label} htmlFor="nu-email">
                  E-mail
                </label>
                <input
                  id="nu-email"
                  className={loginStyles.input}
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
              </div>
              <div className={formLayout.field}>
                <label className={loginStyles.label} htmlFor="nu-role">
                  Perfil
                </label>
                <select
                  id="nu-role"
                  className={loginStyles.select}
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                >
                  <option value="receptionist">Recepção</option>
                  <option value="technician">Técnico</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>
            </div>
            <button type="submit" className={styles.btnPrimary} disabled={creating}>
              {creating ? "Criando…" : "Novo usuário"}
            </button>
          </form>
          {createErr ? <p className={styles.msgErr}>{createErr}</p> : null}

          {loadingUsers ? <p className={styles.empty}>Carregando usuários…</p> : null}
          {usersErr ? <p className={styles.msgErr}>{usersErr}</p> : null}
          {!loadingUsers && !usersErr && users.length === 0 ? (
            <p className={styles.empty}>Nenhum usuário listado.</p>
          ) : null}

          {!loadingUsers && users.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Perfil</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.full_name}</td>
                      <td>{u.email}</td>
                      <td>{roleLabel(u.role)}</td>
                      <td>
                        {u.is_active ? <span className={styles.badgeOn}>Ativo</span> : <span className={styles.badgeOff}>Inativo</span>}
                        {u.must_change_password ? (
                          <span className={styles.muted} title="Deve alterar a senha no próximo login">
                            {" "}
                            · senha provisória
                          </span>
                        ) : null}
                      </td>
                      <td className={styles.userActionsCell}>
                        {u.role === "technician" ? (
                          <button
                            type="button"
                            className={styles.btnGhost}
                            onClick={() => navigate(`/app/agenda?technician_id=${u.id}&mode=config`)}
                          >
                            Agenda
                          </button>
                        ) : null}
                        <button type="button" className={styles.btnGhost} onClick={() => openEdit(u)}>
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : tab === "pagamentos" ? (
        <section className={styles.panel} aria-labelledby="admin-pagamentos-title">
          <h2 id="admin-pagamentos-title" className={styles.panelTitle}>
            Pagamentos online (Pagar.me / Stone)
          </h2>
          <p className={styles.panelLead}>
            PIX, boleto e cartão via API Pagar.me (conta Stone). As chaves ficam cifradas no servidor; a chave pública{" "}
            <code>pk_…</code> é usada só no navegador para tokenizar cartão.
          </p>
          {payLoading ? <p className={styles.empty}>Carregando…</p> : null}
          {payErr ? <p className={styles.msgErr}>{payErr}</p> : null}
          {!payLoading && payFinanceEnabled === false ? (
            <p className={styles.msgErr}>
              O módulo financeiro está desativado neste workspace. Ative em{" "}
              <Link to="/app/finance/settings">Financeiro → Configurações</Link> para usar cobranças.
            </p>
          ) : null}
          {!payLoading && payFinanceEnabled && payGateways ? (
            <div className={styles.sectionCard}>
              <h3 className={styles.subsectionTitle}>Pagar.me (Stone)</h3>
              <p className={styles.panelLead}>
                Status:{" "}
                <strong>{payGateways.stone.connected ? "Conectado" : "Desconectado"}</strong>
                {payGateways.stone.secret_key_hint ? ` · sk ${payGateways.stone.secret_key_hint}` : ""}
                {payGateways.stone.public_key_hint ? ` · pk ${payGateways.stone.public_key_hint}` : ""}
                {payGateways.stone.sandbox ? " · sandbox" : ""}
              </p>
              {payGateways.stone.webhook_url ? (
                <div className={styles.provisionRow} style={{ marginTop: 12, flexWrap: "wrap" }}>
                  <span>Webhook (painel Pagar.me):</span>
                  <code className={styles.code} style={{ wordBreak: "break-all", maxWidth: "100%" }}>
                    {payGateways.stone.webhook_url}
                  </code>
                  <button
                    type="button"
                    className={styles.btnGhost}
                    onClick={() => void navigator.clipboard.writeText(payGateways.stone.webhook_url ?? "")}
                  >
                    Copiar URL
                  </button>
                </div>
              ) : (
                <p className={styles.muted} style={{ marginTop: 8 }}>
                  Defina <code>API_PUBLIC_BASE_URL</code> no backend para exibir a URL do webhook aqui.
                </p>
              )}
              <div className={styles.actions} style={{ marginTop: 16 }}>
                <Link className={styles.btnPrimary} to="/app/finance/settings/accounts?gateway=stone">
                  Abrir Contas e carteiras (configurar Pagar.me)
                </Link>
                <Link className={styles.btnGhost} to="/app/finance">
                  Lançamentos financeiros
                </Link>
              </div>
              <p className={styles.muted} style={{ marginTop: 16 }}>
                Documentação:{" "}
                <a href="https://docs.pagar.me/" target="_blank" rel="noreferrer">
                  docs.pagar.me
                </a>
              </p>
              <h3 className={styles.subsectionTitle} style={{ marginTop: 24 }}>
                Outros gateways
              </h3>
              <ul className={styles.panelLead} style={{ marginTop: 8 }}>
                <li>
                  Mercado Pago: {payGateways.mercadopago.connected ? "conectado" : "desconectado"}
                  {payGateways.mercadopago.connected && payGateways.mercadopago.account_label
                    ? ` (${payGateways.mercadopago.account_label})`
                    : ""}
                </li>
                <li>Asaas: {payGateways.asaas.connected ? "conectado" : "desconectado"}</li>
              </ul>
            </div>
          ) : null}
        </section>
      ) : tab === "apikeys" ? (
        <AdminApiKeysTab />
      ) : (
        <section className={styles.panel} aria-labelledby="admin-fiscal-title">
          <h2 id="admin-fiscal-title" className={styles.panelTitle}>
            Configurações fiscais e NFS-e
          </h2>
          <p className={styles.panelLead}>
            Certificado digital A1, ambiente de homologação ou produção e tributação no padrão nacional da NFS-e. Clientes
            enquadrados como MEI utilizam a NFS-e Nacional; demais perfis seguirão para integração Focus quando
            disponível.
          </p>
          {nfseLoading ? <p className={styles.empty}>Carregando configurações…</p> : null}
          {!nfseLoading && nfseSettings ? (
            <form className={styles.form} onSubmit={onSaveNfse}>
              <div className={styles.sectionCard}>
                <h3 className={styles.subsectionTitle}>MEI — NFS-e Nacional</h3>
                <p className={styles.muted}>
                  O prestador é identificado pelo <strong>CNPJ da empresa</strong> e pelo certificado A1. Guarde a senha do
                  certificado com segurança; ela não é exibida após o salvamento.
                </p>
                <div className={formLayout.fieldGroup}>
                <label className={loginStyles.label}>Canal de emissão (prestador)</label>
                <p className={styles.muted}>
                  Ao cadastrar o <strong>CNPJ</strong>, consultamos a Receita: empresas <strong>MEI</strong> usam o canal{" "}
                  <strong>NFS-e nacional</strong>; demais perfis sugerem <strong>Focus NFe</strong> (credencial própria).
                  Você pode ajustar ou limpar a sugestão abaixo.
                </p>
                <select
                  className={loginStyles.select}
                  value={nfseSettings.auto_nfse_provider ?? ""}
                  onChange={(e) =>
                    setNfseSettings((prev) =>
                      prev
                        ? {
                            ...prev,
                            auto_nfse_provider: e.target.value
                              ? (e.target.value as "national_mei" | "focus")
                              : null,
                          }
                        : prev,
                    )
                  }
                >
                  <option value="">Automático (conforme consulta CNPJ / opt-ins)</option>
                  <option value="national_mei">Forçar NFS-e nacional (MEI)</option>
                  <option value="focus">Forçar Focus NFe</option>
                </select>
                </div>
                <label className={styles.weekday}>
                  <input
                    type="checkbox"
                    checked={nfseSettings.mei_opt_in}
                    onChange={(e) => setNfseSettings((prev) => (prev ? { ...prev, mei_opt_in: e.target.checked } : prev))}
                  />
                  Habilitar emissão MEI nacional
                </label>
                <label className={styles.weekday}>
                  <input
                    type="checkbox"
                    checked={nfseSettings.default_optante_mei}
                    onChange={(e) =>
                      setNfseSettings((prev) => (prev ? { ...prev, default_optante_mei: e.target.checked } : prev))
                    }
                  />
                  Marcar novos clientes como MEI por padrão
                </label>
                <div className={formLayout.field}>
                <label className={loginStyles.label}>Ambiente</label>
                <select
                  className={loginStyles.select}
                  value={nfseSettings.mei_environment}
                  onChange={(e) =>
                    setNfseSettings((prev) =>
                      prev ? { ...prev, mei_environment: e.target.value as "homolog" | "producao" } : prev,
                    )
                  }
                >
                  <option value="homolog">Homologação</option>
                  <option value="producao">Produção</option>
                </select>
                </div>

                <div className={styles.fiscalDpsDefaults}>
                  <h4 className={styles.fiscalSubheading}>Padrão do tenant (NFS-e) — uso quando o serviço não tem código</h4>
                  <p className={styles.muted}>
                    O lugar certo para <strong>cTribNac</strong> e <strong>NBS</strong> é o cadastro de cada item em{" "}
                    <strong>Serviços</strong> (cada tipo de serviço costuma ter a própria combinação). Os campos abaixo são{" "}
                    <strong>reserva</strong>: emissão avulsa, itens de OS ainda sem código fiscal, ou até migrar o cadastro. Na
                    emissão por OS, o sistema usa primeiro os códigos dos serviços da ordem; só completa com estes padrões o que
                    faltar. Confira sempre as tabelas oficiais — a lista sugerida é apenas auxiliar.
                  </p>
                  <div className={formLayout.stack}>
                  <div className={formLayout.field}>
                  <label className={loginStyles.label}>Código de tributação nacional (cTribNac)</label>
                  <input
                    className={loginStyles.input}
                    list="admin-nfse-trib-datalist"
                    value={nfseSettings.default_codigo_tributacao_nacional ?? ""}
                    onChange={(e) =>
                      setNfseSettings((prev) =>
                        prev ? { ...prev, default_codigo_tributacao_nacional: e.target.value || null } : prev,
                      )
                    }
                    placeholder="Obrigatório na NFS-e — use a tabela oficial ou a lista sugerida"
                    maxLength={32}
                    autoComplete="off"
                  />
                  <datalist id="admin-nfse-trib-datalist">
                    {tribCatalogAdmin.map((t) => (
                      <option key={t.codigo} value={t.codigo} label={t.descricao} />
                    ))}
                  </datalist>
                  </div>
                  <div className={formLayout.field}>
                  <label className={loginStyles.label}>Código NBS (padrão do tenant)</label>
                  <input
                    className={loginStyles.input}
                    list="admin-nfse-nbs-datalist"
                    value={nfseSettings.default_codigo_nbs ?? ""}
                    onChange={(e) =>
                      setNfseSettings((prev) =>
                        prev ? { ...prev, default_codigo_nbs: e.target.value || null } : prev,
                      )
                    }
                    placeholder="Obrigatório na NFS-e nacional se não vier do serviço/OS — use a tabela oficial"
                    maxLength={32}
                    autoComplete="off"
                  />
                  <datalist id="admin-nfse-nbs-datalist">
                    {[...new Set(tribCatalogAdmin.map((t) => t.nbs_sugerido).filter((v): v is string => Boolean(v && String(v).trim())))].map(
                      (nbs) => (
                        <option key={nbs} value={nbs} />
                      ),
                    )}
                  </datalist>
                  </div>
                  <div className={formLayout.field}>
                  <label className={loginStyles.label}>Série da DPS (nacional)</label>
                  <input
                    className={loginStyles.input}
                    value={nfseSettings.dps_serie ?? ""}
                    onChange={(e) =>
                      setNfseSettings((prev) =>
                        prev ? { ...prev, dps_serie: e.target.value || null } : prev,
                      )
                    }
                    placeholder="Ex.: 70000 — igual ao emissor nacional / portal (vazio = NF)"
                    maxLength={20}
                    autoComplete="off"
                  />
                  <p className={styles.muted}>
                    O mesmo valor exibido no DANFSe como &quot;Série do DPS&quot;. Alternativa no servidor:{" "}
                    <code className={styles.code}>NFSE_DPS_SERIE</code>.
                  </p>
                  </div>
                  <div className={formLayout.field}>
                  <label className={loginStyles.label}>Inscrição municipal do prestador — NFS-e nacional (opcional)</label>
                  <input
                    className={loginStyles.input}
                    value={nfseSettings.prestador_inscricao_municipal ?? ""}
                    onChange={(e) =>
                      setNfseSettings((prev) =>
                        prev ? { ...prev, prestador_inscricao_municipal: e.target.value || null } : prev,
                      )
                    }
                    placeholder="Tag IM na DPS — se o município exigir (até 15 caracteres)"
                    maxLength={15}
                    autoComplete="off"
                  />
                  </div>
                  </div>
                </div>

                <div className={formLayout.field}>
                <label className={loginStyles.label}>Certificado A1 (.pfx / .p12)</label>
                {nfseSettings.has_mei_certificate ? (
                  <p className={styles.muted}>
                    Certificado digital já está guardado no servidor (por segurança, o navegador não reabre o arquivo
                    automaticamente).
                    {nfseSettings.mei_certificate_file_name ? (
                      <>
                        {" "}
                        Último arquivo enviado: <strong>{nfseSettings.mei_certificate_file_name}</strong>.
                      </>
                    ) : null}{" "}
                    Para substituir, escolha um novo .pfx/.p12 abaixo e clique em &quot;Salvar NFS-e&quot;.
                  </p>
                ) : null}
                <input
                  className={loginStyles.input}
                  type="file"
                  accept=".pfx,.p12,application/x-pkcs12"
                  onChange={(e) => setMeiCertFile(e.target.files?.[0] ?? null)}
                />
                {meiCertFile ? <p className={styles.muted}>Novo arquivo selecionado: {meiCertFile.name}</p> : null}
                </div>
                <div className={formLayout.field}>
                <label className={loginStyles.label}>Senha do certificado</label>
                {nfseSettings.has_mei_certificate && !changeMeiCertPassword ? (
                  <div className={styles.actions}>
                    <input className={loginStyles.input} type="password" value="********" disabled />
                    <button type="button" className={styles.btnGhost} onClick={() => setChangeMeiCertPassword(true)}>
                      Alterar senha
                    </button>
                  </div>
                ) : (
                  <input
                    className={loginStyles.input}
                    type="password"
                    value={meiCertPassword}
                    onChange={(e) => setMeiCertPassword(e.target.value)}
                    placeholder={nfseSettings.has_mei_certificate ? "Digite nova senha para atualizar" : "Digite a senha do A1"}
                  />
                )}
                </div>
                <div className={formLayout.field}>
                <label className={loginStyles.label}>Usuário portal nacional (opcional)</label>
                <input className={loginStyles.input} value={meiPortalUser} onChange={(e) => setMeiPortalUser(e.target.value)} />
                </div>
                <div className={formLayout.field}>
                <label className={loginStyles.label}>Senha portal nacional (opcional)</label>
                {nfseSettings.has_mei_portal_credentials && !changePortalPassword ? (
                  <div className={styles.actions}>
                    <input className={loginStyles.input} type="password" value="********" disabled />
                    <button type="button" className={styles.btnGhost} onClick={() => setChangePortalPassword(true)}>
                      Alterar senha
                    </button>
                  </div>
                ) : (
                  <input
                    className={loginStyles.input}
                    type="password"
                    value={meiPortalPassword}
                    onChange={(e) => setMeiPortalPassword(e.target.value)}
                    placeholder={nfseSettings.has_mei_portal_credentials ? "Digite nova senha do portal" : "Digite a senha do portal"}
                  />
                )}
                </div>
                <p className={styles.muted}>
                  Certificado salvo: {nfseSettings.has_mei_certificate ? "sim" : "não"} • Credenciais portal:{" "}
                  {nfseSettings.has_mei_portal_credentials ? "sim" : "não"}
                </p>
                <div className={styles.testStatusCard}>
                  <div className={styles.testStatusHead}>
                    <h4 className={styles.subsectionTitle}>Último teste MEI</h4>
                    {nfseSettings.mei_last_test_error ? (
                      <span className={`${styles.testBadge} ${styles.testBadgeError}`}>Erro</span>
                    ) : nfseSettings.mei_last_tested_at ? (
                      <span className={`${styles.testBadge} ${styles.testBadgeOk}`}>Sucesso</span>
                    ) : (
                      <span className={`${styles.testBadge} ${styles.testBadgeIdle}`}>Sem teste</span>
                    )}
                  </div>
                  <p className={styles.muted}>Executado em: {formatDateTimePtBr(nfseSettings.mei_last_tested_at)}</p>
                  {nfseSettings.mei_last_test_error ? (
                    <p className={styles.msgErrInline}>{nfseSettings.mei_last_test_error}</p>
                  ) : (
                    <p className={styles.msgOkInline}>
                      {nfseSettings.mei_last_tested_at
                        ? "Certificado validado com sucesso."
                        : "Execute o teste para validar certificado e senha."}
                    </p>
                  )}
                </div>
                <label className={styles.weekday}>
                  <input
                    type="checkbox"
                    checked={meiTestSefinConnectivity}
                    onChange={(e) => setMeiTestSefinConnectivity(e.target.checked)}
                  />
                  Incluir teste de conexão mTLS com o Sefin Nacional (ambiente da configuração acima)
                </label>
                <div className={styles.actions}>
                  <button type="button" className={styles.btnGhost} disabled={testingMei} onClick={() => void onTestMeiCredentials()}>
                    {testingMei ? "Testando credenciais..." : "Testar credenciais MEI"}
                  </button>
                </div>
              </div>

              <div className={styles.sectionCard}>
                <h3 className={styles.subsectionTitle}>Focus (não MEI)</h3>
                <label className={styles.weekday}>
                  <input
                    type="checkbox"
                    checked={nfseSettings.focus_opt_in}
                    onChange={(e) => setNfseSettings((prev) => (prev ? { ...prev, focus_opt_in: e.target.checked } : prev))}
                  />
                  Habilitar emissão via Focus (NFSe Nacional: POST /v2/nfsen)
                </label>
                <div className={formLayout.field}>
                <label className={loginStyles.label}>API key Focus</label>
                <input className={loginStyles.input} type="password" value={focusApiKey} onChange={(e) => setFocusApiKey(e.target.value)} />
                <p className={styles.muted}>API key salva: {nfseSettings.has_focus_api_key ? "sim" : "não"}</p>
                </div>
              </div>

              <div className={styles.sectionCard}>
                <h3 className={styles.subsectionTitle}>Automação</h3>
                <label className={styles.weekday}>
                  <input
                    type="checkbox"
                    checked={nfseSettings.auto_issue_on_payment}
                    onChange={(e) =>
                      setNfseSettings((prev) => (prev ? { ...prev, auto_issue_on_payment: e.target.checked } : prev))
                    }
                  />
                  Emitir NFS-e automaticamente após confirmação de pagamento
                </label>
              </div>

              <div className={styles.actions}>
                <button type="submit" className={styles.btnPrimary} disabled={nfseSaving}>
                  {nfseSaving ? "Salvando..." : "Salvar NFS-e"}
                </button>
              </div>
              {nfseMsg?.kind === "ok" ? <p className={styles.msgOk}>{nfseMsg.text}</p> : null}
              {nfseMsg?.kind === "err" ? <p className={styles.msgErr}>{nfseMsg.text}</p> : null}
            </form>
          ) : null}
        </section>
      )}

      {editing ? (
        <div className={styles.modalRoot} role="presentation">
          <button
            type="button"
            className={styles.modalBackdrop}
            aria-label="Fechar"
            onClick={() => setEditing(null)}
          />
          <div
            className={styles.modalCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-user-title"
          >
            <h3 id="edit-user-title" className={styles.modalTitle}>
              Editar usuário
            </h3>
            <form className={styles.form} onSubmit={onSaveEdit}>
              <div className={formLayout.stack}>
              <div className={formLayout.field}>
              <label className={loginStyles.label} htmlFor="eu-name">
                Nome completo
              </label>
              <input
                id="eu-name"
                className={loginStyles.input}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                required
              />
              </div>
              <div className={formLayout.field}>
              <label className={loginStyles.label} htmlFor="eu-email">
                E-mail
              </label>
              <input
                id="eu-email"
                className={loginStyles.input}
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                required
              />
              </div>
              <div className={formLayout.field}>
              <label className={loginStyles.label} htmlFor="eu-role">
                Perfil
              </label>
              <select
                id="eu-role"
                className={loginStyles.select}
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as UserRole)}
                disabled={editing.id === adminUser.id}
              >
                <option value="receptionist">Recepção</option>
                <option value="technician">Técnico</option>
                <option value="admin">Administrador</option>
              </select>
              </div>
              {editing.id === adminUser.id ? (
                <p className={styles.muted}>Você não pode alterar o próprio perfil aqui.</p>
              ) : null}
              <label className={styles.weekday}>
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  disabled={editing.id === adminUser.id}
                />
                Conta ativa
              </label>
              {editing.id === adminUser.id ? (
                <p className={styles.muted}>Não é possível desativar a própria conta.</p>
              ) : null}
              {editing.id !== adminUser.id ? (
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.btnGhost}
                    disabled={resettingPw || savingUser}
                    onClick={() => void onResetPassword()}
                  >
                    {resettingPw ? "Gerando…" : "Nova senha temporária"}
                  </button>
                </div>
              ) : null}
              {editErr ? <p className={styles.msgErr}>{editErr}</p> : null}
              <div className={styles.actions}>
                <button type="submit" className={styles.btnPrimary} disabled={savingUser}>
                  {savingUser ? "Salvando…" : "Salvar"}
                </button>
                <button type="button" className={styles.btnGhost} onClick={() => setEditing(null)}>
                  Cancelar
                </button>
              </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function friendlyError(message: string): string {
  const m = message.trim();
  if (!m) return "Ocorreu um erro inesperado.";
  if (m.toLowerCase().includes("network") || m.toLowerCase().includes("failed to fetch")) {
    return "Falha de conexão. Verifique sua internet e tente novamente.";
  }
  return m;
}

function roleLabel(role: UserRole): string {
  switch (role) {
    case "admin":
      return "Administrador";
    case "technician":
      return "Técnico";
    case "receptionist":
      return "Recepção";
    default:
      return role;
  }
}

function formatDateTimePtBr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}
