from __future__ import annotations

import gzip
import logging
import os
import shutil
import subprocess
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse

import boto3
from botocore.config import Config as BotoConfig

logger = logging.getLogger("erp.s3_daily_backup")


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class _DbConn:
    host: str
    port: int
    username: str
    password: str
    dbname: str


def _parse_database_url(raw_url: str) -> _DbConn:
    normalized = raw_url.strip()
    if normalized.startswith("postgresql+"):
        normalized = "postgresql" + normalized[len("postgresql+") :]
    parsed = urlparse(normalized)
    dbname = (parsed.path or "").lstrip("/")
    if not dbname:
        raise RuntimeError("DATABASE_URL inválida: banco não informado no path.")
    if not parsed.hostname:
        raise RuntimeError("DATABASE_URL inválida: host não informado.")
    username = unquote(parsed.username or "")
    if not username:
        raise RuntimeError("DATABASE_URL inválida: usuário não informado.")
    return _DbConn(
        host=parsed.hostname,
        port=int(parsed.port or 5432),
        username=username,
        password=unquote(parsed.password or ""),
        dbname=dbname,
    )


def _resolve_backup_bucket() -> str:
    bucket = (
        os.getenv("AWS_S3_BUCKET_BACKUPS", "").strip()
        or os.getenv("AWS_STORAGE_BUCKET_NAME", "").strip()
        or os.getenv("AWS_S3_BUCKET", "").strip()
    )
    if not bucket:
        raise RuntimeError("Bucket de backup não configurado (AWS_S3_BUCKET_BACKUPS).")
    return bucket


def _resolve_s3_key(prefix: str, target_date: date, filename: str) -> str:
    clean_prefix = prefix.strip().strip("/")
    dated_dir = target_date.strftime("%Y/%m")
    if clean_prefix:
        return f"{clean_prefix}/{dated_dir}/{filename}"
    return f"{dated_dir}/{filename}"


def _build_s3_client():
    region = (os.getenv("AWS_S3_REGION", "").strip() or "us-east-1")
    endpoint_url = os.getenv("AWS_S3_ENDPOINT_URL", "").strip() or None
    return boto3.client(
        "s3",
        region_name=region,
        endpoint_url=endpoint_url,
        config=BotoConfig(retries={"max_attempts": 3, "mode": "standard"}),
    )


def _dump_database_to_gzip(*, conn: _DbConn, output_file: Path) -> None:
    output_file.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "pg_dump",
        "--host",
        conn.host,
        "--port",
        str(conn.port),
        "--username",
        conn.username,
        "--dbname",
        conn.dbname,
        "--format=plain",
        "--no-owner",
        "--no-acl",
    ]
    env = os.environ.copy()
    if conn.password:
        env["PGPASSWORD"] = conn.password
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
    )
    try:
        if process.stdout is None:
            raise RuntimeError("Falha ao abrir stdout do pg_dump.")
        with gzip.open(output_file, "wb", compresslevel=6) as gz_file:
            shutil.copyfileobj(process.stdout, gz_file)
        stderr_bytes = process.stderr.read() if process.stderr else b""
        returncode = process.wait()
        if returncode != 0:
            stderr = stderr_bytes.decode("utf-8", errors="replace")
            raise RuntimeError(f"pg_dump falhou (exit={returncode}): {stderr.strip()}")
    finally:
        if process.stdout is not None:
            process.stdout.close()
        if process.stderr is not None:
            process.stderr.close()


def create_and_upload_daily_backup(*, target_date: date | None = None) -> dict[str, str | int]:
    when = target_date or datetime.now(timezone.utc).date()
    db_url = os.getenv("DATABASE_URL", "").strip()
    if not db_url:
        raise RuntimeError("DATABASE_URL não configurada para backup diário.")
    conn = _parse_database_url(db_url)
    bucket = _resolve_backup_bucket()
    prefix = os.getenv("S3_DAILY_BACKUP_PREFIX", "db-backups").strip()
    local_dir = Path(os.getenv("S3_DAILY_BACKUP_LOCAL_DIR", "/tmp/climaris-backups").strip())
    filename = f"{conn.dbname}_{when.isoformat()}.sql.gz"
    local_path = local_dir / filename
    s3_key = _resolve_s3_key(prefix=prefix, target_date=when, filename=filename)
    _dump_database_to_gzip(conn=conn, output_file=local_path)
    size_bytes = local_path.stat().st_size
    client = _build_s3_client()
    client.upload_file(
        str(local_path),
        bucket,
        s3_key,
        ExtraArgs={"ContentType": "application/gzip"},
    )
    if not _env_bool("S3_DAILY_BACKUP_KEEP_LOCAL", False):
        local_path.unlink(missing_ok=True)
    logger.info("s3 daily backup uploaded: bucket=%s key=%s size=%s", bucket, s3_key, size_bytes)
    return {
        "date": when.isoformat(),
        "bucket": bucket,
        "key": s3_key,
        "filename": filename,
        "size_bytes": int(size_bytes),
    }
