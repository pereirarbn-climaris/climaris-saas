"""Adapter Layer — gateway de integração com fabricantes/ERPs."""

from app.domains.integration.base import IntegrationAdapter, IntegrationRequest, IntegrationResponse
from app.domains.integration.gateway import IntegrationGateway

__all__ = [
    "IntegrationAdapter",
    "IntegrationGateway",
    "IntegrationRequest",
    "IntegrationResponse",
]
