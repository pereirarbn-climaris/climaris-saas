# Backups (restic + S3) e restauração

## O que é guardado

- **Ficheiros do anfitrião (/)**: snapshot diário criptografado; exclusões (Docker overlay, `node_modules`, caches) estão em `restic-excludes.txt`. Os **dados dos volumes** Docker (ex. PostgreSQL em `.../volumes/.../pg_data`) entram no backup se estiverem nesse volume local (noutro host ou disco montado, confirme o caminho).
- **Cópia lógica da base**: antes do snapshot, o script gera `pgdump_<UTC>.sql.gz` em ` /var/lib/system-backup/staging/`, **incluída no mesmo snapshot**. Para desastre, pode restaurar só a BD a partir desse ficheiro.

As tags restic (ex. `climaris-prod`, `daily-YYYY-MM-DD`, `host-NOME`) permitem listar e filtrar.

## Estratégia (divisão lógica)

1. **Repositório `restic` no S3** (caminho próprio, p.ex. `s3:.../seu-bucket/backup-sistema/`)  
   *É partido em muitos ficheiros pequenos no bucket (chunks); não é “um ficheiro único” por dia — é o padrão correto (deduplicação e integridade).*
2. **Dump SQL** (camada lógica da BD) no **mesmo snapshot** — restauração fácil sem reaproveitar necessariamente todo o volume.
3. **Regra de retenção** no `01-backup.sh`: 7 diários, 4 semanais, 6 mensais, 2 anuais; ajuste ao seu RPO.

Use um **bucket (ou prefixo) só para backup**, separado do bucket de imagens/logo da aplicação, e uma **chave IAM** com política mínima neste repositório.

## Instalação (resumo)

```bash
sudo apt update && sudo apt install -y restic
cd /caminho/do/projeto/scripts/system-backup
sudo bash install-systemd.sh
sudo cp backup.env.example /etc/system-backup/backup.env
sudo chmod 600 /etc/system-backup/backup.env
sudo systemctl start system-backup.service
journalctl -u system-backup -n 80
```

Ajuste `RESTIC_REPOSITORY` (repositório **novo e vazio** do lado restic) e as variáveis AWS, `PROJECT_ROOT` (ex. `/root/.ssh`).

O timer corre **todos os dias às 03:00** (fuso do sistema; `timedatectl`).

- Verificação **após** cada backup: `restic check` + teste mínima de `restic restore` de ficheiro em `/etc/`.
- Verificação **profunda** semanal (`03-deep-check.sh`): lê amostra de blocos (mais I/O; custo S3 maior).

## Restaurar noutro servidor (fluxo comum)

1. Instale Ubuntu (ou a mesma distro), `docker`, `docker compose`, e `restic`.
2. Exporte o **mesmo** `RESTIC_REPOSITORY`, `RESTIC_PASSWORD` e credenciais AWS que o servidor de backup usa (ver `backup.env`):
   ```bash
   export RESTIC_REPOSITORY="s3:SEU-BUCKET/caminho-repositorio"
   export AWS_ACCESS_KEY_ID=...
   export AWS_SECRET_ACCESS_KEY=...
   export AWS_DEFAULT_REGION=us-east-1
   export AWS_REGION=us-east-1
   export RESTIC_PASSWORD='sua-password-restic'
   restic snapshots
   ```
3. Monte disco raiz noutro ponto (ou use disco novo montado em `/mnt/rec`):
   ```bash
   sudo mkdir -p /mnt/rec
   restic restore LATEST --target /mnt/rec
   ```
4. A partir dali copia os ficheiros de que precisa (código, `.env`, configs em `/etc/`).
5. **PostgreSQL**: localize `pgdump_*.sql.gz` (em `/mnt/rec`…`/var/lib/system-backup/staging/`), suba os serviços e:
   ```bash
   gunzip -c /caminho/pgdump_....sql.gz | docker compose exec -T db psql -U USUARIO -d BASE
   ```
6. CUIDADO com a **sincronização**: o `pg_dump` é ponto de tempo; ficheiros restaurados vêm de outro instante. Para consistência, priorize: restaurar tudo de **um** snapshot, depois aplicar migrações se fizer sentido, ou reimportar só a BD a partir do dump e recolocar a app.

## Validar a restauração (não fique só com o “backup a correr”)

- Após a primeira carga, teste em **VM** ou noutro disco:
  1. `restic check` (e `restic check --read-data-subset=2%` para leitura amostral)
  2. `restic restore latest --include /root/.ssh/docker-compose.yml --target /tmp/restoretest` e abra o ficheiro
- Confirme que a serviço **arranca e a leitura da BD** bate com o que espera (dados reais, não “vazio”).

## Aviso de credenciais

- Guarde `RESTIC_PASSWORD` noutro sítio seguro: **sem ela, perde tudo.**
- Se tiver de expor ficheiros de chaves em fóruns/IA, considere **rotação** de chaves AWS (e a password do restic se tiver vazado).

## Desativar o timer

`sudo systemctl disable --now system-backup.timer system-backup-deep-check.timer`
