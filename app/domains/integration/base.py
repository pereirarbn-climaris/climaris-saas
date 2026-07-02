"""Contrato base para adapters de protocolo (JSON/REST, XML/EDI, etc.)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID


@dataclass
class IntegrationRequest:
    """Envelope normalizado independente do protocolo externo."""

    operation: str
    payload: dict[str, Any] = field(default_factory=dict)
    headers: dict[str, str] = field(default_factory=dict)
    correlation_id: str | None = None


@dataclass
class IntegrationResponse:
    success: bool
    status_code: int | None = None
    data: dict[str, Any] = field(default_factory=dict)
    raw_body: str | None = None
    error_message: str | None = None


class IntegrationAdapter(ABC):
    """
    Interface plugável para protocolos externos.

    Implementações concretas ficam em ``app/domains/integration/protocols/``.
    """

    protocol: str

    @abstractmethod
    def serialize_request(self, request: IntegrationRequest) -> tuple[str, dict[str, str]]:
        """Retorna (body, headers) prontos para HTTP/transport."""

    @abstractmethod
    def deserialize_response(self, *, status_code: int, body: str, headers: dict[str, str]) -> IntegrationResponse:
        """Converte resposta bruta do fabricante para ``IntegrationResponse``."""

    @abstractmethod
    def build_url(self, base_url: str, operation: str) -> str:
        """Monta URL do endpoint para a operação."""
