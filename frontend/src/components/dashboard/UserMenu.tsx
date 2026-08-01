import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { UserOut } from "../../api/auth";
import { roleLabel, userInitial } from "../../lib/userDisplay";
import { NavIconBuilding, NavIconLogOut, NavIconUserCircle, NavIconWallet } from "./NavIcons";
import styles from "./UserMenu.module.css";

type UserMenuProps = {
  user: UserOut;
  isAdmin: boolean;
  onLogout: () => void;
  onOpenWorkspace: () => void;
  subtitleMode?: "email" | "role";
};

export function UserMenu({ user, isAdmin, onLogout, onOpenWorkspace, subtitleMode = "email" }: UserMenuProps) {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function goToAccount() {
    setOpen(false);
    navigate("/app/conta");
  }

  function openWorkspace() {
    setOpen(false);
    onOpenWorkspace();
  }

  function goToPlans() {
    setOpen(false);
    navigate("/app/planos");
  }

  function handleLogout() {
    setOpen(false);
    onLogout();
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Menu da conta"
      >
        <span className={styles.avatar} aria-hidden>
          {userInitial(user.full_name)}
        </span>
        <span className={styles.meta}>
          <span className={styles.name}>{user.full_name}</span>
          <span className={styles.email}>
            {subtitleMode === "role" ? roleLabel(user.role) : user.email}
          </span>
        </span>
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`} aria-hidden>
          <svg viewBox="0 0 24 24">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {open ? (
        <div className={styles.menu} role="menu" aria-label="Conta">
          <div className={styles.menuHeader}>
            <span className={styles.menuName}>{user.full_name}</span>
            <span className={styles.menuEmail}>{user.email}</span>
            <span className={styles.roleBadge}>{roleLabel(user.role)}</span>
          </div>

          <button type="button" className={styles.menuItem} role="menuitem" onClick={goToAccount}>
            <span className={styles.menuItemIcon} aria-hidden>
              <NavIconUserCircle />
            </span>
            Minha conta
          </button>

          {isAdmin ? (
            <button type="button" className={styles.menuItem} role="menuitem" onClick={openWorkspace}>
              <span className={styles.menuItemIcon} aria-hidden>
                <NavIconBuilding />
              </span>
              Administração do workspace
            </button>
          ) : null}

          {isAdmin ? (
            <button type="button" className={styles.menuItem} role="menuitem" onClick={goToPlans}>
              <span className={styles.menuItemIcon} aria-hidden>
                <NavIconWallet />
              </span>
              Plano e assinatura
            </button>
          ) : null}

          <hr className={styles.menuDivider} />

          <button type="button" className={`${styles.menuItem} ${styles.logout}`} role="menuitem" onClick={handleLogout}>
            <span className={styles.menuItemIcon} aria-hidden>
              <NavIconLogOut />
            </span>
            Sair
          </button>
        </div>
      ) : null}
    </div>
  );
}
