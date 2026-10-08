from __future__ import annotations

import base64
import json
import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from cryptography.hazmat.primitives.serialization.pkcs12 import load_key_and_certificates
from sqlalchemy import literal_column, or_, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.nfse_pfx_ssl import ssl_context_from_pfx_bytes
from app.nfse_sefin_client import emit_base_url, ping_sefin_mtls
from app.dependencies import get_current_user, require_roles
from app.nfse_nacional_validation import nacional_emit_precheck_message
from app.nfse_xml_normalize import nfse_dps_descricao_sanitizada
from app.nfse_service import (
    NationalMeiEmitter,
    NfseFactory,
    NfseIssueContext,
    get_or_create_nfse_settings,
    nfse_servico_description,
    nfse_tax_codes_for_order,
    refresh_pending_nfse_from_adn,
    upsert_nfse_invoice,
)
from app.nfse_tributacao_catalog import list_tributacao_nacional_catalog
from app.tax_id import digits_only, normalize_and_validate_tax_document
from app.schemas import (
    NfseImportXmlBatchOut,
    NfseImportXmlBatchItemOut,
    NfseImportXmlBatchRequest,
    NfseInvoiceOut,
    NfseImportXmlRequest,
    NfseInvoicePatch,
    NfseIssueRequest,
    NfseMeiTestOut,
    NfseMeiTestRequest,
    NfseSettingsOut,
    NfseSettingsUpdate,
    NfseTributacaoNacionalItemOut,
)
from app.security import decrypt_platform_secret, encrypt_platform_secret
from models import (
    Client,
    FinanceEntry,
    NfseInvoice,
    NfseInvoiceStatus,
    NfseProvider,
    ServiceOrder,
    ServiceOrderServiceItem,
    Tenant,
    User,
    UserRole,
)

router = APIRouter(prefix="/nfse", tags=["nfse"])


def _sanitize_cert_filename(name: str | None) -> str | None:
    if not name or not str(name).strip():
        return None
    base = str(name).strip().replace("\\", "/").split("/")[-1].strip()
    if not base:
        return None
    return base[:260]


def _settings_out(row) -> NfseSettingsOut:
    return NfseSettingsOut(
        mei_opt_in=bool(row.mei_opt_in),
        default_optante_mei=bool(row.default_optante_mei),
        mei_environment=row.mei_environment,
        has_mei_certificate=bool(row.mei_certificate_base64_encrypted and row.mei_certificate_password_encrypted),
        mei_certificate_file_name=getattr(row, "mei_certificate_file_name", None),
        has_mei_portal_credentials=bool(row.mei_portal_username_encrypted and row.mei_portal_password_encrypted),
        mei_last_tested_at=row.mei_last_tested_at,
        mei_last_test_error=row.mei_last_test_error,
        focus_opt_in=bool(row.focus_opt_in),
        has_focus_api_key=bool(row.focus_api_key_encrypted),
        focus_environment=row.focus_environment,
        auto_issue_on_payment=bool(row.auto_issue_on_payment),
        default_codigo_tributacao_nacional=getattr(row, "default_codigo_tributacao_nacional", None),
        default_codigo_nbs=getattr(row, "default_codigo_nbs", None),
        prestador_inscricao_municipal=getattr(row, "prestador_inscricao_municipal", None),
        dps_serie=getattr(row, "dps_serie", None),
        auto_nfse_provider=getattr(row, "auto_nfse_provider", None),
    )


def _invoice_out(row: NfseInvoice) -> NfseInvoiceOut:
    import_display: dict[str, Any] | None = None
    if row.response_payload_json:
        try:
            blob = json.loads(row.response_payload_json)
            if isinstance(blob, dict) and isinstance(blob.get("parsed"), dict):
                import_display = blob["parsed"]
        except json.JSONDecodeError:
            pass
    client_name = row.client.name if getattr(row, "client", None) is not None else None
    return NfseInvoiceOut(
        id=row.id,
        tenant_id=row.tenant_id,
        client_id=row.client_id,
        client_name=client_name,
        service_order_id=row.service_order_id,
        finance_entry_id=row.finance_entry_id,
        provider=row.provider.value,
        status=row.status.value,
        amount=float(row.amount),
        rps_number=row.rps_number,
        nfse_number=row.nfse_number,
        nfse_access_key=getattr(row, "nfse_access_key", None),
        verification_code=row.verification_code,
        municipal_code=row.municipal_code,
        request_payload_json=row.request_payload_json,
        response_payload_json=row.response_payload_json,
        import_display=import_display,
        error_message=row.error_message,
        issued_at=row.issued_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _extract_first_xml_text(xml_root: ET.Element, tag_names: tuple[str, ...]) -> str | None:
    lowered = {t.lower() for t in tag_names}
    for node in xml_root.iter():
        local = node.tag.split("}")[-1].lower()
        if local in lowered and node.text and node.text.strip():
            return node.text.strip()
    return None


def _extract_first_xml_text_scoped(
    xml_root: ET.Element,
    section_names: tuple[str, ...],
    tag_names: tuple[str, ...],
) -> str | None:
    section_lowered = {s.lower() for s in section_names}
    for node in xml_root.iter():
        local = node.tag.split("}")[-1].lower()
        if local in section_lowered:
            hit = _extract_first_xml_text(node, tag_names)
            if hit:
                return hit
    return None


def _xml_local(el: ET.Element) -> str:
    return el.tag.split("}")[-1].lower()


def _first_element_by_local(xml_root: ET.Element, *local_names: str) -> ET.Element | None:
    want = {n.lower() for n in local_names}
    for node in xml_root.iter():
        if _xml_local(node) in want:
            return node
    return None


def _parse_amount_from_xml(raw: str | None) -> float | None:
    if not raw or not str(raw).strip():
        return None
    s = re.sub(r"[^\d,.\-]", "", str(raw).strip())
    if not s or s in {".", "-", "-."}:
        return None
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _parse_xml_datetime_to_utc(raw: str | None) -> datetime | None:
    if not raw or not str(raw).strip():
        return None
    t = str(raw).strip()
    if t.endswith("Z"):
        t = t[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(t)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt


def _address_from_ender_nac(ender: ET.Element) -> dict[str, str | None]:
    cep_raw = _extract_first_xml_text(ender, ("CEP", "Cep"))
    return {
        "logradouro": _extract_first_xml_text(ender, ("xLgr", "Logradouro")),
        "numero": _extract_first_xml_text(ender, ("nro", "Numero")),
        "bairro": _extract_first_xml_text(ender, ("xBairro", "Bairro")),
        "municipio_ibge": _extract_first_xml_text(ender, ("cMun",)),
        "uf": _extract_first_xml_text(ender, ("UF", "Uf")),
        "cep": digits_only(cep_raw) if cep_raw else None,
    }


def _address_from_end_block(end_el: ET.Element) -> dict[str, str | None]:
    end_nac = _first_element_by_local(end_el, "endernac")
    out: dict[str, str | None] = {
        "logradouro": _extract_first_xml_text(end_el, ("xLgr",)),
        "numero": _extract_first_xml_text(end_el, ("nro",)),
        "bairro": _extract_first_xml_text(end_el, ("xBairro",)),
    }
    if end_nac is not None:
        out["municipio_ibge"] = _extract_first_xml_text(end_nac, ("cMun",))
        cep_raw = _extract_first_xml_text(end_nac, ("CEP", "Cep"))
        if cep_raw:
            out["cep"] = digits_only(cep_raw) or cep_raw
    return out


def _build_nfse_import_display(
    xml_root: ET.Element,
    tomador: dict[str, str | None],
    *,
    client_id: int,
    client_name: str,
) -> dict[str, Any]:
    """Campos legíveis extraídos do XML nacional (SPED NFS-e + DPS) para exibir na UI."""
    out: dict[str, Any] = {
        "vinculo_sistema": {"client_id": client_id, "nome_cliente_cadastro": client_name},
        "tomador_resumo": {k: v for k, v in tomador.items() if v},
    }
    nfse_el = _first_element_by_local(xml_root, "nfse")
    if nfse_el is not None and nfse_el.attrib.get("versao"):
        out["layout_nfse_versao"] = nfse_el.attrib.get("versao")

    inf_nfse = _first_element_by_local(xml_root, "infnfse")
    if inf_nfse is not None:
        vals_inf = _first_element_by_local(inf_nfse, "valores")
        v_liq_raw = None
        if vals_inf is not None:
            v_liq_raw = _extract_first_xml_text(vals_inf, ("vLiq", "vliq"))
        if not v_liq_raw:
            v_liq_raw = _extract_first_xml_text(inf_nfse, ("vLiq",))
        out["nfse"] = {
            "id": inf_nfse.attrib.get("Id"),
            "local_emissao": _extract_first_xml_text(inf_nfse, ("xLocEmi",)),
            "local_prestacao": _extract_first_xml_text(inf_nfse, ("xLocPrestacao",)),
            "numero": _extract_first_xml_text(inf_nfse, ("nNFSe", "nnfse", "Numero")),
            "codigo_local_incidencia": _extract_first_xml_text(inf_nfse, ("cLocIncid",)),
            "local_incidencia_nome": _extract_first_xml_text(inf_nfse, ("xLocIncid",)),
            "texto_tributacao_nacional": _extract_first_xml_text(inf_nfse, ("xTribNac",)),
            "descricao_nbs": _extract_first_xml_text(inf_nfse, ("xNBS",)),
            "versao_aplicativo": _extract_first_xml_text(inf_nfse, ("verAplic",)),
            "ambiente_geracao": _extract_first_xml_text(inf_nfse, ("ambGer",)),
            "tipo_emissao": _extract_first_xml_text(inf_nfse, ("tpEmis",)),
            "processo_emissao": _extract_first_xml_text(inf_nfse, ("procEmi",)),
            "status_codigo": _extract_first_xml_text(inf_nfse, ("cStat",)),
            "data_hora_processamento": _extract_first_xml_text(inf_nfse, ("dhProc",)),
            "n_dfse": _extract_first_xml_text(inf_nfse, ("nDFSe", "ndfse")),
            "valor_liquido": _parse_amount_from_xml(v_liq_raw),
        }

    emit = _first_element_by_local(xml_root, "emit")
    if emit is not None:
        ender = _first_element_by_local(emit, "endernac")
        doc_prest = _extract_first_xml_text(emit, ("CNPJ", "CPF"))
        out["prestador_nfse"] = {
            "cnpj_cpf": digits_only(doc_prest) if doc_prest else None,
            "nome": _extract_first_xml_text(emit, ("xNome",)),
            "telefone": _extract_first_xml_text(emit, ("fone", "Fone")),
            "email": _extract_first_xml_text(emit, ("email", "Email")),
            "endereco": _address_from_ender_nac(ender) if ender is not None else {},
        }

    dps_el = _first_element_by_local(xml_root, "dps")
    inf_dps = _first_element_by_local(xml_root, "infdps")
    if inf_dps is None and dps_el is not None:
        inf_dps = _first_element_by_local(dps_el, "infdps")
    if inf_dps is not None:
        out["dps"] = {
            "id": inf_dps.attrib.get("Id"),
            "versao_layout": dps_el.attrib.get("versao") if dps_el is not None else None,
            "ambiente": _extract_first_xml_text(inf_dps, ("tpAmb",)),
            "data_hora_emissao": _extract_first_xml_text(inf_dps, ("dhEmi",)),
            "versao_aplicativo": _extract_first_xml_text(inf_dps, ("verAplic",)),
            "serie": _extract_first_xml_text(inf_dps, ("serie",)),
            "numero": _extract_first_xml_text(inf_dps, ("nDPS", "ndps")),
            "competencia": _extract_first_xml_text(inf_dps, ("dCompet",)),
            "tipo_emitente": _extract_first_xml_text(inf_dps, ("tpEmit",)),
            "codigo_local_emissao": _extract_first_xml_text(inf_dps, ("cLocEmi",)),
        }

    prest = _first_element_by_local(xml_root, "prest")
    if prest is not None:
        reg = _first_element_by_local(prest, "regtrib")
        doc_p = _extract_first_xml_text(prest, ("CNPJ", "CPF"))
        out["prestador_dps"] = {
            "cnpj_cpf": digits_only(doc_p) if doc_p else None,
            "telefone": _extract_first_xml_text(prest, ("fone",)),
            "email": _extract_first_xml_text(prest, ("email",)),
            "regime": {
                "op_simp_nac": _extract_first_xml_text(reg, ("opSimpNac",)) if reg is not None else None,
                "reg_esp_trib": _extract_first_xml_text(reg, ("regEspTrib",)) if reg is not None else None,
            },
        }

    toma_el = _first_element_by_local(xml_root, "toma")
    tom_el = _first_element_by_local(xml_root, "tom")
    t_el = toma_el or tom_el
    if t_el is not None:
        end_toma = _first_element_by_local(t_el, "end")
        doc_t = _extract_first_xml_text(t_el, ("CNPJ", "CPF"))
        out["tomador_xml"] = {
            "cnpj_cpf": digits_only(doc_t) if doc_t else None,
            "nome": _extract_first_xml_text(t_el, ("xNome",)),
            "email": _extract_first_xml_text(t_el, ("email", "Email")),
            "endereco": _address_from_end_block(end_toma) if end_toma is not None else {},
        }

    serv = _first_element_by_local(xml_root, "serv")
    if serv is not None:
        loc = _first_element_by_local(serv, "locprest")
        cserv = _first_element_by_local(serv, "cserv")
        out["servico"] = {
            "codigo_local_prestacao": _extract_first_xml_text(loc, ("cLocPrestacao",)) if loc is not None else None,
            "codigo_tributacao_nacional": _extract_first_xml_text(cserv, ("cTribNac",)) if cserv is not None else None,
            "descricao": _extract_first_xml_text(cserv, ("xDescServ", "xDescricao")) if cserv is not None else None,
            "codigo_nbs": _extract_first_xml_text(cserv, ("cNBS",)) if cserv is not None else None,
        }

    if inf_dps is not None:
        vals = _first_element_by_local(inf_dps, "valores")
        v_serv_raw = None
        trib_info: dict[str, str | None] = {}
        if vals is not None:
            vsp = _first_element_by_local(vals, "vservprest")
            if vsp is not None:
                v_serv_raw = _extract_first_xml_text(vsp, ("vServ",))
            trib = _first_element_by_local(vals, "trib")
            if trib is not None:
                tm = _first_element_by_local(trib, "tribmun")
                if tm is not None:
                    trib_info["trib_issqn"] = _extract_first_xml_text(tm, ("tribISSQN",))
                    trib_info["tp_ret_issqn"] = _extract_first_xml_text(tm, ("tpRetISSQN",))
                tt = _first_element_by_local(trib, "tottrib")
                if tt is not None:
                    trib_info["ind_tot_trib"] = _extract_first_xml_text(tt, ("indTotTrib",))
        out["valores_dps"] = {
            "valor_servico": _parse_amount_from_xml(v_serv_raw),
            "tributos_municipais": trib_info or None,
        }

    return out


def _extract_xml_from_stored_response(response_payload_json: str | None) -> str | None:
    if not response_payload_json or not str(response_payload_json).strip():
        return None
    s = str(response_payload_json).strip().lstrip("\ufeff")
    try:
        data = json.loads(s)
        if isinstance(data, dict):
            xml_part = data.get("xml")
            if isinstance(xml_part, str) and xml_part.strip():
                return xml_part.strip()
    except json.JSONDecodeError:
        pass
    if s.startswith("<") or s.startswith("<?xml"):
        return s
    return None


def _apply_parsed_xml_to_invoice(
    row: NfseInvoice,
    root: ET.Element,
    raw_xml: str,
    client: Client,
    *,
    amount_override: float | None = None,
) -> None:
    """Preenche campos da NFS-e a partir do XML (importação ou reprocessamento)."""
    tomador = _extract_tomador_data(root)
    nfse_number = _extract_first_xml_text(
        root,
        ("Numero", "NfseNumero", "numeroNfse", "nNFSe", "nnfse"),
    )
    rps_number = _extract_first_xml_text(
        root,
        ("NumeroRps", "RpsNumero", "numeroRps", "nDPS", "ndps"),
    )
    verification_code = _extract_first_xml_text(root, ("CodigoVerificacao", "VerificationCode"))
    municipal_code = _extract_first_xml_text(
        root,
        ("CodigoMunicipio", "MunicipioCodigo", "cLocIncid", "clocincid", "cLocEmi", "clocemi"),
    )

    amount = amount_override
    if amount is None:
        amount_candidates = (
            _extract_first_xml_text(root, ("vLiq",)),
            _extract_first_xml_text(root, ("vServ",)),
            _extract_first_xml_text(root, ("ValorServicos", "ValorServico", "ValorLiquidoNfse", "ValorNfse")),
        )
        amount = 0.0
        for raw_amt in amount_candidates:
            parsed = _parse_amount_from_xml(raw_amt)
            if parsed is not None and parsed > 0:
                amount = parsed
                break

    issued_at = _parse_xml_datetime_to_utc(_extract_first_xml_text(root, ("dhProc",)))
    if issued_at is None:
        issued_at = _parse_xml_datetime_to_utc(_extract_first_xml_text(root, ("dhEmi",)))
    if issued_at is None:
        issued_at = row.issued_at or datetime.now(timezone.utc)

    parsed_display = _build_nfse_import_display(root, tomador, client_id=client.id, client_name=client.name)

    row.amount = max(0.0, float(amount))
    row.rps_number = rps_number
    row.nfse_number = nfse_number
    row.verification_code = verification_code
    row.municipal_code = municipal_code
    chave: str | None = None
    inf_nfse_el = _first_element_by_local(root, "infnfse")
    if inf_nfse_el is not None:
        id_attr = inf_nfse_el.attrib.get("Id") or inf_nfse_el.attrib.get("id")
        if id_attr:
            dig = digits_only(id_attr)
            if len(dig) >= 44:
                chave = dig[:50]
    if not chave:
        ch_xml = _extract_first_xml_text(root, ("chNFSe", "ChaveAcesso", "chaveAcesso"))
        if ch_xml:
            dig = digits_only(ch_xml)
            if len(dig) >= 44:
                chave = dig[:50]
    row.nfse_access_key = chave
    row.issued_at = issued_at
    row.response_payload_json = json.dumps({"xml": raw_xml, "parsed": parsed_display}, ensure_ascii=False)


def _infer_tax_kind_by_digits(raw: str | None) -> str | None:
    if not raw:
        return None
    d = digits_only(raw)
    if len(d) == 11:
        return "cpf"
    if len(d) == 14:
        return "cnpj"
    return None


def _find_nfse_nacional_tom_element(xml_root: ET.Element) -> ET.Element | None:
    """Primeiro <tom> ou <toma> da DPS com CPF/CNPJ preenchido (layout nacional)."""
    for node in xml_root.iter():
        local = node.tag.split("}")[-1].lower()
        if local not in ("tom", "toma"):
            continue
        if _extract_first_xml_text(
            node,
            ("Cnpj", "Cpf", "CpfCnpj", "TomadorCpfCnpj", "Documento"),
        ):
            return node
    return None


def _extract_tomador_data(xml_root: ET.Element) -> dict[str, str | None]:
    # ABRASF + NFSe Nacional (DPS / leiautes Sefin — ex.: RN_DPS, elementos curtos como <tom>, <emit>, <prest>):
    # ver documentação em https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/
    # (Portal NF-e em nfe.fazenda.gov.br trata de NF-e modelo 55, não do XML da NFS-e nacional.)
    tomador_sections = (
        "TomadorServico",
        "Tomador",
        "DadosTomador",
        "IdentificacaoTomador",
        "tom",
        "toma",
        "Toma",
        "infToma",
    )
    tag_doc = ("Cnpj", "Cpf", "CpfCnpj", "TomadorCpfCnpj", "Documento")
    tag_name = ("RazaoSocial", "Nome", "TomadorRazaoSocial", "TomadorNome", "xNome", "xFant", "XNome", "XFant")
    tag_email = ("Email", "email", "TomadorEmail")
    tag_phone = ("Telefone", "TelefoneContato", "TomadorTelefone", "fone")
    tag_street = ("Endereco", "Logradouro", "Rua", "xLgr")
    tag_number = ("Numero", "NumeroEndereco", "nro")
    tag_compl = ("Complemento", "xCpl")
    tag_district = ("Bairro", "xBairro")
    tag_city = ("Cidade", "Municipio", "xMun")
    tag_state = ("Uf", "Estado", "UF")
    tag_cep = ("Cep", "CodigoPostal", "CEP")

    tom_el = _find_nfse_nacional_tom_element(xml_root)
    scope = tom_el if tom_el is not None else xml_root
    if tom_el is not None:
        doc_raw = _extract_first_xml_text(scope, tag_doc)
        name = _extract_first_xml_text(scope, tag_name)
        email = _extract_first_xml_text(scope, tag_email)
        phone = _extract_first_xml_text(scope, tag_phone)
        street = _extract_first_xml_text(scope, tag_street)
        number = _extract_first_xml_text(scope, tag_number)
        compl = _extract_first_xml_text(scope, tag_compl)
        district = _extract_first_xml_text(scope, tag_district)
        city = _extract_first_xml_text(scope, tag_city)
        state = _extract_first_xml_text(scope, tag_state)
        cep = _extract_first_xml_text(scope, tag_cep)
    else:
        doc_raw = _extract_first_xml_text_scoped(xml_root, tomador_sections, tag_doc) or _extract_first_xml_text(
            xml_root, ("TomadorCpfCnpj",)
        )
        name = _extract_first_xml_text_scoped(xml_root, tomador_sections, tag_name) or _extract_first_xml_text(
            xml_root, ("TomadorRazaoSocial", "TomadorNome", "xNome", "XNome")
        )
        email = _extract_first_xml_text_scoped(xml_root, tomador_sections, tag_email) or _extract_first_xml_text(
            xml_root, ("TomadorEmail",)
        )
        phone = _extract_first_xml_text_scoped(xml_root, tomador_sections, tag_phone) or _extract_first_xml_text(
            xml_root, ("TomadorTelefone",)
        )
        street = _extract_first_xml_text_scoped(xml_root, tomador_sections, tag_street)
        number = _extract_first_xml_text_scoped(xml_root, tomador_sections, tag_number)
        compl = _extract_first_xml_text_scoped(xml_root, tomador_sections, tag_compl)
        district = _extract_first_xml_text_scoped(xml_root, tomador_sections, tag_district)
        city = _extract_first_xml_text_scoped(xml_root, tomador_sections, tag_city)
        state = _extract_first_xml_text_scoped(xml_root, tomador_sections, tag_state)
        cep = _extract_first_xml_text_scoped(xml_root, tomador_sections, tag_cep)

    doc_digits = digits_only(doc_raw) if doc_raw else ""
    document = doc_digits if doc_digits else None
    return {
        "name": name,
        "document": document,
        "email": email,
        "phone": phone,
        "address_street": street,
        "address_number": number,
        "address_complement": compl,
        "address_district": district,
        "address_city": city,
        "address_state": state,
        "address_postal_code": cep,
    }


def _fill_client_missing_fields_from_tomador(client: Client, tomador: dict[str, str | None]) -> None:
    if not client.document and tomador.get("document"):
        kind = _infer_tax_kind_by_digits(tomador.get("document"))
        if kind:
            try:
                client.document = normalize_and_validate_tax_document(tomador["document"] or "", kind)
                client.tax_id_kind = kind
            except ValueError:
                pass
    if not client.email and tomador.get("email"):
        client.email = tomador["email"]
    if not client.phone and tomador.get("phone"):
        client.phone = tomador["phone"]
    if not client.address_street and tomador.get("address_street"):
        client.address_street = tomador["address_street"]
    if not client.address_number and tomador.get("address_number"):
        client.address_number = tomador["address_number"]
    if not client.address_complement and tomador.get("address_complement"):
        client.address_complement = tomador["address_complement"]
    if not client.address_district and tomador.get("address_district"):
        client.address_district = tomador["address_district"]
    if not client.address_city and tomador.get("address_city"):
        client.address_city = tomador["address_city"]
    if not client.address_state and tomador.get("address_state"):
        client.address_state = tomador["address_state"][:2].upper()
    if not client.address_postal_code and tomador.get("address_postal_code"):
        client.address_postal_code = tomador["address_postal_code"]


@router.get(
    "/settings",
    response_model=NfseSettingsOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def get_nfse_settings(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> NfseSettingsOut:
    row = get_or_create_nfse_settings(db, current_user.tenant_id)
    return _settings_out(row)


@router.patch("/settings", response_model=NfseSettingsOut, dependencies=[Depends(require_roles(UserRole.ADMIN))])
def patch_nfse_settings(
    payload: NfseSettingsUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> NfseSettingsOut:
    row = get_or_create_nfse_settings(db, current_user.tenant_id)
    data = payload.model_dump(exclude_unset=True)
    for key in (
        "mei_opt_in",
        "default_optante_mei",
        "mei_environment",
        "focus_opt_in",
        "focus_environment",
        "auto_issue_on_payment",
        "auto_nfse_provider",
    ):
        if key in data:
            setattr(row, key, data[key])
    if "default_codigo_tributacao_nacional" in data:
        v = data["default_codigo_tributacao_nacional"]
        row.default_codigo_tributacao_nacional = (str(v).strip() if v is not None else "") or None
    if "default_codigo_nbs" in data:
        v = data["default_codigo_nbs"]
        row.default_codigo_nbs = (str(v).strip() if v is not None else "") or None
    if "prestador_inscricao_municipal" in data:
        v = data["prestador_inscricao_municipal"]
        row.prestador_inscricao_municipal = (str(v).strip() if v is not None else "") or None
    if "dps_serie" in data:
        v = data["dps_serie"]
        row.dps_serie = (str(v).strip() if v is not None else "") or None
    cert_b64 = data.get("mei_certificate_base64")
    cert_pwd = data.get("mei_certificate_password")
    if cert_b64:
        row.mei_certificate_base64_encrypted = encrypt_platform_secret(cert_b64)
        fn = _sanitize_cert_filename(data.get("mei_certificate_file_name"))
        if fn:
            row.mei_certificate_file_name = fn
    if cert_pwd:
        row.mei_certificate_password_encrypted = encrypt_platform_secret(cert_pwd)
    if data.get("clear_mei_certificate"):
        row.mei_certificate_base64_encrypted = None
        row.mei_certificate_password_encrypted = None
        row.mei_certificate_file_name = None
    if data.get("mei_portal_username"):
        row.mei_portal_username_encrypted = encrypt_platform_secret(data["mei_portal_username"])
    if data.get("mei_portal_password"):
        row.mei_portal_password_encrypted = encrypt_platform_secret(data["mei_portal_password"])
    if data.get("clear_mei_portal_credentials"):
        row.mei_portal_username_encrypted = None
        row.mei_portal_password_encrypted = None
    if data.get("focus_api_key"):
        row.focus_api_key_encrypted = encrypt_platform_secret(data["focus_api_key"])
    if data.get("clear_focus_api_key"):
        row.focus_api_key_encrypted = None
    db.add(row)
    db.commit()
    db.refresh(row)
    return _settings_out(row)


@router.post("/settings/test-mei", response_model=NfseMeiTestOut, dependencies=[Depends(require_roles(UserRole.ADMIN))])
def test_mei_settings(
    payload: NfseMeiTestRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> NfseMeiTestOut:
    row = get_or_create_nfse_settings(db, current_user.tenant_id)
    cert_b64 = (payload.mei_certificate_base64 or "").strip()
    cert_pwd = payload.mei_certificate_password
    if not cert_b64 and row.mei_certificate_base64_encrypted:
        cert_b64 = decrypt_platform_secret(row.mei_certificate_base64_encrypted)
    if not cert_pwd and row.mei_certificate_password_encrypted:
        cert_pwd = decrypt_platform_secret(row.mei_certificate_password_encrypted)
    if not cert_b64 or not cert_pwd:
        return NfseMeiTestOut(
            ok=False,
            certificate_ok=False,
            portal_credentials_present=bool(row.mei_portal_username_encrypted and row.mei_portal_password_encrypted),
            message="Certificado A1 e senha são obrigatórios para testar.",
            sefin_ok=None,
            sefin_message=None,
        )
    try:
        cert_raw = base64.b64decode(cert_b64)
        load_key_and_certificates(cert_raw, cert_pwd.encode("utf-8"))
    except Exception:
        row.mei_last_test_error = "Falha ao abrir certificado A1 com a senha informada."
        row.mei_last_tested_at = None
        db.add(row)
        db.commit()
        return NfseMeiTestOut(
            ok=False,
            certificate_ok=False,
            portal_credentials_present=bool(row.mei_portal_username_encrypted and row.mei_portal_password_encrypted),
            message="Falha ao abrir certificado A1 com a senha informada.",
            sefin_ok=None,
            sefin_message=None,
        )

    portal_present = bool(
        (payload.mei_portal_username and payload.mei_portal_password)
        or (row.mei_portal_username_encrypted and row.mei_portal_password_encrypted)
    )

    sefin_ok: bool | None = None
    sefin_message: str | None = None
    overall_ok = True
    msg_parts = ["Certificado A1 válido."]

    if payload.test_sefin_connectivity and os.getenv("NFSE_SEFIN_DISABLED", "").strip().lower() not in (
        "1",
        "true",
        "yes",
        "on",
    ):
        try:
            ssl_ctx = ssl_context_from_pfx_bytes(cert_raw, cert_pwd)
            base = emit_base_url(row.mei_environment)
            sefin_ok, sefin_message = ping_sefin_mtls(ssl_ctx, base)
            if sefin_ok:
                msg_parts.append(sefin_message or "")
            else:
                overall_ok = False
                msg_parts.append(f"Sefin ({base}): {sefin_message or 'falha na conexão mTLS.'}")
                row.mei_last_test_error = (sefin_message or "Falha no teste de conexão com o Sefin Nacional.")[:500]
        except Exception as exc:
            overall_ok = False
            sefin_ok = False
            sefin_message = str(exc)
            msg_parts.append(f"Sefin: {exc}")
            row.mei_last_test_error = str(exc)[:500]
    elif payload.test_sefin_connectivity:
        sefin_ok = None
        sefin_message = "Teste Sefin omitido (NFSE_SEFIN_DISABLED)."
        msg_parts.append(sefin_message)

    if overall_ok:
        row.mei_last_test_error = None
        msg_parts.append("Pronto para seguir para a integração MEI nacional.")
    row.mei_last_tested_at = datetime.now(timezone.utc)
    db.add(row)
    db.commit()

    return NfseMeiTestOut(
        ok=overall_ok,
        certificate_ok=True,
        portal_credentials_present=portal_present,
        message=" ".join(p for p in msg_parts if p).strip(),
        sefin_ok=sefin_ok,
        sefin_message=sefin_message,
    )


@router.get(
    "/tributacao-nacional/catalog",
    response_model=list[NfseTributacaoNacionalItemOut],
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def nfse_tributacao_nacional_catalog() -> list[NfseTributacaoNacionalItemOut]:
    return [NfseTributacaoNacionalItemOut(**item) for item in list_tributacao_nacional_catalog()]


def _require_nacional_precheck(
    emitter: object,
    *,
    tenant: Tenant,
    client: Client,
    service_order: ServiceOrder | None,
    amount: float,
    servico_descricao_manual: str | None,
    trib: str | None,
    nbs: str | None,
) -> None:
    if not isinstance(emitter, NationalMeiEmitter):
        return
    raw_disc = (servico_descricao_manual or "").strip() or nfse_servico_description(service_order)
    disc = nfse_dps_descricao_sanitizada(raw_disc)
    msg = nacional_emit_precheck_message(
        tenant=tenant,
        client=client,
        amount=amount,
        discriminacao=disc,
        codigo_tributacao_nacional=trib,
        codigo_nbs=nbs,
    )
    if msg:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=msg)


@router.post("/issue", response_model=NfseInvoiceOut, dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))])
def issue_nfse(
    payload: NfseIssueRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> NfseInvoiceOut:
    tenant = db.get(Tenant, current_user.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant não encontrado.")

    settings = get_or_create_nfse_settings(db, current_user.tenant_id)
    desc_avulsa = (payload.service_description or "").strip()
    standalone = (
        payload.client_id is not None
        and payload.amount is not None
        and payload.amount > 0
        and len(desc_avulsa) >= 5
    )

    if standalone:
        client = db.execute(
            select(Client).where(Client.id == payload.client_id, Client.tenant_id == current_user.tenant_id)
        ).scalar_one_or_none()
        if client is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado.")
        amount = float(payload.amount)
        trib, nbs = nfse_tax_codes_for_order(
            None,
            override_tributacao=payload.codigo_tributacao_nacional,
            override_nbs=payload.codigo_nbs,
            default_tributacao=settings.default_codigo_tributacao_nacional,
            default_nbs=settings.default_codigo_nbs,
        )
        forced = NfseProvider(payload.force_provider) if payload.force_provider else None
        emitter = NfseFactory.build(settings, tenant, forced=forced)
        _require_nacional_precheck(
            emitter,
            tenant=tenant,
            client=client,
            service_order=None,
            amount=amount,
            servico_descricao_manual=desc_avulsa,
            trib=trib,
            nbs=nbs,
        )
        result = emitter.issue(
            NfseIssueContext(
                tenant=tenant,
                client=client,
                service_order=None,
                finance_entry=None,
                amount=amount,
                codigo_tributacao_nacional=trib,
                codigo_nbs=nbs,
                servico_descricao=desc_avulsa,
            )
        )
        row = upsert_nfse_invoice(
            db,
            tenant_id=current_user.tenant_id,
            client_id=client.id,
            service_order_id=None,
            finance_entry_id=None,
            amount=amount,
            result=result,
        )
        return _invoice_out(row)

    finance_entry = None
    service_order = None
    if payload.finance_entry_id is not None:
        finance_entry = db.execute(
            select(FinanceEntry).where(FinanceEntry.id == payload.finance_entry_id, FinanceEntry.tenant_id == current_user.tenant_id)
        ).scalar_one_or_none()
        if finance_entry is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lançamento financeiro não encontrado.")
        if finance_entry.service_order_id:
            service_order = db.execute(
                select(ServiceOrder).where(
                    ServiceOrder.id == finance_entry.service_order_id, ServiceOrder.tenant_id == current_user.tenant_id
                )
            ).scalar_one_or_none()
    if service_order is None and payload.service_order_id is not None:
        service_order = db.execute(
            select(ServiceOrder).where(ServiceOrder.id == payload.service_order_id, ServiceOrder.tenant_id == current_user.tenant_id)
        ).scalar_one_or_none()
    if service_order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ordem de serviço não encontrada.")

    service_order = db.execute(
        select(ServiceOrder)
        .where(ServiceOrder.id == service_order.id, ServiceOrder.tenant_id == current_user.tenant_id)
        .options(selectinload(ServiceOrder.service_items).selectinload(ServiceOrderServiceItem.service))
    ).scalar_one()

    client = db.execute(
        select(Client).where(Client.id == service_order.client_id, Client.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado.")

    amount = float(finance_entry.amount) if finance_entry is not None else 0.0
    if amount <= 0:
        amount = float(sum(float(it.unit_price) * int(it.quantity) for it in service_order.service_items))

    trib, nbs = nfse_tax_codes_for_order(
        service_order,
        override_tributacao=payload.codigo_tributacao_nacional,
        override_nbs=payload.codigo_nbs,
        default_tributacao=settings.default_codigo_tributacao_nacional,
        default_nbs=settings.default_codigo_nbs,
    )

    forced = NfseProvider(payload.force_provider) if payload.force_provider else None
    emitter = NfseFactory.build(settings, tenant, forced=forced)
    _require_nacional_precheck(
        emitter,
        tenant=tenant,
        client=client,
        service_order=service_order,
        amount=amount,
        servico_descricao_manual=None,
        trib=trib,
        nbs=nbs,
    )
    result = emitter.issue(
        NfseIssueContext(
            tenant=tenant,
            client=client,
            service_order=service_order,
            finance_entry=finance_entry,
            amount=amount,
            codigo_tributacao_nacional=trib,
            codigo_nbs=nbs,
            servico_descricao=None,
        )
    )
    row = upsert_nfse_invoice(
        db,
        tenant_id=current_user.tenant_id,
        client_id=client.id,
        service_order_id=service_order.id,
        finance_entry_id=finance_entry.id if finance_entry else None,
        amount=amount,
        result=result,
    )
    return _invoice_out(row)


@router.patch(
    "/invoices/{invoice_id}",
    response_model=NfseInvoiceOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def patch_nfse_invoice(
    invoice_id: int,
    payload: NfseInvoicePatch,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> NfseInvoiceOut:
    row = db.execute(
        select(NfseInvoice)
        .options(selectinload(NfseInvoice.client))
        .where(NfseInvoice.id == invoice_id, NfseInvoice.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NFS-e não encontrada.")

    data = payload.model_dump(exclude_unset=True)
    if not data:
        db.refresh(row)
        return _invoice_out(row)

    if "service_order_id" in data and data["service_order_id"] is not None:
        new_so_id = data["service_order_id"]
        so = db.execute(
            select(ServiceOrder).where(ServiceOrder.id == new_so_id, ServiceOrder.tenant_id == current_user.tenant_id)
        ).scalar_one_or_none()
        if so is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ordem de serviço não encontrada.")
        if so.client_id != row.client_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A OS deve ser do mesmo cliente desta NFS-e.",
            )
        other = db.execute(
            select(NfseInvoice).where(
                NfseInvoice.tenant_id == current_user.tenant_id,
                NfseInvoice.service_order_id == new_so_id,
                NfseInvoice.id != invoice_id,
            )
        ).scalar_one_or_none()
        if other is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Já existe outra NFS-e vinculada a esta ordem de serviço.",
            )
        row.service_order_id = new_so_id

    if "finance_entry_id" in data and data["finance_entry_id"] is not None:
        fe_id = data["finance_entry_id"]
        fe = db.execute(
            select(FinanceEntry).where(FinanceEntry.id == fe_id, FinanceEntry.tenant_id == current_user.tenant_id)
        ).scalar_one_or_none()
        if fe is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lançamento financeiro não encontrado.")
        if fe.service_order_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O lançamento precisa estar vinculado a uma ordem de serviço.",
            )
        so_fe = db.execute(
            select(ServiceOrder).where(ServiceOrder.id == fe.service_order_id, ServiceOrder.tenant_id == current_user.tenant_id)
        ).scalar_one_or_none()
        if so_fe is None or so_fe.client_id != row.client_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O lançamento deve referir-se a uma OS do mesmo cliente desta NFS-e.",
            )
        row.finance_entry_id = fe_id

    db.add(row)
    db.commit()
    db.refresh(row)
    row = db.execute(
        select(NfseInvoice)
        .options(selectinload(NfseInvoice.client))
        .where(NfseInvoice.id == row.id)
    ).scalar_one()
    return _invoice_out(row)


@router.get("/invoices", response_model=list[NfseInvoiceOut], dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))])
def list_nfse_invoices(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    status_filter: str | None = None,
    provider: str | None = None,
    service_order_id: int | None = None,
    search: str | None = None,
    sort: str | None = "nfse_number_desc",
    limit: int = 100,
) -> list[NfseInvoiceOut]:
    q = select(NfseInvoice).where(NfseInvoice.tenant_id == current_user.tenant_id)
    if status_filter:
        try:
            status_enum = NfseInvoiceStatus(status_filter)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="status_filter inválido.") from exc
        q = q.where(NfseInvoice.status == status_enum)
    if provider:
        try:
            provider_enum = NfseProvider(provider)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="provider inválido.") from exc
        q = q.where(NfseInvoice.provider == provider_enum)
    if service_order_id is not None:
        q = q.where(NfseInvoice.service_order_id == service_order_id)
    if search and search.strip():
        term = f"%{search.strip()}%"
        sq = search.strip()
        conds = [
            NfseInvoice.nfse_number.ilike(term),
            NfseInvoice.rps_number.ilike(term),
            NfseInvoice.verification_code.ilike(term),
            Client.name.ilike(term),
        ]
        if sq.isdigit():
            conds.append(NfseInvoice.id == int(sq))
        q = q.join(Client, Client.id == NfseInvoice.client_id).where(or_(*conds))
    q = q.options(selectinload(NfseInvoice.client))

    sort_key = (sort or "nfse_number_desc").strip().lower()
    num_order = literal_column(
        "CASE WHEN trim(nfse_invoices.nfse_number) ~ '^[0-9]+$' "
        "THEN CAST(trim(nfse_invoices.nfse_number) AS BIGINT) ELSE -1 END"
    )
    if sort_key == "id_desc":
        q = q.order_by(NfseInvoice.id.desc())
    elif sort_key == "nfse_number_asc":
        q = q.order_by(num_order.asc().nulls_last(), NfseInvoice.id.asc())
    else:
        q = q.order_by(num_order.desc().nulls_last(), NfseInvoice.id.desc())

    rows = db.execute(q.limit(max(1, min(200, int(limit))))).scalars().all()
    return [_invoice_out(row) for row in rows]


@router.post(
    "/invoices/{invoice_id}/reparse-xml",
    response_model=NfseInvoiceOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def reparse_nfse_invoice_from_xml(
    invoice_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> NfseInvoiceOut:
    """Relê o XML salvo em `response_payload_json`, atualiza `parsed`, valores e metadados na linha."""
    row = db.execute(
        select(NfseInvoice)
        .options(selectinload(NfseInvoice.client))
        .where(NfseInvoice.id == invoice_id, NfseInvoice.tenant_id == current_user.tenant_id)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NFS-e não encontrada.")
    raw_xml = _extract_xml_from_stored_response(row.response_payload_json)
    if not raw_xml:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não há XML armazenado nesta NFS-e para reprocessar.",
        )
    try:
        root = ET.fromstring(raw_xml)
    except ET.ParseError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="XML armazenado inválido.") from exc
    client = row.client
    if client is None:
        client = db.get(Client, row.client_id)
    if client is None or client.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente vinculado não encontrado.")
    _apply_parsed_xml_to_invoice(row, root, raw_xml, client, amount_override=None)
    db.add(row)
    db.commit()
    row = db.execute(
        select(NfseInvoice)
        .options(selectinload(NfseInvoice.client))
        .where(NfseInvoice.id == row.id)
    ).scalar_one()
    return _invoice_out(row)


@router.post(
    "/invoices/{invoice_id}/refresh-adn",
    response_model=NfseInvoiceOut,
    dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))],
)
def refresh_nfse_invoice_from_adn(
    invoice_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> NfseInvoiceOut:
    """Consulta GET /dps/{id} no ADN e atualiza nota ainda em Pendente envio (Nacional MEI)."""
    try:
        refresh_pending_nfse_from_adn(db, tenant_id=current_user.tenant_id, invoice_id=invoice_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    row = db.execute(
        select(NfseInvoice)
        .options(selectinload(NfseInvoice.client))
        .where(NfseInvoice.id == invoice_id, NfseInvoice.tenant_id == current_user.tenant_id)
    ).scalar_one()
    return _invoice_out(row)


@router.post("/import-issued-xml", response_model=NfseInvoiceOut, dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))])
def import_issued_nfse_xml(
    payload: NfseImportXmlRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> NfseInvoiceOut:
    service_order_id: int | None = payload.service_order_id
    finance_entry_id: int | None = payload.finance_entry_id

    if service_order_id is not None:
        so = db.execute(
            select(ServiceOrder).where(
                ServiceOrder.id == service_order_id,
                ServiceOrder.tenant_id == current_user.tenant_id,
            )
        ).scalar_one_or_none()
        if so is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ordem de serviço não encontrada.")

    if finance_entry_id is not None:
        fe = db.execute(
            select(FinanceEntry).where(
                FinanceEntry.id == finance_entry_id,
                FinanceEntry.tenant_id == current_user.tenant_id,
            )
        ).scalar_one_or_none()
        if fe is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lançamento financeiro não encontrado.")

    raw_xml = payload.xml_content.strip()
    try:
        root = ET.fromstring(raw_xml)
    except ET.ParseError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="XML inválido.") from exc

    tomador = _extract_tomador_data(root)
    client: Client | None = None

    if payload.associate_client_id is not None:
        client = db.execute(
            select(Client).where(
                Client.id == payload.associate_client_id,
                Client.tenant_id == current_user.tenant_id,
            )
        ).scalar_one_or_none()
        if client is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente associado não encontrado.")
    elif payload.client_id is not None:
        client = db.execute(
            select(Client).where(
                Client.id == payload.client_id,
                Client.tenant_id == current_user.tenant_id,
            )
        ).scalar_one_or_none()
        if client is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cliente não encontrado.")
    else:
        normalized_doc: str | None = None
        doc_validation_detail: str | None = None
        doc_kind = _infer_tax_kind_by_digits(tomador.get("document"))
        if doc_kind and tomador.get("document"):
            try:
                normalized_doc = normalize_and_validate_tax_document(tomador["document"] or "", doc_kind)
            except ValueError as exc:
                normalized_doc = None
                doc_validation_detail = str(exc)
        if normalized_doc:
            client = db.execute(
                select(Client).where(
                    Client.tenant_id == current_user.tenant_id,
                    Client.document == normalized_doc,
                )
            ).scalar_one_or_none()
        if client is None:
            if not payload.auto_create_client_if_missing:
                if doc_validation_detail:
                    detail = (
                        f"CPF/CNPJ do tomador no XML não passou na validação: {doc_validation_detail} "
                        f"(valor extraído: {tomador.get('document') or '—'}). "
                        "Associe manualmente a um cliente ou corrija o arquivo."
                    )
                else:
                    detail = (
                        f"Tomador não encontrado no cadastro. Documento: {tomador.get('document') or 'não informado'}. "
                        "Marque a opção de criar cliente automaticamente ou associe a um cliente existente."
                    )
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)
            if not normalized_doc:
                if doc_validation_detail:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Não é possível criar cliente automaticamente: {doc_validation_detail}",
                    ) from None
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Não é possível criar cliente automaticamente sem CPF/CNPJ válido no XML.",
                )
            name = (tomador.get("name") or "").strip() or "Tomador importado NFS-e"
            client = Client(
                tenant_id=current_user.tenant_id,
                name=name,
                document=normalized_doc,
                tax_id_kind=doc_kind or "cnpj",
                email=tomador.get("email"),
                phone=tomador.get("phone"),
                address_street=tomador.get("address_street"),
                address_number=tomador.get("address_number"),
                address_complement=tomador.get("address_complement"),
                address_district=tomador.get("address_district"),
                address_city=tomador.get("address_city"),
                address_state=(tomador.get("address_state") or "")[:2].upper() or None,
                address_postal_code=tomador.get("address_postal_code"),
            )
            db.add(client)
            db.commit()
            db.refresh(client)

    _fill_client_missing_fields_from_tomador(client, tomador)
    db.add(client)
    db.commit()
    db.refresh(client)

    row = NfseInvoice(
        tenant_id=current_user.tenant_id,
        client_id=client.id,
        service_order_id=service_order_id,
        finance_entry_id=finance_entry_id,
        provider=NfseProvider(payload.provider),
        status=NfseInvoiceStatus.ISSUED,
        amount=0.0,
        request_payload_json=json.dumps(
            {"source": "xml_import", "linked_client_id": client.id},
            ensure_ascii=False,
        ),
        error_message=None,
    )
    _apply_parsed_xml_to_invoice(row, root, raw_xml, client, amount_override=payload.amount)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _invoice_out(row)


@router.post("/import-issued-xml/batch", response_model=NfseImportXmlBatchOut, dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.RECEPTIONIST))])
def import_issued_nfse_xml_batch(
    payload: NfseImportXmlBatchRequest,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> NfseImportXmlBatchOut:
    items: list[NfseImportXmlBatchItemOut] = []
    imported = 0
    failed = 0
    for idx, xml_text in enumerate(payload.xml_items, start=1):
        file_name = None
        if payload.file_names and len(payload.file_names) >= idx:
            file_name = payload.file_names[idx - 1]
        try:
            row = import_issued_nfse_xml(
                NfseImportXmlRequest(
                    client_id=payload.client_id,
                    associate_client_id=payload.associate_client_id,
                    auto_create_client_if_missing=payload.auto_create_client_if_missing,
                    service_order_id=payload.service_order_id,
                    finance_entry_id=payload.finance_entry_id,
                    provider=payload.provider,
                    xml_content=xml_text,
                    amount=payload.amount,
                ),
                db,
                current_user,
            )
            imported += 1
            items.append(
                NfseImportXmlBatchItemOut(
                    index=idx,
                    file_name=file_name,
                    ok=True,
                    message="Importado com sucesso.",
                    invoice_id=row.id,
                    nfse_number=row.nfse_number,
                )
            )
        except HTTPException as exc:
            failed += 1
            detail = str(exc.detail) if exc.detail else "Falha na importação."
            items.append(NfseImportXmlBatchItemOut(index=idx, file_name=file_name, ok=False, message=detail))
        except Exception:
            failed += 1
            items.append(
                NfseImportXmlBatchItemOut(
                    index=idx,
                    file_name=file_name,
                    ok=False,
                    message="Erro inesperado ao importar XML.",
                )
            )

    return NfseImportXmlBatchOut(total=len(payload.xml_items), imported=imported, failed=failed, items=items)
