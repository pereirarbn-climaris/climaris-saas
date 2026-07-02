"""Configurações do termo de garantia de instalação por tenant."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import TenantGarantiaSettings

DEFAULT_MESES_GARANTIA = 12

DEFAULT_NOTA_GARANTIA_FABRICA = (
    "Os prazos de garantia do aparelho e de peças de fabricação são de responsabilidade exclusiva "
    "do fabricante, conforme manual e nota fiscal do equipamento. Esta garantia de serviço cobre "
    "somente a mão de obra e os itens instalados pela empresa."
)

DEFAULT_SERVICOS_COBERTOS = """• Vazamentos de fluido refrigerante nas conexões/flanges executadas pela empresa.
• Falhas no sistema de drenagem da água instalado pela equipe.
• Problemas de fixação mecânica (suportes e buchas) das unidades.
• Erros de interligação elétrica entre as unidades efetuados no ato da instalação."""

DEFAULT_CONDICOES_EXCLUSOES = """• Defeitos internos de fabricação de peças, placas eletrônicas ou compressor.
• Quedas de energia, subtensão, sobretensão ou descargas atmosféricas (raios).
• Subdimensionamento do equipamento quando contrário à recomendação técnica.
• Danos por vandalismo, acidentes, uso incorreto ou falta de limpeza periódica.
• Intervenção de terceiros: se outro técnico ou o cliente alterar o aparelho ou as tubulações após a instalação, a garantia do serviço é cancelada.
• Mudança de endereço do aparelho sem nova vistoria e contrato de instalação."""

DEFAULT_TERMOS_GARANTIA = (
    "Garantia do serviço de instalação conforme prazo informado neste documento, em conformidade com o "
    "Código de Defesa do Consumidor, limitada ao escopo descrito em “Serviços cobertos”."
)


def _default_prazo_servico(meses: int) -> str:
    return f"90 dias legais + {meses} meses de garantia complementar do serviço"


def _get_or_create_row(db: Session, *, tenant_id: int) -> TenantGarantiaSettings:
    row = db.execute(
        select(TenantGarantiaSettings).where(TenantGarantiaSettings.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if row is not None:
        return row
    meses = DEFAULT_MESES_GARANTIA
    row = TenantGarantiaSettings(
        tenant_id=tenant_id,
        default_meses_garantia=meses,
        prazo_garantia_servico=_default_prazo_servico(meses),
        nota_garantia_fabrica=DEFAULT_NOTA_GARANTIA_FABRICA,
        termos_garantia=DEFAULT_TERMOS_GARANTIA,
        servicos_cobertos=DEFAULT_SERVICOS_COBERTOS,
        condicoes_exclusoes=DEFAULT_CONDICOES_EXCLUSOES,
    )
    db.add(row)
    db.flush()
    return row


def _row_to_dict(row: TenantGarantiaSettings) -> dict:
    meses = row.default_meses_garantia or DEFAULT_MESES_GARANTIA
    return {
        "defaultMesesGarantia": meses,
        "prazoGarantiaServico": (row.prazo_garantia_servico or "").strip() or _default_prazo_servico(meses),
        "notaGarantiaFabrica": (row.nota_garantia_fabrica or "").strip() or DEFAULT_NOTA_GARANTIA_FABRICA,
        "termosGarantia": (row.termos_garantia or "").strip() or DEFAULT_TERMOS_GARANTIA,
        "servicosCobertos": (row.servicos_cobertos or "").strip() or DEFAULT_SERVICOS_COBERTOS,
        "condicoesExclusoes": (row.condicoes_exclusoes or "").strip() or DEFAULT_CONDICOES_EXCLUSOES,
    }


def get_tenant_garantia_settings(db: Session, *, tenant_id: int) -> dict:
    row = _get_or_create_row(db, tenant_id=tenant_id)
    db.commit()
    return _row_to_dict(row)


def patch_tenant_garantia_settings(db: Session, *, tenant_id: int, payload: dict) -> dict:
    row = _get_or_create_row(db, tenant_id=tenant_id)

    if "default_meses_garantia" in payload and payload["default_meses_garantia"] is not None:
        meses = int(payload["default_meses_garantia"])
        if meses < 1:
            meses = 1
        row.default_meses_garantia = meses
    if "prazo_garantia_servico" in payload:
        row.prazo_garantia_servico = (payload["prazo_garantia_servico"] or "").strip() or None
    if "nota_garantia_fabrica" in payload:
        row.nota_garantia_fabrica = (payload["nota_garantia_fabrica"] or "").strip() or None
    if "termos_garantia" in payload:
        row.termos_garantia = (payload["termos_garantia"] or "").strip() or None
    if "servicos_cobertos" in payload:
        row.servicos_cobertos = (payload["servicos_cobertos"] or "").strip() or None
    if "condicoes_exclusoes" in payload:
        row.condicoes_exclusoes = (payload["condicoes_exclusoes"] or "").strip() or None

    db.commit()
    db.refresh(row)
    return _row_to_dict(row)
