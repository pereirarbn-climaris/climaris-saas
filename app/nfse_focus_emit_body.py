"""Montagem do JSON para NFSe Nacional na API Focus (`POST /v2/nfsen`).

Documentação: https://doc.focusnfe.com.br/reference/nfse — NFSe Nacional (``/v2/nfsen``).
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any

from zoneinfo import ZoneInfo

from app.nfse_dps_xml import _resolve_c_loc_prestacao
from app.nfse_xml_normalize import (
    c_nbs_digitos,
    c_trib_nac_digitos,
    nfse_dps_descricao_sanitizada,
    nfse_xml_ascii_fold,
)
from app.tax_id import digits_only
from models import Client, ServiceOrder, Tenant, TenantNfseSettings


def focus_datetime_strings_br() -> tuple[str, str]:
    """``data_emissao`` / ``data_competencia`` (fuso America/Sao_Paulo, formato Focus ±HHMM)."""

    now = datetime.now(ZoneInfo("America/Sao_Paulo"))
    off_sec = int(now.utcoffset().total_seconds()) if now.utcoffset() else 0
    sign = "+" if off_sec >= 0 else "-"
    abs_sec = abs(off_sec)
    hh = abs_sec // 3600
    mm = (abs_sec % 3600) // 60
    tzs = f"{sign}{hh:02d}{mm:02d}"
    dh = now.strftime("%Y-%m-%dT%H:%M:%S") + tzs
    return dh, now.date().isoformat()


def focus_op_simp_nac(settings: TenantNfseSettings) -> int:
    if settings.default_optante_mei or settings.mei_opt_in:
        return 2
    return 1


def _servico_descricao(context_service_order: ServiceOrder | None, servico_descricao: str | None) -> str:
    if (servico_descricao or "").strip():
        return servico_descricao.strip()
    if context_service_order is None:
        return "Servico"
    if context_service_order.service_items:
        lines: list[str] = []
        for it in sorted(context_service_order.service_items, key=lambda x: x.id):
            name = it.service.name if it.service else "Item"
            lines.append(f"{it.quantity}x {name}")
        return "\n".join(lines)
    return context_service_order.title or "Servico"


def build_focus_nfsen_payload(
    *,
    tenant: Tenant,
    client: Client,
    settings: TenantNfseSettings,
    amount: float,
    codigo_tributacao_nacional: str | None,
    codigo_nbs: str | None,
    service_order: ServiceOrder | None,
    servico_descricao: str | None,
    dh_emissao: str,
    d_compet: str,
) -> dict[str, Any]:
    """JSON enviado ao Focus para NFSe Nacional."""

    c_emi = digits_only(tenant.address_ibge_code or "")
    if len(c_emi) != 7:
        raise ValueError("Empresa sem código IBGE do município (endereço). Informe em Administração.")

    prest = digits_only(tenant.cnpj or "")
    if len(prest) not in (11, 14):
        raise ValueError("CNPJ/CPF do prestador inválido no cadastro da empresa.")

    im = (
        (settings.prestador_inscricao_municipal or "").strip()
        or (os.getenv("NFSE_PRESTADOR_INSCRICAO_MUNICIPAL") or "").strip()
    )
    if not im:
        raise ValueError(
            "Inscrição municipal do prestador obrigatória para Focus NFSe Nacional. "
            "Informe em Administração → NFS-e ou NFSE_PRESTADOR_INSCRICAO_MUNICIPAL."
        )

    trib = c_trib_nac_digitos(codigo_tributacao_nacional)
    if trib == "000000":
        raise ValueError("Informe o código de tributação nacional (cTribNac / LC 116) para NFSe.")

    desc = nfse_dps_descricao_sanitizada(_servico_descricao(service_order, servico_descricao))

    tom = digits_only(client.document or "")
    if len(tom) not in (11, 14):
        raise ValueError("CPF/CNPJ do tomador inválido.")

    c_mun_tom = digits_only(client.address_ibge_code or "") or c_emi
    if len(c_mun_tom) != 7:
        c_mun_tom = c_emi

    c_loc_prest = _resolve_c_loc_prestacao(tenant=tenant, client=client, c_loc_emi=c_emi)

    payload: dict[str, Any] = {
        "data_emissao": dh_emissao,
        "data_competencia": d_compet,
        "codigo_municipio_emissora": int(c_emi),
        "inscricao_municipal_prestador": im,
        "codigo_opcao_simples_nacional": focus_op_simp_nac(settings),
        "regime_especial_tributacao": 0,
        "razao_social_tomador": nfse_xml_ascii_fold((client.name or "").strip(), max_len=150),
        "codigo_municipio_tomador": int(c_mun_tom),
        "codigo_municipio_prestacao": int(c_loc_prest),
        "codigo_tributacao_nacional_iss": trib,
        "descricao_servico": desc,
        "valor_servico": float(amount),
        "tributacao_iss": int(os.getenv("NFSE_FOCUS_TRIBUTACAO_ISS", "1")),
        "tipo_retencao_iss": int(os.getenv("NFSE_FOCUS_TIPO_RETENCAO_ISS", "1")),
    }

    if len(prest) == 14:
        payload["cnpj_prestador"] = prest
    else:
        payload["cpf_prestador"] = prest

    if len(tom) == 14:
        payload["cnpj_tomador"] = tom
    else:
        payload["cpf_tomador"] = tom

    cep = digits_only(client.address_postal_code or "")
    if cep:
        payload["cep_tomador"] = cep
    if client.address_street:
        payload["logradouro_tomador"] = nfse_xml_ascii_fold(client.address_street.strip(), max_len=125)
    if client.address_number:
        payload["numero_tomador"] = nfse_xml_ascii_fold(str(client.address_number).strip(), max_len=10)
    if client.address_complement:
        payload["complemento_tomador"] = nfse_xml_ascii_fold(client.address_complement.strip(), max_len=60)
    if client.address_district:
        payload["bairro_tomador"] = nfse_xml_ascii_fold(client.address_district.strip(), max_len=60)
    if client.phone:
        payload["telefone_tomador"] = nfse_xml_ascii_fold(client.phone.strip(), max_len=30)
    if client.email:
        payload["email_tomador"] = client.email.strip()[:120]

    nbs = c_nbs_digitos(codigo_nbs)
    if nbs:
        payload["codigo_nbs"] = nbs

    return payload
