#!/usr/bin/env bash
set -euo pipefail

# Emite certificado Let's Encrypt e ativa Nginx HTTPS para beta.climaris.com.br.
# Pré-requisito: registro AAAA de beta.climaris.com.br deve apontar para ESTE servidor
# (ou ser removido). Se existir AAAA para outro host, o Certbot falha na validação IPv6.
#
# Uso: sudo bash scripts/install-beta-ssl.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Execute com sudo." >&2
  exit 1
fi

mkdir -p /var/www/certbot

echo "==> Verificando resolução DNS (IPv6 deve ser deste VPS ou ausente)"
if host -t AAAA beta.climaris.com.br 2>/dev/null | grep -q "has IPv6 address"; then
  server_v6="$(curl -6 -s --max-time 3 ifconfig.me 2>/dev/null || true)"
  beta_v6="$(host -t AAAA beta.climaris.com.br | awk '/has IPv6 address/{print $NF}')"
  if [[ -n "$server_v6" && -n "$beta_v6" && "$server_v6" != "$beta_v6" ]]; then
    echo "AVISO: AAAA de beta ($beta_v6) difere do IPv6 deste servidor ($server_v6)."
    echo "       Remova ou corrija o registro AAAA no painel DNS antes de continuar."
    exit 1
  fi
fi

echo "==> Bootstrap HTTP (se ainda não estiver ativo)"
if [[ -f "$ROOT_DIR/deploy/nginx/beta.climaris.com.br.bootstrap" ]]; then
  cp "$ROOT_DIR/deploy/nginx/beta.climaris.com.br.bootstrap" /etc/nginx/sites-available/beta.climaris.com.br
  ln -sf /etc/nginx/sites-available/beta.climaris.com.br /etc/nginx/sites-enabled/beta.climaris.com.br
  nginx -t
  systemctl reload nginx
fi

echo "==> Certbot (webroot)"
certbot certonly --webroot -w /var/www/certbot -d beta.climaris.com.br \
  --non-interactive --agree-tos --register-unsafely-without-email

echo "==> Nginx HTTPS (config completa)"
cp "$ROOT_DIR/deploy/nginx/beta.climaris.com.br.conf.example" /etc/nginx/sites-available/beta.climaris.com.br
nginx -t
systemctl reload nginx

echo "==> SSL ativo em https://beta.climaris.com.br"
