"""Adapter JSON/REST — protocolo padrão para ERPs de fabricantes."""

from __future__ import annotations

import json
from typing import Any

from app.domains.integration.base import IntegrationAdapter, IntegrationRequest, IntegrationResponse


class JsonRestAdapter(IntegrationAdapter):
    protocol = "json_rest"

    def __init__(self, *, config: dict[str, Any] | None = None) -> None:
        self.config = config or {}
        self._path_prefix = (self.config.get("path_prefix") or "/api/v1").rstrip("/")

    def serialize_request(self, request: IntegrationRequest) -> tuple[str, dict[str, str]]:
        body = json.dumps(
            {
                "operation": request.operation,
                "payload": request.payload,
                "correlation_id": request.correlation_id,
            },
            ensure_ascii=False,
        )
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            **request.headers,
        }
        return body, headers

    def deserialize_response(
        self, *, status_code: int, body: str, headers: dict[str, str]
    ) -> IntegrationResponse:
        if status_code < 200 or status_code >= 300:
            return IntegrationResponse(
                success=False,
                status_code=status_code,
                raw_body=body,
                error_message=f"HTTP {status_code}",
            )
        try:
            data = json.loads(body) if body.strip() else {}
        except json.JSONDecodeError:
            return IntegrationResponse(
                success=False,
                status_code=status_code,
                raw_body=body,
                error_message="Resposta JSON inválida",
            )
        if not isinstance(data, dict):
            data = {"result": data}
        return IntegrationResponse(success=True, status_code=status_code, data=data, raw_body=body)

    def build_url(self, base_url: str, operation: str) -> str:
        op_path = operation.strip("/")
        return f"{base_url}{self._path_prefix}/{op_path}"
