import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
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
import { toast } from "../../lib/toast";
import { ToastHost } from "../../components/ToastHost";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Input, Select } from "../../components/ui/input";
import { DeleteConfirmModal } from "../../components/ui/delete-confirm-modal";
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import layout from "./ManagementView.module.css";
import styles from "./UsersView.module.css";

type Props = {
  adminUser: UserOut;
  refreshWorkspace: () => Promise<void>;
};

function UsersHeaderIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
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

function friendlyError(message: string): string {
  const m = message.trim();
  if (!m) return "Ocorreu um erro inesperado.";
  if (m.toLowerCase().includes("network") || m.toLowerCase().includes("failed to fetch")) {
    return "Falha de conexão. Verifique sua internet e tente novamente.";
  }
  return m;
}

function Field({ id, label, hint, children }: { id?: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      {children}
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
}

export function UsersView({ adminUser, refreshWorkspace }: Props) {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserOut[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("receptionist");
  const [creating, setCreating] = useState(false);
  const [provisioned, setProvisioned] = useState<UserProvisionOut | null>(null);

  const [editing, setEditing] = useState<UserOut | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<UserRole>("receptionist");
  const [editActive, setEditActive] = useState(true);
  const [savingUser, setSavingUser] = useState(false);
  const [resetPwOpen, setResetPwOpen] = useState(false);
  const [resettingPw, setResettingPw] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const list = await listTenantUsers({ limit: 200 });
      setUsers(list);
    } catch (e) {
      toast.error(friendlyError(e instanceof Error ? e.message : "Erro ao carregar usuários."));
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function onCreateUser(e: FormEvent) {
    e.preventDefault();
    const tid = getTenantId();
    if (tid == null) {
      toast.error("Sessão inválida. Entre novamente.");
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
      toast.success("Usuário criado com sucesso.");
    } catch (err) {
      toast.error(friendlyError(err instanceof Error ? err.message : "Erro ao criar usuário."));
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
  }

  async function onConfirmResetPassword() {
    if (!editing || editing.id === adminUser.id) return;
    setResettingPw(true);
    try {
      const row = await resetTenantUserPassword(editing.id);
      setProvisioned(row);
      setResetPwOpen(false);
      setEditing(null);
      await loadUsers();
      await refreshWorkspace();
      toast.success("Nova senha temporária gerada.");
    } catch (err) {
      toast.error(friendlyError(err instanceof Error ? err.message : "Erro ao redefinir senha."));
    } finally {
      setResettingPw(false);
    }
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
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
      toast.success("Usuário atualizado.");
    } catch (err) {
      toast.error(friendlyError(err instanceof Error ? err.message : "Erro ao salvar."));
    } finally {
      setSavingUser(false);
    }
  }

  return (
    <section className={layout.wrap} aria-labelledby="admin-users-title">
      <ToastHost />

      <header className={layout.pageHeader}>
        <nav className={layout.breadcrumb} aria-label="Navegação">
          <span className={layout.breadcrumbCurrent}>Administração</span>
          <span className={layout.breadcrumbSep} aria-hidden>
            /
          </span>
          <span>Usuários</span>
        </nav>
        <div className={layout.pageHeaderMain}>
          <span className={layout.pageHeaderIcon} aria-hidden>
            <UsersHeaderIcon />
          </span>
          <div className={layout.pageHeaderText}>
            <h1 id="admin-users-title" className={layout.pageTitle}>
              Usuários do workspace
            </h1>
            <p className={layout.pageLead}>
              Novos usuários recebem senha temporária e devem alterá-la no primeiro acesso. Perfis: administrador,
              técnico e recepção.
            </p>
          </div>
        </div>
      </header>

      {provisioned ? (
        <Card>
          <CardContent className={styles.provision}>
            <p className={styles.provisionTitle}>Senha temporária gerada</p>
            <p className={styles.provisionText}>
              Envie este acesso com segurança para <strong>{provisioned.email}</strong> (novo usuário ou redefinição).
            </p>
            <div className={styles.provisionRow}>
              <span className={styles.hint}>Senha:</span>
              <code className={styles.code}>{provisioned.temporary_password}</code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void navigator.clipboard.writeText(provisioned.temporary_password)}
              >
                Copiar
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setProvisioned(null)}>
                Ocultar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className={styles.formStack}>
          <h2 className={layout.sectionTitle}>Novo usuário</h2>
          <p className={layout.sectionLead}>Cadastre colaboradores com perfil de acesso ao workspace.</p>
          <form className={styles.formStack} onSubmit={(e) => void onCreateUser(e)}>
            <div className={`${styles.grid} ${styles.gridMd3}`}>
              <Field id="nu-name" label="Nome completo">
                <Input
                  id="nu-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nome e sobrenome"
                  required
                />
              </Field>
              <Field id="nu-email" label="E-mail">
                <Input
                  id="nu-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="email@empresa.com.br"
                  required
                />
              </Field>
              <Field id="nu-role" label="Perfil">
                <Select id="nu-role" value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)}>
                  <option value="receptionist">Recepção</option>
                  <option value="technician">Técnico</option>
                  <option value="admin">Administrador</option>
                </Select>
              </Field>
            </div>
            <div className={styles.formActions}>
              <Button type="submit" variant="default" disabled={creating}>
                {creating ? "Criando…" : "Novo usuário"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className={styles.formStack}>
          <h2 className={layout.sectionTitle}>Equipe cadastrada</h2>
          <p className={layout.sectionLead}>
            {loadingUsers ? "Carregando…" : `${users.length} usuário(s) neste workspace.`}
          </p>

          {!loadingUsers && users.length === 0 ? <p className={styles.empty}>Nenhum usuário listado.</p> : null}

          {!loadingUsers && users.length > 0 ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Perfil</th>
                    <th>Status</th>
                    <th aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className={styles.userName}>{u.full_name}</td>
                      <td className={styles.userEmail}>{u.email}</td>
                      <td>{roleLabel(u.role)}</td>
                      <td>
                        {u.is_active ? (
                          <span className={styles.badgeOn}>Ativo</span>
                        ) : (
                          <span className={styles.badgeOff}>Inativo</span>
                        )}
                        {u.must_change_password ? (
                          <span className={styles.badgePw} title="Deve alterar a senha no próximo login">
                            · senha provisória
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <div className={styles.actionsCell}>
                          {u.role === "technician" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => navigate(`/app/agenda?technician_id=${u.id}&mode=config`)}
                            >
                              Agenda
                            </Button>
                          ) : null}
                          <Button type="button" variant="outline" size="sm" onClick={() => openEdit(u)}>
                            Editar
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

      <AlertDialog open={editing !== null} onOpenChange={(open) => !open && !savingUser && setEditing(null)}>
        <AlertDialogContent wide labelledBy="edit-user-title">
          <AlertDialogHeader>
            <AlertDialogTitle id="edit-user-title">Editar usuário</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogBody>
            <form id="edit-user-form" className={styles.editStack} onSubmit={(e) => void onSaveEdit(e)}>
              <Field id="eu-name" label="Nome completo">
                <Input id="eu-name" value={editName} onChange={(e) => setEditName(e.target.value)} required />
              </Field>
              <Field id="eu-email" label="E-mail">
                <Input
                  id="eu-email"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                />
              </Field>
              <Field id="eu-role" label="Perfil">
                <Select
                  id="eu-role"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  disabled={editing?.id === adminUser.id}
                >
                  <option value="receptionist">Recepção</option>
                  <option value="technician">Técnico</option>
                  <option value="admin">Administrador</option>
                </Select>
              </Field>
              {editing?.id === adminUser.id ? (
                <p className={styles.hint}>Você não pode alterar o próprio perfil aqui.</p>
              ) : null}
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  disabled={editing?.id === adminUser.id}
                />
                Conta ativa
              </label>
              {editing?.id === adminUser.id ? (
                <p className={styles.hint}>Não é possível desativar a própria conta.</p>
              ) : null}
            </form>
          </AlertDialogBody>
          <AlertDialogFooter>
            {editing && editing.id !== adminUser.id ? (
              <Button
                type="button"
                variant="outline"
                disabled={resettingPw || savingUser}
                onClick={() => setResetPwOpen(true)}
              >
                Nova senha temporária
              </Button>
            ) : null}
            <AlertDialogCancel disabled={savingUser} onClick={() => setEditing(null)}>
              Cancelar
            </AlertDialogCancel>
            <Button type="submit" form="edit-user-form" variant="default" disabled={savingUser}>
              {savingUser ? "Salvando…" : "Salvar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeleteConfirmModal
        open={resetPwOpen}
        onOpenChange={(open) => {
          if (!open && !resettingPw) setResetPwOpen(false);
        }}
        title="Nova senha temporária"
        description={
          editing
            ? `Gerar nova senha temporária para ${editing.full_name}? O usuário precisará usá-la no próximo login e será obrigado a trocá-la.`
            : ""
        }
        confirmLabel="Gerar senha"
        busyLabel="Gerando…"
        confirmVariant="default"
        busy={resettingPw}
        onConfirm={() => void onConfirmResetPassword()}
      />
    </section>
  );
}
