"""Certificado A1 (PKCS#12) para contexto SSL cliente (mTLS) com urllib."""

from __future__ import annotations

import re
import ssl
import tempfile
from pathlib import Path

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.serialization import Encoding, NoEncryption, PrivateFormat, pkcs12

_LEAF_PEM_BLOCK = re.compile(
    rb"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----",
    re.DOTALL,
)


def leaf_cert_pem_only(cert_pem_chain: bytes) -> bytes:
    """Retorna apenas o **primeiro** bloco PEM (certificado do usuário final).

    O manual do NFS-e nacional exige **EndCertOnly** na XML-DSig: não incluir intermediárias
    no ``KeyInfo``. O mesmo PFX pode ser serializado com cadeia para mTLS; para assinar a DPS,
    use só o certificado da folha.
    """

    m = _LEAF_PEM_BLOCK.search(cert_pem_chain)
    if not m:
        raise ValueError("Nenhum bloco PEM de certificado encontrado.")
    return m.group(0).strip() + b"\n"


def load_pfx_pem_parts(pfx_bytes: bytes, password: str) -> tuple[bytes, bytes]:
    """Retorna (cert_pem + cadeia, key_pem) para assinatura XML."""

    private_key, certificate, chain = pkcs12.load_key_and_certificates(
        pfx_bytes, (password or "").encode("utf-8"), default_backend()
    )
    if private_key is None or certificate is None:
        raise ValueError("Certificado PFX inválido ou senha incorreta.")
    cert_pem = certificate.public_bytes(Encoding.PEM)
    chain_pem = b"".join(c.public_bytes(Encoding.PEM) for c in (chain or []) if c is not None)
    key_pem = private_key.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
    return cert_pem + chain_pem, key_pem


def ssl_context_from_pfx_bytes(pfx_bytes: bytes, password: str) -> ssl.SSLContext:
    """Carrega PFX em arquivos PEM temporários e devolve SSLContext com certificado cliente."""

    cert_combined_pem, key_pem = load_pfx_pem_parts(pfx_bytes, password)

    tmpdir = tempfile.mkdtemp(prefix="nfse-pfx-")
    cert_path = Path(tmpdir) / "cert.pem"
    key_path = Path(tmpdir) / "key.pem"
    cert_path.write_bytes(cert_combined_pem)
    key_path.write_bytes(key_pem)

    ctx = ssl.create_default_context()
    ctx.load_cert_chain(str(cert_path), str(key_path))
    return ctx
