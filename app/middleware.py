"""Request ID propagation and structured access logging."""

from __future__ import annotations

import json
import logging
import time
import uuid
from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

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
