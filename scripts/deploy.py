#!/usr/bin/env python3
"""
Deploy do frontend no servidor: sincroniza Git, instala deps, build (Vite) e
publica em DEPLOY_ROOT com reload do Nginx.

Uso (na raiz do clone ou de qualquer lugar):
  sudo ./scripts/deploy.py
  DEPLOY_ROOT=/srv/climaris-web sudo -E ./scripts/deploy.py

Variáveis de ambiente:
  PROJECT_ROOT   — raiz do repositório (padrão: pai de scripts/)
  DEPLOY_ROOT    — destino estático do Nginx (padrão: /var/www/climaris-web)
  GIT_BRANCH     — branch (padrão: main)
  SKIP_GIT       — "1" para não rodar git
  GIT_RESET_HARD — "1" para `git fetch` + `git reset --hard origin/<branch>`
                   (equivalente ao fluxo manual agressivo; sobrescreve alterações locais)
  USE_PNPM       — "1" para usar pnpm; caso contrário npm (igual a deploy-frontend.sh)
  RELOAD_NGINX   — "0" para não recarregar o Nginx
  NGINX_RESTART  — "1" para `systemctl restart nginx` em vez de `nginx -t` + reload
  NGINX_DIR      — alias de DEPLOY_ROOT (ex.: /var/www/climaris-web)
  SKIP_DEPLOY_CHOWN — "1" para não rodar chown/chmod no destino
  DEPLOY_CHOWN   — dono destino (padrão: www-data:www-data); vazio desativa chown
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def _env_flag(name: str, default: bool = False) -> bool:
    v = os.environ.get(name, "").strip().lower()
    if not v:
        return default
    return v in ("1", "true", "yes", "on")


def _sudo_prefix() -> list[str]:
    if os.geteuid() == 0:
        return []
    return ["sudo"]


def run(cmd: list[str], *, cwd: Path | None = None) -> None:
    display = " ".join(cmd)
    print(f"==> Executando: {display}")
    r = subprocess.run(cmd, cwd=cwd, text=True)
    if r.returncode != 0:
        print(f"Erro (código {r.returncode}): {display}", file=sys.stderr)
        sys.exit(r.returncode)


def git_sync(project_root: Path) -> None:
    if _env_flag("SKIP_GIT"):
        print("==> SKIP_GIT=1: pulando sincronização Git")
        return
    if not (project_root / ".git").is_dir():
        print("==> Aviso: .git ausente; pulando git (use SKIP_GIT=1 para silenciar).")
        return

    branch = os.environ.get("GIT_BRANCH", "main").strip() or "main"
    run(["git", "fetch", "origin"], cwd=project_root)
    if _env_flag("GIT_RESET_HARD"):
        print(f"--- GIT_RESET_HARD=1: reset --hard origin/{branch} ---")
        run(["git", "reset", "--hard", f"origin/{branch}"], cwd=project_root)
    else:
        run(["git", "pull", "--ff-only", "origin", branch], cwd=project_root)


def install_and_build(frontend: Path) -> None:
    if not (frontend / "package.json").is_file():
        print(f"frontend/package.json não encontrado em {frontend}", file=sys.stderr)
        sys.exit(1)

    if _env_flag("USE_PNPM"):
        run(["pnpm", "install"], cwd=frontend)
        run(["pnpm", "run", "build"], cwd=frontend)
    else:
        run(["npm", "install"], cwd=frontend)
        run(["npm", "run", "build"], cwd=frontend)

    dist = frontend / "dist"
    if not (dist / "index.html").is_file():
        print("Build falhou: dist/index.html ausente.", file=sys.stderr)
        sys.exit(1)


def publish_dist(frontend: Path, deploy_root: Path) -> None:
    dist = frontend / "dist"
    sudo = _sudo_prefix()

    print(f"==> Publicando em {deploy_root}")
    run(sudo + ["mkdir", "-p", str(deploy_root)])

    # Esvazia destino mantendo o diretório (evita apagar o mount point)
    for child in deploy_root.iterdir():
        run(sudo + ["rm", "-rf", str(child)])

    # cp -a preserva atributos; requer destino existente e vazio
    run(sudo + ["cp", "-a", str(dist / "."), str(deploy_root) + "/"])

    run(sudo + ["chmod", "-R", "755", str(deploy_root)])

    if _env_flag("SKIP_DEPLOY_CHOWN"):
        return
    chown_spec = os.environ.get("DEPLOY_CHOWN", "www-data:www-data").strip()
    if chown_spec:
        run(sudo + ["chown", "-R", chown_spec, str(deploy_root)])


def nginx_reload_or_restart() -> None:
    reload_on = os.environ.get("RELOAD_NGINX", "1").strip()
    if reload_on == "0":
        print("==> RELOAD_NGINX=0: não alterando o Nginx")
        return

    sudo = _sudo_prefix()
    try:
        active = subprocess.run(
            sudo + ["systemctl", "is-active", "--quiet", "nginx"],
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        print("==> systemctl não encontrado; pulando Nginx")
        return

    if active.returncode != 0:
        print("==> Nginx não está ativo; pule o reload ou inicie o serviço.")
        return

    if _env_flag("NGINX_RESTART"):
        print("==> NGINX_RESTART=1: reiniciando Nginx")
        run(sudo + ["systemctl", "restart", "nginx"])
        return

    print("==> Testando configuração e recarregando Nginx")
    run(sudo + ["nginx", "-t"])
    run(sudo + ["systemctl", "reload", "nginx"])
    print("==> Nginx recarregado")


def resolve_project_paths() -> tuple[Path, Path, Path]:
    """Retorna (project_root, frontend, deploy_root) conforme variáveis de ambiente."""
    scripts_dir = Path(__file__).resolve().parent
    default_root = scripts_dir.parent
    project_root = Path(os.environ.get("PROJECT_ROOT", str(default_root))).resolve()
    frontend = project_root / "frontend"
    deploy_root = Path(os.environ.get("DEPLOY_ROOT", "/var/www/climaris-web")).resolve()
    if os.environ.get("NGINX_DIR"):
        deploy_root = Path(os.environ["NGINX_DIR"]).resolve()
    return project_root, frontend, deploy_root


def run_deploy_frontend() -> None:
    project_root, frontend, deploy_root = resolve_project_paths()

    print("==========================================")
    print("  Deploy frontend (Git + build + Nginx)")
    print("==========================================")
    print(f"PROJECT_ROOT={project_root}")
    print(f"DEPLOY_ROOT={deploy_root}")
    print("")

    print("--- Git ---")
    git_sync(project_root)

    print("--- Build frontend ---")
    install_and_build(frontend)

    print("--- Publicar arquivos estáticos ---")
    publish_dist(frontend, deploy_root)

    print("--- Nginx ---")
    nginx_reload_or_restart()

    print("")
    print("Deploy concluído. No navegador use atualização forçada (Ctrl+Shift+R) ou aba anônima.")


def main() -> None:
    run_deploy_frontend()


if __name__ == "__main__":
    main()
