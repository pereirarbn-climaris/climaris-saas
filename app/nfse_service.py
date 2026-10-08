from __future__ import annotations

import base64
import json
import logging
import os
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.nfse_focus_client import (
    focus_api_base,
    focus_error_summary,
    focus_extract_authorized,
    focus_post_nfsen,
    focus_top_status,
    poll_nfsen_until_terminal,
)
from app.nfse_focus_emit_body import build_focus_nfsen_payload, focus_datetime_strings_br
from app.nfse_nacional_gateway import try_submit_via_gateway
from app.nfse_nacional_validation import nacional_emit_precheck_message
from app.nfse_xml_normalize import nfse_dps_descricao_sanitizada, nfse_xml_ascii_fold
from app.tax_id import digits_only
from app.security import decrypt_platform_secret
from models import (
    Client,
    FinanceEntry,
    NfseInvoice,
    NfseInvoiceStatus,
    NfseProvider,
    Service,
    ServiceOrder,
    Tenant,
    TenantNfseSettings,
)

logger = logging.getLogger(__name__)


def _serie_dps_efetiva(settings: TenantNfseSettings) -> str:
    """Série da DPS no XML / ``Id``. Padrão ``NF`` → ``00001`` no Id.

    **API vs portal:** a faixa **70000–79999** costuma ser usada na emissão **pelo site** do Emissor Nacional.
    Este fluxo envia via **API** (POST Sefin): a série deve obedecer à faixa de **integração** (orientação CGNFS-e:
    típico **00001–49999**). Usar 70000 na API pode gerar **E0010**.
    """

    v = (getattr(settings, "dps_serie", None) or "").strip()
    if v:
        return v
    v = (os.getenv("NFSE_DPS_SERIE") or "").strip()
    if v:
        return v
    return "NF"


def _dps_serie_num_from_settings(settings: TenantNfseSettings) -> int | None:
    raw = (getattr(settings, "dps_serie", None) or "").strip() or (os.getenv("NFSE_DPS_SERIE") or "").strip()
    if not raw:
        return None
    d = digits_only(raw)
    if not d:
        return None
    try:
        return int(d)
    except ValueError:
        return None


def _nfse_emit_hints(settings: TenantNfseSettings) -> list[str]:
    """Mensagens para o payload de emissão — não alteram o XML; ajudam a evitar divergência com o cadastro nacional."""

    hints: list[str] = []
    has_serie = bool((getattr(settings, "dps_serie", None) or "").strip()) or bool(
        (os.getenv("NFSE_DPS_SERIE") or "").strip()
    )
    sn = _dps_serie_num_from_settings(settings)

    if not has_serie:
        hints.append(
            "Série da DPS não configurada (Admin → NFS-e ou NFSE_DPS_SERIE): o XML usa NF→00001. "
            "Emissão neste sistema é via API: use série na faixa de integração (orientação nacional, típico 00001–49999)."
        )
    elif sn is not None and 70000 <= sn <= 79999:
        hints.append(
            "Série 70000–79999 costuma ser da emissão pelo Portal Nacional (site). Aqui a emissão é via API (POST Sefin); "
            "essa faixa pode gerar E0010. Use série permitida para integração (ex.: 900, 1 ou outra em 00001–49999 conforme manual/tributação)."
        )
    return hints


# Referência interna MEI-{timestamp} — tolera hífen unicode e espaços (ex.: "MEI - 1778090975").
_MEI_NDPS_RE = re.compile(r"(?i)MEI[-\s\u2013\u2014\u2212]*(\d{5,20})")


@dataclass(slots=True)
class NfseIssueContext:
    tenant: Tenant
    client: Client
    service_order: ServiceOrder | None
    finance_entry: FinanceEntry | None
    amount: float
    codigo_tributacao_nacional: str | None = None
    codigo_nbs: str | None = None
    """Discriminação quando não há OS (emissão avulsa)."""
    servico_descricao: str | None = None


def nfse_tax_codes_for_order(
    service_order: ServiceOrder | None,
    *,
    override_tributacao: str | None = None,
    override_nbs: str | None = None,
    default_tributacao: str | None = None,
    default_nbs: str | None = None,
) -> tuple[str | None, str | None]:
    """Override > itens da OS > padrão do tenant (configurações fiscais)."""
    trib = (override_tributacao or "").strip() or None
    nbs = (override_nbs or "").strip() or None
    if service_order is not None:
        items = sorted(service_order.service_items, key=lambda x: x.id)
        for it in items:
            svc: Service | None = it.service
            if svc is None:
                continue
            if not trib:
                raw = getattr(svc, "nfse_codigo_tributacao_nacional", None)
                if raw and str(raw).strip():
                    trib = str(raw).strip()
            if not nbs:
                raw = getattr(svc, "nfse_codigo_nbs", None)
                if raw and str(raw).strip():
                    nbs = str(raw).strip()
            if trib and nbs:
                break
    if not trib:
        trib = (default_tributacao or "").strip() or None
    if not nbs:
        nbs = (default_nbs or "").strip() or None
    return trib, nbs


def _nfse_emission_nd_sequence() -> str:
    """Valor usado em ``nDPS`` / Id: modo definido por ``NFSE_DPS_NUMERO_MODE`` (padrão ``compact``)."""

    mode = os.getenv("NFSE_DPS_NUMERO_MODE", "compact").strip().lower()
    if mode in ("nanos", "ns", "time_ns"):
        return str(time.time_ns())
    if mode in ("millis", "ms"):
        return str(int(time.time() * 1000))
    if mode == "fixed":
        fx = (os.getenv("NFSE_DPS_NUMERO_FIXED") or "200").strip()
        return fx if fx.isdigit() else str(max(1, int(time.time()) % 999_000))
    return str((int(time.time()) % 999_000) + 1)


def nfse_servico_description(service_order: ServiceOrder | None) -> str:
    if service_order is None:
        return "Servico"
    if service_order.service_items:
        lines: list[str] = []
        for it in sorted(service_order.service_items, key=lambda x: x.id):
            name = it.service.name if it.service else "Item"
            lines.append(f"{it.quantity}x {name}")
        return "\n".join(lines)
    return service_order.title or "Servico"


@dataclass(slots=True)
class NfseIssueResult:
    provider: NfseProvider
    status: NfseInvoiceStatus
    request_payload: dict
    response_payload: dict
    rps_number: str | None = None
    nfse_number: str | None = None
    verification_code: str | None = None
    municipal_code: str | None = None
    nfse_access_key: str | None = None
    error_message: str | None = None


class NfseEmitter(Protocol):
    def issue(self, context: NfseIssueContext) -> NfseIssueResult: ...


def _tomador_dps_payload(client: Client) -> dict[str, Any]:
    """Bloco tomador para JSON interno da DPS nacional (endereço + município IBGE)."""

    ibge = digits_only(client.address_ibge_code or "")
    tomador: dict[str, Any] = {
        "cpf_cnpj": client.document,
        "nome": nfse_xml_ascii_fold((client.name or "").strip(), max_len=150),
        "codigo_municipio_ibge": ibge,
    }
    end: dict[str, Any] = {}
    if (client.address_street or "").strip():
        end["logradouro"] = nfse_xml_ascii_fold(client.address_street.strip(), max_len=255)
    if (client.address_number or "").strip():
        end["numero"] = nfse_xml_ascii_fold(client.address_number.strip(), max_len=60)
    if (client.address_complement or "").strip():
        end["complemento"] = nfse_xml_ascii_fold(client.address_complement.strip(), max_len=156)
    if (client.address_district or "").strip():
        end["bairro"] = nfse_xml_ascii_fold(client.address_district.strip(), max_len=60)
    if (client.address_city or "").strip():
        end["municipio"] = nfse_xml_ascii_fold(client.address_city.strip(), max_len=100)
    cep = digits_only(client.address_postal_code or "")
    if len(cep) >= 8:
        end["cep"] = cep[:8]
    if (client.address_state or "").strip():
        end["uf"] = client.address_state.strip().upper()[:2]
    if end:
        tomador["endereco"] = end
    return tomador


class NationalMeiEmitter:
    def __init__(self, settings: TenantNfseSettings) -> None:
        self.settings = settings

    def issue(self, context: NfseIssueContext) -> NfseIssueResult:
        desc_manual = (context.servico_descricao or "").strip()
        desc_raw = desc_manual or nfse_servico_description(context.service_order)
        desc = nfse_dps_descricao_sanitizada(desc_raw)
        trib = (context.codigo_tributacao_nacional or "").strip()
        nbs = (context.codigo_nbs or "").strip()
        pre = nacional_emit_precheck_message(
            tenant=context.tenant,
            client=context.client,
            amount=context.amount,
            discriminacao=desc,
            codigo_tributacao_nacional=trib,
            codigo_nbs=nbs,
        )
        if pre:
            return NfseIssueResult(
                provider=NfseProvider.NATIONAL_MEI,
                status=NfseInvoiceStatus.FAILED,
                request_payload={},
                response_payload={},
                error_message=pre,
            )
        servico: dict = {
            "valor": round(context.amount, 2),
            "descricao": desc,
            "codigo_tributacao_nacional": trib,
            "codigo_nbs": nbs,
        }
        im_raw = (
            (self.settings.prestador_inscricao_municipal or "").strip()
            or os.getenv("NFSE_PRESTADOR_INSCRICAO_MUNICIPAL", "").strip()
            or os.getenv("NFSE_PRESTADOR_IE_PARA_TAG_IM", "").strip()
        )
        im_folded = nfse_xml_ascii_fold(im_raw, max_len=15) if im_raw else None
        prestador_payload: dict[str, Any] = {"cpf_cnpj": context.tenant.cnpj}
        if im_folded:
            prestador_payload["inscricao_municipal"] = im_folded
        request_payload = {
            "layout": "nfse_nacional_dps",
            "ambiente": self.settings.mei_environment,
            "serie_dps": _serie_dps_efetiva(self.settings),
            "prestador": prestador_payload,
            "tomador": _tomador_dps_payload(context.client),
            "servico": servico,
        }
        nh = _nfse_emit_hints(self.settings)
        if nh:
            request_payload["hints"] = nh
        ok_gw, gw_resp, gw_err = try_submit_via_gateway(request_payload)
        if ok_gw:
            rps = gw_resp.get("rps_number") or gw_resp.get("numero_rps") or f"MEI-{int(datetime.now(timezone.utc).timestamp())}"
            nr = gw_resp.get("nfse_number") or gw_resp.get("numero") or gw_resp.get("nNFSe")
            vc = gw_resp.get("verification_code") or gw_resp.get("codigo_verificacao")
            gw_chave = gw_resp.get("chaveAcesso") or gw_resp.get("chave_acesso") or gw_resp.get("access_key")
            return NfseIssueResult(
                provider=NfseProvider.NATIONAL_MEI,
                status=NfseInvoiceStatus.ISSUED,
                request_payload=request_payload,
                response_payload=gw_resp,
                rps_number=str(rps) if rps is not None else None,
                nfse_number=str(nr) if nr is not None else None,
                verification_code=str(vc) if vc is not None else None,
                nfse_access_key=str(gw_chave).strip() if gw_chave is not None and str(gw_chave).strip() else None,
            )

        ts_ms = int(time.time() * 1000)
        nd_sequence = _nfse_emission_nd_sequence()
        rps = f"MEI-{ts_ms}"

        def _pending_payload(message: str) -> dict[str, Any]:
            out: dict[str, Any] = {"queued": True, "message": message}
            if gw_err:
                out["gateway_error"] = gw_err
            elif gw_resp:
                out["gateway_response"] = gw_resp
            return out

        if os.getenv("NFSE_SEFIN_DISABLED", "").strip().lower() in ("1", "true", "yes", "on"):
            return NfseIssueResult(
                provider=NfseProvider.NATIONAL_MEI,
                status=NfseInvoiceStatus.PENDING_SUBMISSION,
                request_payload=request_payload,
                response_payload=_pending_payload(
                    "Envio ao Sefin Nacional desativado (NFSE_SEFIN_DISABLED). A nota permanece pendente."
                ),
                rps_number=rps,
            )

        if not self.settings.mei_certificate_base64_encrypted or not self.settings.mei_certificate_password_encrypted:
            return NfseIssueResult(
                provider=NfseProvider.NATIONAL_MEI,
                status=NfseInvoiceStatus.FAILED,
                request_payload=request_payload,
                response_payload=_pending_payload("Certificado A1 não configurado."),
                rps_number=rps,
                error_message="Cadastre o certificado A1 e a senha em Administração → NFS-e para emitir no ambiente nacional.",
            )

        try:
            from app.nfse_dps_sign import sign_dps_xml
            from app.nfse_dps_xml import build_dps_xml_unsigned
            from app.nfse_inf_dps_id import extract_inf_dps_id_from_xml, inf_dps_id_segments
            from app.nfse_pfx_ssl import leaf_cert_pem_only, load_pfx_pem_parts, ssl_context_from_pfx_bytes
            from app.nfse_sefin_client import adn_base_url, emit_base_url, emit_dps_url, post_dps_nfse
            from app.nfse_sefin_poll import poll_nfse_dps_processing
            from app.nfse_sefin_response import interpret_sefin_dps_response
        except ImportError as exc:
            detail = str(exc)
            msg = (
                "Servidor sem dependências para assinar a NFS-e nacional (pacotes Python lxml/signxml). "
                "Instale no ambiente de execução: pip install lxml signxml "
                "e, em Debian/Ubuntu, para compilar o lxml: libxml2-dev, libxslt1-dev e python3-dev. "
                f"Detalhe: {detail}"
            )
            return NfseIssueResult(
                provider=NfseProvider.NATIONAL_MEI,
                status=NfseInvoiceStatus.FAILED,
                request_payload=request_payload,
                response_payload={
                    **_pending_payload(
                        "Pacotes signxml/lxml necessários para assinar a DPS não estão disponíveis neste servidor."
                    ),
                    "import_error": detail,
                    "missing_python_deps": True,
                },
                rps_number=rps,
                error_message=msg[:500],
            )

        try:
            cert_b64_plain = decrypt_platform_secret(self.settings.mei_certificate_base64_encrypted)
            cert_pwd_plain = decrypt_platform_secret(self.settings.mei_certificate_password_encrypted or "")
            pfx_bytes = base64.b64decode(cert_b64_plain)
        except Exception:
            return NfseIssueResult(
                provider=NfseProvider.NATIONAL_MEI,
                status=NfseInvoiceStatus.FAILED,
                request_payload=request_payload,
                response_payload=_pending_payload("Falha ao decodificar o certificado A1."),
                rps_number=rps,
                error_message="Não foi possível ler o certificado A1. Envie o arquivo novamente e confira a senha.",
            )

        op_simp = 2 if (self.settings.default_optante_mei or self.settings.mei_opt_in) else 1

        try:
            xml_unsigned = build_dps_xml_unsigned(
                tenant=context.tenant,
                client=context.client,
                amount=context.amount,
                discriminacao=desc,
                codigo_tributacao_nacional=trib,
                codigo_nbs=nbs,
                mei_environment=self.settings.mei_environment,
                numero_dps=nd_sequence,
                op_simp_nac=op_simp,
                prestador_im=im_folded,
                serie=_serie_dps_efetiva(self.settings),
            )
        except ValueError as exc:
            return NfseIssueResult(
                provider=NfseProvider.NATIONAL_MEI,
                status=NfseInvoiceStatus.FAILED,
                request_payload=request_payload,
                response_payload=_pending_payload(str(exc)),
                rps_number=rps,
                error_message=str(exc),
            )

        try:
            cert_pem, key_pem = load_pfx_pem_parts(pfx_bytes, cert_pwd_plain)
            signed_xml = sign_dps_xml(xml_unsigned, leaf_cert_pem_only(cert_pem), key_pem)
            ssl_ctx = ssl_context_from_pfx_bytes(pfx_bytes, cert_pwd_plain)
        except Exception as exc:
            msg = f"Falha ao assinar a DPS ou preparar mTLS: {exc}"
            return NfseIssueResult(
                provider=NfseProvider.NATIONAL_MEI,
                status=NfseInvoiceStatus.FAILED,
                request_payload=request_payload,
                response_payload=_pending_payload(msg),
                rps_number=rps,
                error_message=msg[:500],
            )

        from app.nfse_dps_xsd_validate import validate_dps_xml_if_configured

        ok_xsd, xsd_errors = validate_dps_xml_if_configured(signed_xml)
        if not ok_xsd:
            detail = "; ".join(xsd_errors[:12])
            msg = f"XML da DPS não passou na validação XSD oficial: {detail}"
            return NfseIssueResult(
                provider=NfseProvider.NATIONAL_MEI,
                status=NfseInvoiceStatus.FAILED,
                request_payload=request_payload,
                response_payload={
                    **_pending_payload(msg),
                    "xsd_validation_errors": xsd_errors[:24],
                },
                rps_number=rps,
                error_message=msg[:500],
            )

        emit_base = emit_base_url(self.settings.mei_environment)
        adn_base = adn_base_url(self.settings.mei_environment)
        emit_url = emit_dps_url(emit_base)
        http_code, resp_body = post_dps_nfse(signed_xml, ssl_ctx, emit_base, self.settings.mei_environment)

        if os.getenv("NFSE_SEFIN_DEBUG", "").strip().lower() in ("1", "true", "yes", "on"):
            sig_hint = (
                "<ds:Signature" in signed_xml
                or "SignatureValue" in signed_xml
                or "xmldsig" in signed_xml.lower()
            )
            try:
                seg_xml = extract_inf_dps_id_from_xml(signed_xml)
                id_segments = inf_dps_id_segments(seg_xml) if seg_xml else {}
            except Exception:
                id_segments = {}
            logger.info(
                "NFS-e Sefin: POST %s | adn_consulta_base=%s | signed_xml_len=%s | assinatura_xml_presente=%s | http=%s | idDPS_segmentos=%s",
                emit_url,
                adn_base,
                len(signed_xml),
                sig_hint,
                http_code,
                id_segments,
            )

        if isinstance(resp_body, dict):
            response_payload = dict(resp_body)
        else:
            response_payload = {"raw": resp_body}
        response_payload["http_status"] = http_code
        response_payload["emit_base_url"] = emit_base
        response_payload["adn_base_url"] = adn_base
        response_payload["sefin_base_url"] = emit_base
        try:
            _sid = extract_inf_dps_id_from_xml(signed_xml)
            if _sid:
                response_payload["id_dps_segmentos"] = inf_dps_id_segments(_sid)
        except Exception:
            pass
        if http_code == 0 or http_code >= 400:
            response_payload["nfse_emit_url"] = emit_url
            response_payload["adn_emit_url"] = emit_url
            response_payload["signed_xml_length"] = len(signed_xml)
            response_payload["signed_xml_has_signature"] = bool(
                "<ds:Signature" in signed_xml
                or "SignatureValue" in signed_xml
                or "xmldsig" in signed_xml.lower()
            )
        if gw_err:
            response_payload["gateway_error"] = gw_err
        elif gw_resp:
            response_payload["gateway_response"] = gw_resp

        inter = interpret_sefin_dps_response(http_code, resp_body)
        dps_inf_id = extract_inf_dps_id_from_xml(signed_xml)
        # Só persiste dps_id quando o ADN aceitou processamento — senão o Id é só local no XML e gera 404 na consulta.
        if dps_inf_id and (inter.success or inter.pending_protocol_only):
            response_payload["dps_id"] = dps_inf_id

        if inter.success:
            acc = (inter.access_key or "").strip()
            num = inter.nfse_number
            return NfseIssueResult(
                provider=NfseProvider.NATIONAL_MEI,
                status=NfseInvoiceStatus.ISSUED,
                request_payload=request_payload,
                response_payload=response_payload,
                rps_number=rps,
                nfse_number=num if num else None,
                verification_code=inter.verification_code,
                municipal_code=inter.municipal_code,
                nfse_access_key=acc or None,
            )

        if inter.pending_protocol_only:
            response_payload["protocol_only"] = True
            poll_disabled = os.getenv("NFSE_SEFIN_POLL_DISABLED", "").strip().lower() in ("1", "true", "yes", "on")
            if dps_inf_id and not poll_disabled:
                try:
                    inter2, poll_trace, last_json = poll_nfse_dps_processing(
                        ssl_ctx,
                        adn_base,
                        dps_id=dps_inf_id,
                        mei_environment=self.settings.mei_environment,
                    )
                    response_payload["status_poll_trace"] = poll_trace
                    if isinstance(last_json, dict):
                        response_payload["status_poll_last"] = last_json
                        xml_sp = last_json.get("xml")
                        if isinstance(xml_sp, str) and len(xml_sp.strip()) > 50:
                            response_payload["xml"] = xml_sp.strip()
                    if inter2.success:
                        acc = (inter2.access_key or "").strip()
                        num = inter2.nfse_number
                        return NfseIssueResult(
                            provider=NfseProvider.NATIONAL_MEI,
                            status=NfseInvoiceStatus.ISSUED,
                            request_payload=request_payload,
                            response_payload=response_payload,
                            rps_number=rps,
                            nfse_number=num if num else None,
                            verification_code=inter2.verification_code,
                            municipal_code=inter2.municipal_code,
                            nfse_access_key=acc or None,
                        )
                    if inter2.pending_protocol_only:
                        response_payload["status_poll_pending"] = True
                        return NfseIssueResult(
                            provider=NfseProvider.NATIONAL_MEI,
                            status=NfseInvoiceStatus.PENDING_SUBMISSION,
                            request_payload=request_payload,
                            response_payload=response_payload,
                            rps_number=rps,
                        )
                    err_poll = inter2.error_message or "Consulta ao protocolo retornou rejeição."
                    return NfseIssueResult(
                        provider=NfseProvider.NATIONAL_MEI,
                        status=NfseInvoiceStatus.FAILED,
                        request_payload=request_payload,
                        response_payload=response_payload,
                        rps_number=rps,
                        error_message=err_poll[:500],
                    )
                except Exception as exc:
                    logger.exception("Falha ao consultar GET /dps/{id} no ADN (polling)")
                    response_payload["status_poll_error"] = str(exc)[:800]
                    return NfseIssueResult(
                        provider=NfseProvider.NATIONAL_MEI,
                        status=NfseInvoiceStatus.PENDING_SUBMISSION,
                        request_payload=request_payload,
                        response_payload=response_payload,
                        rps_number=rps,
                    )
            return NfseIssueResult(
                provider=NfseProvider.NATIONAL_MEI,
                status=NfseInvoiceStatus.PENDING_SUBMISSION,
                request_payload=request_payload,
                response_payload=response_payload,
                rps_number=rps,
            )

        err = inter.error_message or "Rejeição no ambiente nacional (Sefin)."
        if http_code == 404:
            err = (
                f"{err} POST em {emit_url}. Emissão usa o host Sefin (emit_base_url), não o ADN; "
                "path padrão /SefinNacional/nfse. Confira NFSE_EMIT_BASE_URL_* e NFSE_SEFIN_EMIT_PATH."
            )
        return NfseIssueResult(
            provider=NfseProvider.NATIONAL_MEI,
            status=NfseInvoiceStatus.FAILED,
            request_payload=request_payload,
            response_payload=response_payload,
            rps_number=rps,
            error_message=err[:500],
        )


class FocusEmitter:
    def __init__(self, settings: TenantNfseSettings) -> None:
        self.settings = settings

    def issue(self, context: NfseIssueContext) -> NfseIssueResult:
        if not self.settings.focus_api_key_encrypted:
            return NfseIssueResult(
                provider=NfseProvider.FOCUS,
                status=NfseInvoiceStatus.FAILED,
                request_payload={},
                response_payload={"hint": "Cadastre o token da API Focus em Administração → NFS-e."},
                error_message="Token da API Focus não configurado.",
            )

        try:
            token = decrypt_platform_secret(self.settings.focus_api_key_encrypted)
        except Exception as exc:
            return NfseIssueResult(
                provider=NfseProvider.FOCUS,
                status=NfseInvoiceStatus.FAILED,
                request_payload={},
                response_payload={"decrypt_error": str(exc)[:200]},
                error_message="Não foi possível ler o token Focus.",
            )

        base = focus_api_base(self.settings.focus_environment)
        ref = f"t{context.tenant.id}u{int(time.time() * 1000)}"
        dh_emissao, d_compet = focus_datetime_strings_br()

        try:
            body = build_focus_nfsen_payload(
                tenant=context.tenant,
                client=context.client,
                settings=self.settings,
                amount=context.amount,
                codigo_tributacao_nacional=context.codigo_tributacao_nacional,
                codigo_nbs=context.codigo_nbs,
                service_order=context.service_order,
                servico_descricao=context.servico_descricao,
                dh_emissao=dh_emissao,
                d_compet=d_compet,
            )
        except ValueError as exc:
            return NfseIssueResult(
                provider=NfseProvider.FOCUS,
                status=NfseInvoiceStatus.FAILED,
                request_payload={"ref": ref, "layout": "focus_nfsen"},
                response_payload={"error": str(exc)},
                error_message=str(exc)[:500],
            )

        http_c, post_body = focus_post_nfsen(base, token.strip(), ref, body)
        request_payload: dict[str, Any] = {"layout": "focus_nfsen", "ref": ref, "body": body}
        response_payload: dict[str, Any] = {"http_status_post": http_c, "post": post_body}

        # 422 pode indicar ``em_processamento`` (filas Focus) — seguir com consultas GET.
        if http_c >= 400 and http_c != 422:
            msg = focus_error_summary(post_body)
            return NfseIssueResult(
                provider=NfseProvider.FOCUS,
                status=NfseInvoiceStatus.FAILED,
                request_payload=request_payload,
                response_payload=response_payload,
                rps_number=ref,
                error_message=(msg or f"HTTP {http_c}")[:500],
            )

        initial = post_body if isinstance(post_body, dict) else None
        max_a = int(os.getenv("NFSE_FOCUS_POLL_MAX_ATTEMPTS", "18"))
        delay = float(os.getenv("NFSE_FOCUS_POLL_DELAY_SEC", "2"))
        code_g, final_body = poll_nfsen_until_terminal(
            base,
            token.strip(),
            ref,
            initial_body=initial,
            max_attempts=max_a,
            delay_sec=delay,
        )
        response_payload["http_status_final"] = code_g
        response_payload["final"] = final_body

        if not isinstance(final_body, dict):
            return NfseIssueResult(
                provider=NfseProvider.FOCUS,
                status=NfseInvoiceStatus.FAILED,
                request_payload=request_payload,
                response_payload=response_payload,
                rps_number=ref,
                error_message="Resposta inválida da API Focus.",
            )

        st = focus_top_status(final_body)
        if st == "autorizado":
            num, ver, chave = focus_extract_authorized(final_body)
            mc = final_body.get("codigo_municipio_emissora")
            return NfseIssueResult(
                provider=NfseProvider.FOCUS,
                status=NfseInvoiceStatus.ISSUED,
                request_payload=request_payload,
                response_payload=response_payload,
                rps_number=ref,
                nfse_number=num,
                verification_code=ver,
                nfse_access_key=chave,
                municipal_code=str(mc).strip() if mc is not None and str(mc).strip() else None,
            )

        if st == "erro_autorizacao":
            err = focus_error_summary(final_body)
            return NfseIssueResult(
                provider=NfseProvider.FOCUS,
                status=NfseInvoiceStatus.FAILED,
                request_payload=request_payload,
                response_payload=response_payload,
                rps_number=ref,
                error_message=(err or "Erro de autorização NFSe (Focus).")[:500],
            )

        if st in ("processando_autorizacao", "em_processamento", "processando"):
            return NfseIssueResult(
                provider=NfseProvider.FOCUS,
                status=NfseInvoiceStatus.PENDING_SUBMISSION,
                request_payload=request_payload,
                response_payload=response_payload,
                rps_number=ref,
                error_message=None,
            )

        err = focus_error_summary(final_body)
        return NfseIssueResult(
            provider=NfseProvider.FOCUS,
            status=NfseInvoiceStatus.FAILED,
            request_payload=request_payload,
            response_payload=response_payload,
            rps_number=ref,
            error_message=(err or f"Status Focus: {st or 'desconhecido'}")[:500],
        )


class NfseFactory:
    @staticmethod
    def build(settings: TenantNfseSettings, tenant: Tenant, forced: NfseProvider | None = None) -> NfseEmitter:
        """Canal conforme cadastro do prestador (tenant), não do tomador (cliente).

        Ordem: override manual → classificação automática (CNPJ/MEI) → opt-in MEI nacional → Focus.
        """
        if forced is not None:
            return NationalMeiEmitter(settings) if forced == NfseProvider.NATIONAL_MEI else FocusEmitter(settings)
        ap = (getattr(settings, "auto_nfse_provider", None) or "").strip().lower()
        if ap == "national_mei":
            return NationalMeiEmitter(settings)
        if ap == "focus":
            return FocusEmitter(settings)
        # Prestador pessoa física (MEI): canal nacional por padrão quando não há classificação por CNPJ.
        if getattr(tenant, "tax_id_kind", "") == "cpf":
            return NationalMeiEmitter(settings)
        if settings.mei_opt_in:
            return NationalMeiEmitter(settings)
        return FocusEmitter(settings)


def get_or_create_nfse_settings(db: Session, tenant_id: int, *, commit: bool = True) -> TenantNfseSettings:
    row = db.execute(select(TenantNfseSettings).where(TenantNfseSettings.tenant_id == tenant_id)).scalar_one_or_none()
    if row is not None:
        return row
    row = TenantNfseSettings(tenant_id=tenant_id)
    db.add(row)
    if commit:
        db.commit()
        db.refresh(row)
    else:
        db.flush()
        db.refresh(row)
    return row


def _dps_id_from_invoice_response(row: NfseInvoice) -> str | None:
    raw = row.response_payload_json
    if not raw or not str(raw).strip():
        return None
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            return None
        did = data.get("dps_id")
        if isinstance(did, str) and did.strip():
            return did.strip()
        spl = data.get("status_poll_last")
        if isinstance(spl, dict):
            inner = spl.get("idDPS") or spl.get("id")
            if isinstance(inner, str) and inner.strip():
                return inner.strip()
    except json.JSONDecodeError:
        pass
    return None


def _mei_ndps_suffix_from_row(row: NfseInvoice) -> str | None:
    """Sufixo numérico após ``MEI`` (mesmo valor usado como ``nDPS`` no XML). Usa rps_number e nfse_number."""

    for candidate in (row.rps_number, row.nfse_number):
        if candidate is None:
            continue
        s = str(candidate).strip()
        m = _MEI_NDPS_RE.search(s)
        if m:
            return m.group(1)
        for hy in ("\u2013", "\u2014", "\u2212"):
            s = s.replace(hy, "-")
        if s.upper().startswith("MEI-"):
            suffix = s.split("-", 1)[-1].strip()
            if suffix.isdigit():
                return suffix
    return None


def _walk_json_strings(obj: Any, out: list[str], *, depth: int = 0) -> None:
    if depth > 12:
        return
    if isinstance(obj, str):
        if 8 <= len(obj) <= 12000:
            out.append(obj)
        return
    if isinstance(obj, dict):
        for v in obj.values():
            _walk_json_strings(v, out, depth=depth + 1)
    elif isinstance(obj, list):
        for v in obj[:120]:
            _walk_json_strings(v, out, depth=depth + 1)


def _mei_ndps_suffix_from_saved_payloads(row: NfseInvoice) -> str | None:
    """Busca padrão MEI em qualquer texto dentro de request/response JSON (notas antigas ou campos vazios na linha)."""

    chunks: list[str] = []
    for raw in (row.response_payload_json, row.request_payload_json):
        if not raw or not str(raw).strip():
            continue
        chunks.append(str(raw))
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        _walk_json_strings(data, chunks)
    for blob in chunks:
        m = _MEI_NDPS_RE.search(blob)
        if m:
            return m.group(1)
    return None


def _mei_ndps_suffix_for_invoice(row: NfseInvoice) -> str | None:
    return _mei_ndps_suffix_from_row(row) or _mei_ndps_suffix_from_saved_payloads(row)


def _dps_id_from_embedded_xml_in_response(row: NfseInvoice) -> str | None:
    """Tenta extrair Id de infDPS de XML guardado em qualquer campo da resposta (ex.: xml bruto)."""

    raw = row.response_payload_json
    if not raw or not str(raw).strip():
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    try:
        from app.nfse_inf_dps_id import extract_inf_dps_id_from_xml
    except ImportError:
        return None

    blobs: list[str] = []
    for key in ("xml", "raw", "body", "dps_xml", "signed_xml"):
        v = data.get(key)
        if isinstance(v, str) and len(v.strip()) > 50:
            blobs.append(v)
    for nest_key in ("status_poll_last", "adn_refresh_last", "gateway_response"):
        nest = data.get(nest_key)
        if isinstance(nest, dict):
            for key in ("xml", "raw", "body", "dps_xml"):
                v = nest.get(key)
                if isinstance(v, str) and len(v.strip()) > 50:
                    blobs.append(v)

    for s in blobs:
        got = extract_inf_dps_id_from_xml(s)
        if got:
            return got.strip()
    return None


def _reconstruct_dps_id_from_rps_and_tenant(
    row: NfseInvoice, tenant: Tenant, *, serie: str = "NF"
) -> str | None:
    """Quando não há `dps_id` salvo, reconstrói o Id de infDPS (mesma série do ``build_dps_xml_unsigned``)."""

    suffix = _mei_ndps_suffix_for_invoice(row)
    if not suffix:
        return None
    try:
        from app.nfse_dps_xml import _build_inf_dps_id
    except ImportError:
        return None

    c_loc = digits_only(tenant.address_ibge_code or "")
    if len(c_loc) != 7:
        return None
    prest_doc = digits_only(tenant.cnpj or "")
    if len(prest_doc) not in (11, 14):
        return None
    return _build_inf_dps_id(cod_municipio=c_loc, cpf_cnpj_prest=prest_doc, serie=serie, numero_dps=suffix)


def _resolve_dps_id_for_adn_refresh(db: Session, row: NfseInvoice) -> str | None:
    stored = _dps_id_from_invoice_response(row)
    if stored:
        return stored
    emb = _dps_id_from_embedded_xml_in_response(row)
    if emb:
        return emb
    tenant = db.get(Tenant, row.tenant_id)
    if tenant is None:
        return None
    settings = get_or_create_nfse_settings(db, row.tenant_id, commit=False)
    serie = _serie_dps_efetiva(settings)
    return _reconstruct_dps_id_from_rps_and_tenant(row, tenant, serie=serie)


def _explain_missing_dps_id(db: Session, row: NfseInvoice) -> str:
    """Mensagem específica: IBGE do prestador (tenant) é obrigatório para montar o Id — não confundir com o cliente."""

    tenant = db.get(Tenant, row.tenant_id)
    suf = _mei_ndps_suffix_for_invoice(row)
    if not suf:
        return (
            "Não foi encontrada referência MEI-… nos dados salvos desta nota. "
            "Use Reemitir para gerar nova solicitação ao ADN."
        )
    if tenant is None:
        return "Cadastro da empresa não encontrado."
    c_loc = digits_only(tenant.address_ibge_code or "")
    if len(c_loc) != 7:
        return (
            "Para consultar o ADN é preciso do código IBGE de 7 dígitos do **município do prestador** "
            "(cadastro da **sua empresa** em Administração — endereço fiscal). "
            "O IBGE do **cliente/tomador** não serve para montar o ID da DPS. "
            f"Situação atual no cadastro da empresa: IBGE={tenant.address_ibge_code or 'ausente'}. "
            "Preencha, salve e sincronize de novo ou Reemitir."
        )
    prest = digits_only(tenant.cnpj or "")
    if len(prest) not in (11, 14):
        return (
            "CNPJ ou CPF do prestador está incompleto no cadastro da empresa (Administração). Corrija e tente de novo."
        )
    return (
        "Não foi possível montar o ID da DPS com os dados atuais. "
        "Se o cadastro da empresa (IBGE/CNPJ) mudou após a emissão, use Reemitir."
    )


def refresh_pending_nfse_from_adn(db: Session, *, tenant_id: int, invoice_id: int) -> NfseInvoice:
    """Consulta GET /dps/{id} no ADN e atualiza nota pendente (homologação assíncrona).

    Use quando a emissão já terminou no ambiente nacional mas a tela ainda mostra Pendente envio.
    """

    row = db.execute(
        select(NfseInvoice).where(NfseInvoice.id == invoice_id, NfseInvoice.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if row is None:
        raise ValueError("NFS-e não encontrada.")
    if row.provider != NfseProvider.NATIONAL_MEI:
        raise ValueError("Consulta ADN só se aplica ao canal Nacional MEI.")
    if row.status != NfseInvoiceStatus.PENDING_SUBMISSION:
        raise ValueError("Só é possível atualizar notas em Pendente envio.")

    if os.getenv("NFSE_SEFIN_DISABLED", "").strip().lower() in ("1", "true", "yes", "on"):
        raise ValueError("Envio ao ADN está desativado (NFSE_SEFIN_DISABLED).")

    settings = get_or_create_nfse_settings(db, tenant_id, commit=False)
    if not settings.mei_certificate_base64_encrypted or not settings.mei_certificate_password_encrypted:
        raise ValueError("Configure o certificado A1 em Administração → NFS-e.")

    dps_id = _resolve_dps_id_for_adn_refresh(db, row)
    if dps_id and not _dps_id_from_invoice_response(row):
        logger.info("ADN refresh: dps_id reconstruído a partir de MEI-/cadastro (invoice_id=%s)", row.id)
    if not dps_id:
        raise ValueError(_explain_missing_dps_id(db, row))

    try:
        from app.nfse_sefin_client import adn_base_url, dps_resource_url, get_dps_resource
        from app.nfse_sefin_response import interpret_sefin_dps_response
        from app.nfse_pfx_ssl import ssl_context_from_pfx_bytes
    except ImportError as exc:
        raise ValueError(f"Dependências de integração ausentes: {exc}") from exc

    try:
        cert_b64_plain = decrypt_platform_secret(settings.mei_certificate_base64_encrypted)
        cert_pwd_plain = decrypt_platform_secret(settings.mei_certificate_password_encrypted or "")
        pfx_bytes = base64.b64decode(cert_b64_plain)
        ssl_ctx = ssl_context_from_pfx_bytes(pfx_bytes, cert_pwd_plain)
    except Exception as exc:
        raise ValueError("Não foi possível abrir o certificado A1.") from exc

    base_url = adn_base_url(settings.mei_environment)
    http_code, resp_body = get_dps_resource(
        ssl_ctx,
        base_url,
        dps_id,
        mei_environment=settings.mei_environment,
    )
    # Um único 404 logo após emissão pode ser indexação tardia no ADN — repetir uma vez.
    if http_code == 404:
        time.sleep(2.8)
        http_code, resp_body = get_dps_resource(
            ssl_ctx,
            base_url,
            dps_id,
            mei_environment=settings.mei_environment,
        )

    old_resp: dict[str, Any]
    try:
        prev = json.loads(row.response_payload_json or "{}")
        old_resp = prev if isinstance(prev, dict) else {}
    except json.JSONDecodeError:
        old_resp = {}

    merged = dict(old_resp)
    if dps_id and not merged.get("dps_id"):
        merged["dps_id"] = dps_id
    merged["adn_refresh_at"] = datetime.now(timezone.utc).isoformat()
    merged["adn_refresh_http_status"] = http_code
    merged["adn_get_url_used"] = dps_resource_url(base_url, dps_id)
    if isinstance(resp_body, dict):
        merged["adn_refresh_last"] = resp_body
        xml_sp = resp_body.get("xml")
        if isinstance(xml_sp, str) and len(xml_sp.strip()) > 50:
            merged["xml"] = xml_sp.strip()
    else:
        merged["adn_refresh_raw"] = str(resp_body)[:4000]

    inter = interpret_sefin_dps_response(http_code, resp_body if isinstance(resp_body, dict) else {"raw": resp_body})
    merged["http_status"] = http_code
    merged["sefin_base_url"] = base_url

    row.response_payload_json = json.dumps(merged, ensure_ascii=False)

    if inter.success:
        acc = (inter.access_key or "").strip()
        row.status = NfseInvoiceStatus.ISSUED
        row.nfse_number = inter.nfse_number if inter.nfse_number else row.nfse_number
        row.verification_code = inter.verification_code
        row.municipal_code = inter.municipal_code
        row.nfse_access_key = acc or None
        row.error_message = None
        row.issued_at = datetime.now(timezone.utc)
    elif inter.pending_protocol_only:
        row.error_message = None
    else:
        row.status = NfseInvoiceStatus.FAILED
        row.error_message = (inter.error_message or "Resposta do ADN sem autorização; verifique o motivo abaixo ou reemita.")[:500]

    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def upsert_nfse_invoice(
    db: Session,
    *,
    tenant_id: int,
    client_id: int,
    service_order_id: int | None,
    finance_entry_id: int | None,
    amount: float,
    result: NfseIssueResult,
) -> NfseInvoice:
    row = None
    if service_order_id is not None:
        row = db.execute(
            select(NfseInvoice).where(
                NfseInvoice.tenant_id == tenant_id,
                NfseInvoice.service_order_id == service_order_id,
            )
        ).scalar_one_or_none()
    if row is None:
        row = NfseInvoice(tenant_id=tenant_id, client_id=client_id, service_order_id=service_order_id, finance_entry_id=finance_entry_id)
    row.provider = result.provider
    row.status = result.status
    row.amount = amount
    row.rps_number = result.rps_number
    row.nfse_number = result.nfse_number
    row.verification_code = result.verification_code
    row.municipal_code = result.municipal_code
    row.nfse_access_key = result.nfse_access_key
    row.request_payload_json = json.dumps(result.request_payload, ensure_ascii=False)
    row.response_payload_json = json.dumps(result.response_payload, ensure_ascii=False)
    row.error_message = result.error_message
    row.issued_at = datetime.now(timezone.utc) if result.status == NfseInvoiceStatus.ISSUED else None
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
