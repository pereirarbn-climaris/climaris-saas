"""Request ID propagation and structured access logging."""

from __future__ import annotations

import json
import logging
import time
import uuid
from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

access_logger = logging.getLogger("erp.access")


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assigns X-Request-ID (or generates one), echoes it on the response, logs one JSON line per request."""

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        header_rid = request.headers.get("X-Request-ID")
        if header_rid:
            request_id = header_rid.strip()[:128] or str(uuid.uuid4())
        else:
            request_id = str(uuid.uuid4())
        request.state.request_id = request_id

        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 3)

        response.headers["X-Request-ID"] = request_id

        payload = {
            "event": "http_request",
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
        }
        access_logger.info(json.dumps(payload, default=str))
        return response


class MaxBodySizeMiddleware(BaseHTTPMiddleware):
    """
    Rejeita requisições cujo Content-Length excede o limite antes de ler o corpo inteiro.
    Complementa o Nginx (client_max_body_size); não substitui ajuste no proxy.
    """

    def __init__(self, app, max_body_size: int = 100 * 1024 * 1024) -> None:
        super().__init__(app)
        self.max_body_size = max_body_size

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                size = int(content_length)
            except ValueError:
                size = 0
            if size > self.max_body_size:
                max_mb = self.max_body_size // (1024 * 1024)
                return JSONResponse(
                    status_code=413,
                    content={
                        "error": {
                            "status_code": 413,
                            "message": (
                                f"Requisição excede o limite de {max_mb} MB "
                                f"(Content-Length: {size} bytes)."
                            ),
                            "path": str(request.url.path),
                        }
                    },
                )
        return await call_next(request)
