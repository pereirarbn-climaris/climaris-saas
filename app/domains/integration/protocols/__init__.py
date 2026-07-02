"""Implementações de protocolo plugáveis no Integration Gateway."""

from app.domains.integration.protocols.json_rest import JsonRestAdapter
from app.domains.integration.protocols.xml_edi import XmlEdiAdapter

__all__ = ["JsonRestAdapter", "XmlEdiAdapter"]
