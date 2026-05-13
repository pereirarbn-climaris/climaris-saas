"""Validações mínimas para emissão no padrão NFS-e Nacional (DPS).

Referência: documentação técnica do portal gov.br/nfse (incl. grupos de serviço,
tomador/prestador e, na transição da reforma tributária, tributação com IBS/CBS).

O layout completo exige dezenas de campos; aqui garantimos o que o Climaris já
consegue preencher a partir de Tenant + Client + serviço, evitando envio incompleto
dos identificadores fiscais principais.
"""

from __future__ import annotations

from app.nfse_xml_normalize import c_nbs_digitos
from app.tax_id import digits_only, validate_cnpj, validate_cpf
from models import Client, Tenant


def nacional_emit_precheck_message(
    *,
    tenant: Tenant,
    client: Client,
    amount: float,
    discriminacao: str,
    codigo_tributacao_nacional: str | None,
    codigo_nbs: str | None,
) -> str | None:
    """Retorna mensagem de erro em português ou None se OK."""

    d_prest = digits_only(tenant.cnpj or "")
    kind_prest = (tenant.tax_id_kind or "cnpj").lower()
    if kind_prest == "cpf":
        if len(d_prest) != 11 or not validate_cpf(d_prest):
            return "CPF do prestador inválido. Conclua o cadastro fiscal da empresa (Administração)."
    else:
        if len(d_prest) != 14 or not validate_cnpj(d_prest):
            return "CNPJ do prestador inválido. Conclua o cadastro fiscal da empresa (Administração)."

    doc_toma = digits_only(client.document or "")
    if len(doc_toma) not in (11, 14):
        return "Tomador sem CPF/CNPJ válido. Atualize o cadastro do cliente antes de emitir."
    if len(doc_toma) == 11 and not validate_cpf(doc_toma):
        return "CPF do tomador inválido. Corrija o cadastro do cliente."
    if len(doc_toma) == 14 and not validate_cnpj(doc_toma):
        return "CNPJ do tomador inválido. Corrija o cadastro do cliente."

    nome = (client.name or "").strip()
    if len(nome) < 2:
        return "Nome ou razão social do tomador é obrigatório."

    if amount <= 0:
        return "Valor do serviço deve ser maior que zero."

    if len(discriminacao.strip()) < 5:
        return "Discriminação do serviço é obrigatória (mínimo 5 caracteres)."

    trib = (codigo_tributacao_nacional or "").strip()
    if not trib:
        return (
            "Código de tributação nacional (cTribNac) é obrigatório na NFS-e Nacional. "
            "Defina em Administração → Fiscal, nos serviços da OS ou na emissão."
        )

    trib_digits = digits_only(codigo_tributacao_nacional or "")
    if len(trib_digits) < 6:
        return (
            "Código de tributação nacional deve ter 6 dígitos (item LC 116 / lista nacional), "
            "sem ou com pontos — ex.: 140101 para manutenção de máquinas e equipamentos; "
            "010101 é desenvolvimento de software — não combine com serviços como instalação de ar-condicionado."
        )

    nbs_norm = c_nbs_digitos(codigo_nbs)
    if not nbs_norm:
        return (
            "Código NBS (Nomenclatura Brasileira de Serviços) é obrigatório no layout nacional vigente. "
            "Defina em Administração → Fiscal, nos cadastros de serviço ou na emissão. "
            "Use a tabela oficial correlacionada ao cTribNac (portal NFS-e / RFB)."
        )

    ibge = digits_only(client.address_ibge_code or "")
    if len(ibge) != 7:
        return (
            "Código IBGE do município do tomador é obrigatório (7 dígitos) na NFS-e Nacional. "
            "Informe no cadastro do cliente, em Endereço — a busca por CEP preenche automaticamente quando o serviço retorna o código."
        )

    return None
