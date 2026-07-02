"""Adapter XML/EDI — protocolo legado para fabricantes industriais."""

from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Any

from app.domains.integration.base import IntegrationAdapter, IntegrationRequest, IntegrationResponse


class XmlEdiAdapter(IntegrationAdapter):
    protocol = "xml_edi"

    def __init__(self, *, config: dict[str, Any] | None = None) -> None:
        self.config = config or {}
        self._root_element = self.config.get("root_element") or "IntegrationMessage"
        self._path_prefix = (self.config.get("path_prefix") or "/edi").rstrip("/")

    def serialize_request(self, request: IntegrationRequest) -> tuple[str, dict[str, str]]:
        root = ET.Element(self._root_element)
        ET.SubElement(root, "Operation").text = request.operation
        if request.correlation_id:
            ET.SubElement(root, "CorrelationId").text = request.correlation_id

        payload_el = ET.SubElement(root, "Payload")
        self._dict_to_xml(request.payload, payload_el)

        body = ET.tostring(root, encoding="unicode", xml_declaration=True)
        headers = {
            "Content-Type": "application/xml",
            "Accept": "application/xml",
            **request.headers,
        }
        return body, headers

    def _dict_to_xml(self, data: dict[str, Any], parent: ET.Element) -> None:
        for key, value in data.items():
            child = ET.SubElement(parent, str(key))
            if isinstance(value, dict):
                self._dict_to_xml(value, child)
            elif isinstance(value, list):
                for item in value:
                    item_el = ET.SubElement(child, "Item")
                    if isinstance(item, dict):
                        self._dict_to_xml(item, item_el)
                    else:
                        item_el.text = str(item)
            elif value is not None:
                child.text = str(value)

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
            root = ET.fromstring(body)
            data = self._xml_to_dict(root)
        except ET.ParseError:
            return IntegrationResponse(
                success=False,
                status_code=status_code,
                raw_body=body,
                error_message="Resposta XML inválida",
            )
        return IntegrationResponse(success=True, status_code=status_code, data=data, raw_body=body)

    def _xml_to_dict(self, element: ET.Element) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for child in element:
            if len(child) == 0:
                result[child.tag] = child.text
            else:
                nested = self._xml_to_dict(child)
                if child.tag in result:
                    existing = result[child.tag]
                    if not isinstance(existing, list):
                        result[child.tag] = [existing]
                    result[child.tag].append(nested)
                else:
                    result[child.tag] = nested
        return result

    def build_url(self, base_url: str, operation: str) -> str:
        op_path = operation.strip("/")
        return f"{base_url}{self._path_prefix}/{op_path}"
