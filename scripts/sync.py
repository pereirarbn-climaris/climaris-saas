#!/usr/bin/env python3
"""
Sincronização Git <-> VPS (menu interativo).

  1 — Git -> VPS: puxa o repositório, build do frontend e publica no Nginx
      (usa a mesma lógica que deploy.py). Por padrão força alinhamento com
      origin/main (GIT_RESET_HARD=1) para refletir mudanças vindas do v0/GitHub;
      desative com GIT_RESET_HARD=0 antes de rodar.

  2 — VPS -> Git: git add, commit (mensagem interativa ou SYNC_COMMIT_MSG) e push

Uso:
  python3 scripts/sync.py
  ./scripts/sync.py

Variáveis (além das de deploy.py): SYNC_COMMIT_MSG — mensagem de commit sem prompt
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


def _scripts_dir() -> Path:
    return Path(__file__).resolve().parent


def _import_deploy():
    scripts = _scripts_dir()
    if str(scripts) not in sys.path:
        sys.path.insert(0, str(scripts))
    import deploy as deploy_mod  # noqa: E402

    return deploy_mod


def _run_allow_fail(cmd: list[str], *, cwd: Path) -> bool:
    print(f"==> Executando: {' '.join(cmd)}")
    r = subprocess.run(cmd, cwd=cwd, text=True)
    if r.returncode != 0:
        print(f"Comando terminou com código {r.returncode}.", file=sys.stderr)
        return False
    return True


def git_to_vps() -> None:
    """Puxa do GitHub e atualiza o site na VPS (mesmo fluxo que deploy.py)."""
    # Fluxo típico após editar no v0: alinhar com origin/main.
    os.environ.setdefault("GIT_RESET_HARD", "1")

    deploy = _import_deploy()
    print("\n--- Atualizando VPS com código do Git (deploy frontend) ---")
    deploy.run_deploy_frontend()
    print("\nSite atualizado. No navegador use Ctrl+Shift+R se não vir mudanças.")


def vps_to_git() -> None:
    """Envia alterações feitas na VPS (ex.: Cursor) para o Git remoto."""
    deploy = _import_deploy()
    project_root, _, _ = deploy.resolve_project_paths()

    if not (project_root / ".git").is_dir():
        print("Erro: pasta .git não encontrada; não é possível fazer push.", file=sys.stderr)
        sys.exit(1)

    print("\n--- Enviando mudanças da VPS para o Git ---")

    msg = os.environ.get("SYNC_COMMIT_MSG", "").strip()
    if not msg:
        try:
            raw = input("Digite o que você mudou (mensagem do commit): ").strip()
        except EOFError:
            raw = ""
        msg = raw or "Ajustes manuais via Cursor na VPS"

    if not _run_allow_fail(["git", "add", "-A"], cwd=project_root):
        sys.exit(1)

    committed = _run_allow_fail(["git", "commit", "-m", msg], cwd=project_root)
    if not committed:
        print("\nNada novo para enviar (working tree limpa) ou falha no commit.")
        sys.exit(0)

    branch = os.environ.get("GIT_BRANCH", "main").strip() or "main"
    if not _run_allow_fail(["git", "push", "origin", branch], cwd=project_root):
        sys.exit(1)

    print("\nPush concluído. O remoto (ex.: GitHub) está atualizado; o v0 pode enxergar as mudanças.")


def main() -> None:
    print("O que você deseja fazer?")
    print("  1 — Atualizar a VPS (Git -> VPS, build e Nginx)")
    print("  2 — Enviar mudanças para o Git (VPS -> GitHub)")

    if len(sys.argv) > 1:
        opcao = sys.argv[1].strip()
        print(f"\n(opção via argumento: {opcao})")
    else:
        try:
            opcao = input("\nEscolha (1 ou 2): ").strip()
        except EOFError:
            print("\nEntrada encerrada; use: python3 scripts/sync.py 1|2", file=sys.stderr)
            sys.exit(1)

    if opcao == "1":
        git_to_vps()
    elif opcao == "2":
        vps_to_git()
    else:
        print("Opção inválida. Use 1 ou 2.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
