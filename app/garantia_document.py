"""Montagem do documento de garantia (termo) para PDF — empresa, cliente e textos do tenant."""

from __future__ import annotations

import calendar
from datetime import date
from typing import Any

from models import Client, Tenant

from app.tenant_garantia_settings import (
    DEFAULT_CONDICOES_EXCLUSOES,
    DEFAULT_MESES_GARANTIA,
    DEFAULT_NOTA_GARANTIA_FABRICA,
    DEFAULT_SERVICOS_COBERTOS,
    DEFAULT_TERMOS_GARANTIA,
    _default_prazo_servico,
)


def _s(val: Any) -> str:
    if val is None:
        return ""
    return str(val).strip()


def _add_months_iso(iso_date: str, months: int) -> str:
    if not iso_date or months < 1:
        return ""
    try:
        d = date.fromisoformat(iso_date[:10])
    except ValueError:
        return ""
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day).isoformat()


def _iso_to_br(iso: str) -> str:
    if not iso:
        return "—"
    try:
        d = date.fromisoformat(iso[:10])
        return d.strftime("%d/%m/%Y")
    except ValueError:
        return iso


def _tenant_address(tenant: Tenant) -> str:
    parts = [
        _s(tenant.address_street),
        _s(tenant.address_number),
        _s(tenant.address_district),
    ]
    street = ", ".join(p for p in parts if p)
    city = _s(tenant.address_city)
    state = _s(tenant.address_state)
    city_line = " — ".join(p for p in [city, state] if p)
    cep = _s(tenant.address_postal_code)
    lines = [street] if street else []
    if city_line:
        lines.append(city_line)
    if cep:
        lines.append(f"CEP {cep}")
    return "\n".join(lines)


def _client_address(client: Client | None, garantia: dict[str, Any]) -> str:
    addr = _s(garantia.get("clienteEndereco"))
    if addr:
        return addr
    if not client:
        return ""
    parts = [
        _s(getattr(client, "address_street", None)),
        _s(getattr(client, "address_number", None)),
        _s(getattr(client, "address_district", None)),
        _s(getattr(client, "address_city", None)),
        _s(getattr(client, "address_state", None)),
    ]
    return ", ".join(p for p in parts if p)


def resolve_vacuo_microns(garantia: dict[str, Any]) -> str:
    rel = garantia.get("vacuoRelatorio") if isinstance(garantia.get("vacuoRelatorio"), dict) else {}
    foto = garantia.get("vacuoFoto") if isinstance(garantia.get("vacuoFoto"), dict) else {}
    legacy = garantia.get("vacuoArquivo") if isinstance(garantia.get("vacuoArquivo"), dict) else {}
    for src in (rel, foto, legacy):
        val = _s(src.get("vacuoFinalMicronsAi"))
        if val:
            return val
    return _s(garantia.get("vacuoFinalMicrons"))


def _metric_value(garantia: dict[str, Any], value_key: str, foto_key: str) -> str:
    foto = garantia.get(foto_key) if isinstance(garantia.get(foto_key), dict) else {}
    extracted = _s(foto.get("extractedValue"))
    if extracted:
        return extracted
    manual = _s(garantia.get(value_key))
    return manual or "—"


def merge_garantia_document(
    garantia: dict[str, Any],
    settings: dict[str, Any],
    *,
    tenant: Tenant,
    client: Client | None,
    laudo_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    laudo_meta = laudo_meta or {}
    meses_raw = garantia.get("mesesGarantia")
    meses = int(meses_raw) if meses_raw is not None and str(meses_raw).strip().isdigit() else int(
        settings.get("defaultMesesGarantia") or DEFAULT_MESES_GARANTIA
    )
    data_instalacao = _s(garantia.get("dataInstalacao")) or _s(garantia.get("assinaturaData"))
    validade = _s(garantia.get("validadeAte")) or (
        _add_months_iso(data_instalacao, meses) if data_instalacao and meses else ""
    )

    serie_evap = _s(garantia.get("serieEvaporadora"))
    serie_cond = _s(garantia.get("serieCondensadora"))
    numero_serie = _s(garantia.get("numeroSerie")) or serie_evap or serie_cond

    trade = _s(tenant.trade_name) or _s(tenant.name)

    return {
        "empresa_razao_social": _s(garantia.get("empresaRazaoSocial")) or _s(tenant.name),
        "empresa_nome_fantasia": _s(garantia.get("empresaNomeFantasia")) or trade,
        "empresa_cnpj": _s(garantia.get("empresaCnpj")) or _s(tenant.cnpj),
        "empresa_endereco": _s(garantia.get("empresaEndereco")) or _tenant_address(tenant),
        "empresa_telefone": _s(garantia.get("empresaTelefone")) or _s(tenant.phone),
        "empresa_email": _s(garantia.get("empresaEmail")) or _s(tenant.email),
        "cliente_nome": _s(garantia.get("clienteNome")) or (client.name if client else ""),
        "cliente_documento": _s(garantia.get("clienteDocumento")) or (client.document if client else ""),
        "cliente_endereco": _client_address(client, garantia),
        "cliente_telefone": _s(garantia.get("clienteTelefone")) or (client.phone if client else ""),
        "equipment_tag": _s(garantia.get("equipmentTag")),
        "tipo_aparelho": _s(garantia.get("tipoAparelho")),
        "marca_modelo": _s(garantia.get("marcaModelo")) or _s(garantia.get("catalogLabel")),
        "capacidade": _s(garantia.get("capacidade")),
        "serie_evaporadora": serie_evap,
        "serie_condensadora": serie_cond,
        "numero_serie": numero_serie,
        "local_instalacao": _s(garantia.get("localInstalacao")),
        "qrcode_code_id": _s(garantia.get("qrcodeCodeId")),
        "data_instalacao": data_instalacao,
        "data_instalacao_br": _iso_to_br(data_instalacao),
        "validade_ate": validade,
        "validade_ate_br": _iso_to_br(validade),
        "meses_garantia": meses,
        "prazo_garantia_servico": _s(garantia.get("prazoGarantiaServico"))
        or _s(settings.get("prazoGarantiaServico"))
        or _default_prazo_servico(meses),
        "nota_garantia_fabrica": _s(garantia.get("notaGarantiaFabrica"))
        or _s(settings.get("notaGarantiaFabrica"))
        or DEFAULT_NOTA_GARANTIA_FABRICA,
        "termos_garantia": _s(garantia.get("termosGarantia"))
        or _s(settings.get("termosGarantia"))
        or DEFAULT_TERMOS_GARANTIA,
        "servicos_cobertos": _s(garantia.get("servicosCobertos"))
        or _s(settings.get("servicosCobertos"))
        or DEFAULT_SERVICOS_COBERTOS,
        "condicoes_exclusoes": _s(garantia.get("condicoesExclusoes"))
        or _s(settings.get("condicoesExclusoes"))
        or DEFAULT_CONDICOES_EXCLUSOES,
        "observacoes": _s(garantia.get("observacoes")),
        "vacuo_microns": resolve_vacuo_microns(garantia) or "—",
        "pressao_psi": _metric_value(garantia, "pressaoTrabalhoPsi", "pressaoFoto"),
        "tensao_v": _metric_value(garantia, "tensaoMedidaVolts", "tensaoFoto"),
        "corrente_a": _metric_value(garantia, "correnteCompressorAmperes", "correnteFoto"),
        "temp_insuflamento": _metric_value(garantia, "temperaturaInsuflamento", "tempInsuflamentoFoto"),
        "temp_retorno": _metric_value(garantia, "temperaturaRetorno", "tempRetornoFoto"),
        "tecnico_nome": _s(garantia.get("tecnicoResponsavelNome")),
        "assinatura_local": _s(garantia.get("assinaturaLocal")) or _s(tenant.address_city),
        "assinatura_data": _s(garantia.get("assinaturaData")) or data_instalacao,
        "assinatura_data_br": _iso_to_br(_s(garantia.get("assinaturaData")) or data_instalacao),
        "client_signature_base64": laudo_meta.get("clientSignatureBase64"),
        "client_signature_name": _s(laudo_meta.get("clientSignatureName"))
        or _s(garantia.get("clienteNome"))
        or (client.name if client else ""),
    }
