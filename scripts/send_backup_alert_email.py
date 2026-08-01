#!/usr/bin/env python3
"""Envia e-mail de alerta quando um serviço systemd do backup do sistema
(restic -> S3) falha (system-backup.service ou system-backup-deep-check.service).

Chamado por /usr/local/lib/system-backup/notify-failure.sh via
`docker exec -i erp_api python3 /app/scripts/send_backup_alert_email.py <unit>`,
recebendo o excerto do journal pelo stdin. Reaproveita o SMTP já configurado
em /operacao/chaves-api (credencial provider_slug="smtp").
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone

sys.path.insert(0, "/app")

from app.database import SessionLocal  # noqa: E402
from app.emailer import send_email  # noqa: E402

ALERT_TO_EMAIL = "noreply@climaris.com.br"


def _escape_html(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def main() -> int:
    unit = sys.argv[1] if len(sys.argv) > 1 else "system-backup.service"
    log_excerpt = sys.stdin.read().strip() or "(sem logs disponíveis)"
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    subject = f"[Climaris] FALHA no backup do sistema (S3) - {unit}"
    text_body = (
        f'O serviço systemd "{unit}" falhou em {now}.\n\n'
        "Faz parte do backup completo do sistema (restic -> S3) do servidor srv1373616.\n"
        f"Verifique com: systemctl status {unit}  e  journalctl -u {unit} -n 200\n\n"
        "Últimas linhas do log:\n"
        "-----------------------------------\n"
        f"{log_excerpt}\n"
        "-----------------------------------\n"
    )
    html_body = (
        f"<p>O serviço systemd <b>{unit}</b> falhou em {now}.</p>"
        "<p>Faz parte do backup completo do sistema (restic &rarr; S3) do servidor "
        "<b>srv1373616</b>.</p>"
        f"<p>Verifique com:<br><code>systemctl status {unit}</code><br>"
        f"<code>journalctl -u {unit} -n 200</code></p>"
        "<p>Últimas linhas do log:</p>"
        '<pre style="background:#111;color:#eee;padding:12px;border-radius:6px;'
        f'overflow-x:auto;white-space:pre-wrap;">{_escape_html(log_excerpt)}</pre>'
    )

    db = SessionLocal()
    try:
        send_email(
            to_email=ALERT_TO_EMAIL,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            db=db,
        )
    finally:
        db.close()
    print(f"Alerta de backup enviado para {ALERT_TO_EMAIL} ({unit}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
