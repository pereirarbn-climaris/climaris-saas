"""Validação do XML da DPS contra os XSD oficiais (layout nacional v1.01).

Esquemas: pacote publicado pelo Portal NFS-e (ex.: ``nfse-esquemas_xsd-prodrest-v1-01-*.zip``),
extraído em ``Docs/nfse-xsd-extracted/Schemas/1.01/`` na raiz do projeto.

Desligue com ``NFSE_DPS_XSD_VALIDATE=0``. Diretório alternativo: ``NFSE_XSD_SCHEMA_ROOT``
(aponte para a pasta que contém ``DPS_v1.01.xsd``).

**Nota (libxml2 / lxml):** em ``TSSerieDPS`` o XSD traz ``pattern="^0{0,4}\\d{1,5}$"``. No XSD 1.0 o
match já é na lexical inteira; âncoras ``^``/``$`` são redundantes. O validador do libxml2, porém,
acaba tratando esses caracteres de forma que **nenhum** valor passa no facet. Antes de compilar o
schema, copiamos os ``*.xsd`` para um diretório temporário e normalizamos esse único pattern para
``0{0,4}\\d{1,5}`` (equivalente ao esperado pelo manual).
"""

from __future__ import annotations

import os
import shutil
import tempfile
from functools import lru_cache
from pathlib import Path

from lxml import etree


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def resolve_schema_root() -> Path | None:
    """Diretório com ``DPS_v1.01.xsd`` e ``tiposComplexos_v1.01.xsd`` (includes locais)."""

    env = (os.getenv("NFSE_XSD_SCHEMA_ROOT") or "").strip()
    if env:
        p = Path(env).expanduser().resolve()
        if (p / "DPS_v1.01.xsd").is_file():
            return p
        return None
    candidate = _project_root() / "Docs" / "nfse-xsd-extracted" / "Schemas" / "1.01"
    if (candidate / "DPS_v1.01.xsd").is_file():
        return candidate.resolve()
    return None


_SERIE_PATTERN_OFFICIAL = '<xs:pattern value="^0{0,4}\\d{1,5}$"/>'
_SERIE_PATTERN_LIBXML = '<xs:pattern value="0{0,4}\\d{1,5}"/>'


@lru_cache(maxsize=4)
def _materialized_schema_root(schema_root_str: str) -> str:
    """Copia os XSD para um temp dir e corrige o facet de ``TSSerieDPS`` para o motor do libxml2."""

    src = Path(schema_root_str)
    main = src / "DPS_v1.01.xsd"
    if not main.is_file():
        raise FileNotFoundError(f"XSD não encontrado: {main}")

    dst = Path(tempfile.mkdtemp(prefix="nfse-xsd-lxml-"))
    try:
        for xsd in sorted(src.glob("*.xsd")):
            shutil.copy2(xsd, dst / xsd.name)
        tipos = dst / "tiposSimples_v1.01.xsd"
        if tipos.is_file():
            text = tipos.read_text(encoding="utf-8")
            if _SERIE_PATTERN_OFFICIAL in text:
                text = text.replace(_SERIE_PATTERN_OFFICIAL, _SERIE_PATTERN_LIBXML)
                tipos.write_text(text, encoding="utf-8")
    except Exception:
        shutil.rmtree(dst, ignore_errors=True)
        raise

    return str(dst)


@lru_cache(maxsize=4)
def _load_schema(schema_root_str: str) -> etree.XMLSchema:
    root = Path(_materialized_schema_root(schema_root_str))
    main = root / "DPS_v1.01.xsd"
    parser = etree.XMLParser(resolve_entities=False, huge_tree=True)
    schema_doc = etree.parse(str(main), parser)
    return etree.XMLSchema(schema_doc)


def xsd_validation_enabled() -> bool:
    if os.getenv("NFSE_DPS_XSD_VALIDATE", "1").strip().lower() in ("0", "false", "no", "off"):
        return False
    return resolve_schema_root() is not None


def validate_dps_xml(xml_string: str) -> tuple[bool, list[str]]:
    """Valida o documento ``DPS`` (assinado ou não) contra ``DPS_v1.01.xsd``.

    Retorna ``(True, [])`` se válido ou se não houver esquemas no disco.
    """

    root = resolve_schema_root()
    if root is None:
        return True, []

    try:
        schema = _load_schema(str(root))
    except Exception as exc:
        return False, [f"Falha ao carregar XSD em {root}: {exc}"]

    raw = (xml_string or "").strip()
    if not raw:
        return False, ["XML vazio."]

    parser = etree.XMLParser(resolve_entities=False, huge_tree=True)
    try:
        doc = etree.fromstring(raw.encode("utf-8"), parser)
    except etree.XMLSyntaxError as exc:
        return False, [f"XML malformado: {exc}"]

    if schema.validate(doc):
        return True, []

    errs: list[str] = []
    for error in schema.error_log:
        loc = f"linha {error.line}" if error.line else "sem linha"
        errs.append(f"{loc}: {error.message}")
    if not errs:
        errs.append("Documento inválido segundo o XSD (sem detalhe no log).")
    return False, errs


def validate_dps_xml_if_configured(xml_string: str) -> tuple[bool, list[str]]:
    """Só valida se ``NFSE_DPS_XSD_VALIDATE`` permitir e existir pasta de esquemas."""

    if not xsd_validation_enabled():
        return True, []
    return validate_dps_xml(xml_string)


if __name__ == "__main__":
    import sys

    def _usage() -> None:
        sys.stderr.write(
            "Uso: python -m app.nfse_dps_xsd_validate <arquivo.xml>\n"
            "Variáveis: NFSE_XSD_SCHEMA_ROOT, NFSE_DPS_XSD_VALIDATE\n"
        )

    if len(sys.argv) != 2:
        _usage()
        sys.exit(2)
    path = Path(sys.argv[1])
    if not path.is_file():
        sys.stderr.write(f"Arquivo não encontrado: {path}\n")
        sys.exit(2)
    xml_text = path.read_text(encoding="utf-8")
    ok, errs = validate_dps_xml(xml_text)
    if ok:
        print("OK — documento válido segundo DPS_v1.01.xsd")
        sys.exit(0)
    for line in errs:
        print(line)
    sys.exit(1)
