#!/usr/bin/env bash
set -euo pipefail
# Instala scripts e units systemd. Execute como root.

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Execute: sudo $0" >&2
  exit 1
fi
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="/usr/local/lib/system-backup"
ETC="/etc/system-backup"
mkdir -p "$DEST" "$ETC"
for f in 01-backup.sh 02-verify-restore.sh 03-deep-check.sh; do
  install -m 750 "$SCRIPT_DIR/$f" "$DEST/$f"
done
install -m 644 "$SCRIPT_DIR/restic-excludes.txt" "$DEST/restic-excludes.txt"
[[ -f "$SCRIPT_DIR/README-RESTAURACAO.md" ]] && install -m 644 "$SCRIPT_DIR/README-RESTAURACAO.md" "$DEST/"
install -d -m 700 "$ETC"
if [[ ! -f "$ETC/backup.env" ]]; then
  if [[ -f "$SCRIPT_DIR/backup.env" ]]; then
    install -m 600 "$SCRIPT_DIR/backup.env" "$ETC/backup.env"
  else
    install -m 600 "$SCRIPT_DIR/backup.env.example" "$ETC/backup.env.example"
    echo "Crie o ficheiro de configuração:" >&2
    echo "  cp $ETC/backup.env.example $ETC/backup.env" >&2
    echo "  (ou copie a partir de backup.env.example no repositório) e preencha RESTIC_* e AWS_*" >&2
  fi
fi
UNIT_SRC="$SCRIPT_DIR/systemd"
for u in system-backup.service system-backup.timer system-backup-deep-check.service system-backup-deep-check.timer; do
  install -m 644 "$UNIT_SRC/$u" /etc/systemd/system/"$u"
done
# Diretórios de trabalho
install -d -m 700 /var/lib/system-backup/staging
install -d -m 700 /var/cache/restic
systemctl daemon-reload
systemctl enable system-backup.timer
systemctl enable system-backup-deep-check.timer
echo "Concluído. Edite: $ETC/backup.env (RESTIC_PASSWORD, repositório S3, chaves)"
echo "Teste: systemctl start system-backup.service && journalctl -u system-backup -f"
echo "Agendado: systemctl list-timers system-backup*"
