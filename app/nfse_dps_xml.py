"""Montagem do XML da DPS (layout nacional SPED) para envio ao Sefin Nacional.

Fontes oficiais: `Documentação técnica (Portal NFS-e)
<https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica>`_ — leiautes, XSD e APIs de produção / restrita.

Referência comunitária (PHP / NFePHP): `Rainzart/nfse-nacional
<https://github.com/Rainzart/nfse-nacional>`_ — útil para ordem de tags e exemplos; não substitui o XSD vigente.

Namespace: ``http://www.sped.fazenda.gov.br/nfse``. Ajustes finos conforme NT e XSD publicados pelo CGNFS-e.

Validação local: ``app/nfse_dps_xsd_validate.py`` (XSD ``DPS_v1.01.xsd`` em ``Docs/nfse-xsd-extracted/Schemas/1.01``).
"""

from __future__ import annotations

import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from app.nfse_xml_normalize import (
    c_nbs_digitos,
    c_trib_nac_digitos,
    nfse_dps_descricao_sanitizada,
    nfse_xml_ascii_fold,
)
from app.tax_id import digits_only
from models import Client, Tenant

# TSIdDPS (Sefin Nacional): literal DPS + exatamente 42 dígitos — sem letras (vide Nuvem Fiscal / XSD).
# Composição oficial (manual SPED / API nacional): município emissor 7 + tipo inscrição 1 + inscrição federal 14
# + série DPS 5 + número DPS 15. **Não** é a “chave de acesso” da NFS-e autorizada (UF/AAMM/modelo 98/…).
_TS_ID_DPS_PATTERN = re.compile(r"^DPS\d{42}$")

NS = "http://www.sped.fazenda.gov.br/nfse"
VERSAO_DPS = "1.01"
_TZ_BR = ZoneInfo("America/Sao_Paulo")


def _emissao_br_com_margem() -> tuple[datetime, str, str]:
    """Instante de emissão em Brasília (com margem), ``dhEmi`` e ``dCompet`` coerentes.

    O Sefin rejeita se ``dhEmi`` estiver **à frente** do relógio de processamento (E0008).
    Usamos ``America/Sao_Paulo`` e subtraímos alguns minutos (configurável) para absorver
    deriva entre o relógio da VPS e o do governo.
    """

    skew = max(0, min(45, int(os.getenv("NFSE_DPS_DH_EMI_SKEW_MINUTES", "20"))))
    now_br = datetime.now(_TZ_BR) - timedelta(minutes=skew)
    # Manual SPED / exemplo nacional: AAAA-MM-DDThh:mm:ssTZD (offset obrigatório, ex. -03:00).
    dh_emi = now_br.isoformat(timespec="seconds")
    d_compet = now_br.date().isoformat()
    return now_br, dh_emi, d_compet


def _el(parent: ET.Element, tag: str, text: str | None) -> ET.Element:
    e = ET.SubElement(parent, f"{{{NS}}}{tag}")
    if text is not None:
        e.text = text
    return e


def _serie_para_xml(serie: str) -> str:
    """Conteúdo da tag ``serie``: numérico em até 5 dígitos, **com zeros à esquerda** (ex.: ``00001``).

    Alguns validadores da restrita esperam padding; o segmento da série no ``Id`` já usa 5 dígitos.
    Desligue com ``NFSE_DPS_SERIE_XML_SEM_PADDING=1`` para voltar ao valor sem zeros (ex.: ``1``).
    """

    d = digits_only(str(serie))
    if not d:
        d = "1"
    if len(d) > 5:
        d = d[-5:]
    n = int(d)
    if n < 1:
        n = 1
    if n > 99999:
        n = 99999
    if os.getenv("NFSE_DPS_SERIE_XML_SEM_PADDING", "").strip().lower() in ("1", "true", "yes", "on"):
        return str(n)
    return str(n).zfill(5)


def _serie_para_id(serie: str) -> str:
    """Série no Id da infDPS: exatamente 5 dígitos.

    O padrão nacional é ``DPS`` seguido de **somente dígitos**; letras (ex.: série ``NF``) não podem aparecer no Id.
    Sem dígitos na série cadastrada, usa-se ``1`` (ex.: ``NF`` → ``00001``).
    """

    d = digits_only(str(serie))
    if not d:
        d = "1"
    if len(d) > 5:
        d = d[-5:]
    return d.zfill(5)


def _ndps_digit_basis(numero_dps: str) -> str:
    """Apenas dígitos do número da DPS (máx. 15 posições significativas à direita)."""

    d = digits_only(str(numero_dps))
    if len(d) > 15:
        d = d[-15:]
    if not d:
        d = "0"
    return d


def _ndps_para_id(numero_dps: str) -> str:
    """Últimos 15 dígitos do Id da infDPS (segmento fixo com ``zfill``)."""

    return _ndps_digit_basis(numero_dps).zfill(15)


def _ndps_para_xml(numero_dps: str) -> str:
    """Conteúdo da tag ``nDPS``: número sem zeros à esquerda (``TSNumDPS`` / schema nacional)."""

    basis = _ndps_digit_basis(numero_dps)
    n = int(basis)
    if n < 1:
        n = 1
    return str(n)


def _build_inf_dps_id(
    *,
    cod_municipio: str,
    cpf_cnpj_prest: str,
    serie: str,
    numero_dps: str,
) -> str:
    """Id do infDPS: ``DPS`` + 42 dígitos (mun 7 + tipo 1 + inscrição 14 + série 5 + nDPS 15)."""

    doc = digits_only(cpf_cnpj_prest)
    if len(doc) == 11:
        tipo = "1"
        doc14 = doc.zfill(14)
    elif len(doc) == 14:
        tipo = "2"
        doc14 = doc
    else:
        tipo = "2"
        doc14 = doc.zfill(14)[:14].ljust(14, "0")
    ser = _serie_para_id(serie)
    nd = _ndps_para_id(numero_dps)
    inf_id = f"DPS{cod_municipio}{tipo}{doc14}{ser}{nd}"
    if len(inf_id) != 45:
        raise ValueError(
            f"Id infDPS deve ter 45 caracteres (DPS + 42 dígitos); obtido {len(inf_id)}: {inf_id!r}"
        )
    if not _TS_ID_DPS_PATTERN.fullmatch(inf_id):
        raise ValueError(
            f"Id infDPS inválido para TSIdDPS (esperado DPS + 42 dígitos, total {len(inf_id)} caracteres): {inf_id!r}"
        )
    return inf_id


def _resolve_c_loc_prestacao(*, tenant: Tenant, client: Client, c_loc_emi: str) -> str:
    """Código IBGE do **local da prestação** (``serv/locPrest/cLocPrestacao``).

    O XSD v1.01 **não** define ``cMunicIncid`` dentro de ``tribMun``; incluir tag inventada → E1235.
    A incidência espacial (LC 116/03) manifesta-se aqui e deve coincidir com o município esperado (ex.: Araraquara
    ``3503208``).

    Prioridade: ``NFSE_DPS_CLOC_PRESTACAO`` → ``NFSE_DPS_CMUNIC_INCID`` (mesmo IBGE que alguns manuais chamam de
    incidência) → IBGE do tomador → município do emitente.
    """

    ov = digits_only(os.getenv("NFSE_DPS_CLOC_PRESTACAO", "") or "")
    if len(ov) == 7:
        return ov
    inc = digits_only(os.getenv("NFSE_DPS_CMUNIC_INCID", "") or "")
    if len(inc) == 7:
        return inc
    tom = digits_only(getattr(client, "address_ibge_code", None) or "")
    if len(tom) == 7:
        return tom
    return c_loc_emi


def _prest_fone_xml(tenant: Tenant) -> str | None:
    """Telefone do prestador na tag ``fone`` (só dígitos). Espelha exemplos oficiais do ecossistema NFePHP."""

    raw = (os.getenv("NFSE_DPS_PREST_FONE") or "").strip() or (getattr(tenant, "phone", None) or "").strip()
    d = digits_only(raw)
    if len(d) < 10:
        return None
    return d[:20]


def _toma_end(client: Client) -> dict[str, Any] | None:
    ibge = digits_only(client.address_ibge_code or "")
    if len(ibge) != 7:
        return None
    cep = digits_only(client.address_postal_code or "")
    if len(cep) < 8:
        cep = "00000000"

    def _tx(val: str, n: int) -> str:
        return nfse_xml_ascii_fold(val.strip(), max_len=n)

    compl = (client.address_complement or "").strip()
    return {
        "cMun": ibge,
        "CEP": cep[:8],
        "xLgr": _tx(client.address_street or "NAO INFORMADO", 255),
        "nro": _tx(client.address_number or "S/N", 60),
        "xBairro": _tx(client.address_district or "CENTRO", 60),
        "xCpl": _tx(compl, 156) if compl else None,
    }


def build_dps_xml_unsigned(
    *,
    tenant: Tenant,
    client: Client,
    amount: float,
    discriminacao: str,
    codigo_tributacao_nacional: str,
    codigo_nbs: str,
    mei_environment: str,
    serie: str = "NF",
    numero_dps: str | None = None,
    op_simp_nac: int = 1,
    p_tot_trib_sn: Decimal | None = None,
    ver_aplic: str = "Climaris",
    prestador_im: str | None = None,
) -> str:
    """Gera XML DPS (sem assinatura).

    ``op_simpNac`` (manual nacional): 1 não optante; **2 MEI**; 3 ME/EPP — não usar outros códigos.
    """

    c_loc = digits_only(tenant.address_ibge_code or "")
    if len(c_loc) != 7:
        raise ValueError("Empresa sem código IBGE do município (endereço). Informe em Administração.")

    prest_doc = digits_only(tenant.cnpj or "")
    if len(prest_doc) not in (11, 14):
        raise ValueError("CNPJ/CPF do prestador inválido no cadastro da empresa.")

    instante_br, dh_emi, d_compet = _emissao_br_com_margem()
    # Mesmo instante usado em dhEmi/dCompet — evita competência/nDPS “em outro mês” que o relógio UTC puro.
    n_dps_raw = (
        numero_dps or str(int(instante_br.timestamp() * 1000))
    ).strip()
    serie_raw = (serie or "NF").strip()
    inf_id = _build_inf_dps_id(
        cod_municipio=c_loc, cpf_cnpj_prest=prest_doc, serie=serie_raw, numero_dps=n_dps_raw
    )
    serie_xml = _serie_para_xml(serie_raw)
    n_dps_xml = _ndps_para_xml(n_dps_raw)

    tp_amb = "1" if mei_environment == "producao" else "2"
    c_loc_prest = _resolve_c_loc_prestacao(tenant=tenant, client=client, c_loc_emi=c_loc)

    root = ET.Element(f"{{{NS}}}DPS", {"versao": VERSAO_DPS})
    inf = ET.SubElement(root, f"{{{NS}}}infDPS", {"Id": inf_id})

    _el(inf, "tpAmb", tp_amb)
    _el(inf, "dhEmi", dh_emi)
    _el(inf, "verAplic", nfse_xml_ascii_fold((ver_aplic or "").strip(), max_len=20))
    _el(inf, "serie", serie_xml)
    _el(inf, "nDPS", n_dps_xml)
    _el(inf, "dCompet", d_compet)
    _el(inf, "tpEmit", "1")
    _el(inf, "cLocEmi", c_loc)

    prest = ET.SubElement(inf, f"{{{NS}}}prest")
    if len(prest_doc) == 11:
        _el(prest, "CPF", prest_doc)
    else:
        _el(prest, "CNPJ", prest_doc)
    # Ordem XSD: documento federal → IM → regTrib. IM: cadastro Admin / env; alguns municípios (ex. restrita Araraquara)
    # aceitam na tag o número de IE ativa obtido em consultas tipo CNPJá — ver NFSE_PRESTADOR_IE_PARA_TAG_IM.
    im_prest = (
        (prestador_im or "").strip()
        or (os.getenv("NFSE_PRESTADOR_INSCRICAO_MUNICIPAL") or "").strip()
        or (os.getenv("NFSE_PRESTADOR_IE_PARA_TAG_IM") or "").strip()
    )
    if im_prest:
        _el(prest, "IM", nfse_xml_ascii_fold(im_prest, max_len=15))
    # E0121 / E0128: com tpEmit=1 o emitente é o prestador — sem <prest>/xNome nem <prest>/<end> (cadastro nacional).
    # Ordem alinhada ao gerador de referência: ``fone`` antes de ``regTrib`` quando informado.
    fone_p = _prest_fone_xml(tenant)
    if fone_p:
        _el(prest, "fone", fone_p)

    reg_trib = ET.SubElement(prest, f"{{{NS}}}regTrib")
    _el(reg_trib, "opSimpNac", str(op_simp_nac))
    # E0162: não optante (1) e MEI (2) **não** podem informar ``regApTribSN``. Omitimos sempre para MEI.
    # ME/EPP (3): só incluir se o contribuinte não for MEI e a NT local exigir — habilitar explicitamente.
    if op_simp_nac == 3 and os.getenv("NFSE_REG_AP_TRIB_SN_MEEPP", "").strip().lower() in ("1", "true", "yes", "on"):
        _el(reg_trib, "regApTribSN", (os.getenv("NFSE_REG_AP_TRIB_SN") or "1").strip() or "1")
    _el(reg_trib, "regEspTrib", "0")

    toma = ET.SubElement(inf, f"{{{NS}}}toma")
    tom_doc = digits_only(client.document or "")
    if len(tom_doc) == 11:
        _el(toma, "CPF", tom_doc)
    else:
        _el(toma, "CNPJ", tom_doc)
    _el(toma, "xNome", nfse_xml_ascii_fold((client.name or "").strip(), max_len=150))
    te = _toma_end(client)
    if te:
        end_t = ET.SubElement(toma, f"{{{NS}}}end")
        end_nac_t = ET.SubElement(end_t, f"{{{NS}}}endNac")
        _el(end_nac_t, "cMun", te["cMun"])
        _el(end_nac_t, "CEP", te["CEP"])
        _el(end_t, "xLgr", te["xLgr"])
        _el(end_t, "nro", te["nro"])
        if te.get("xCpl"):
            _el(end_t, "xCpl", te["xCpl"])
        _el(end_t, "xBairro", te["xBairro"])

    serv = ET.SubElement(inf, f"{{{NS}}}serv")
    loc = ET.SubElement(serv, f"{{{NS}}}locPrest")
    _el(loc, "cLocPrestacao", c_loc_prest)

    c_serv = ET.SubElement(serv, f"{{{NS}}}cServ")
    c_trib = c_trib_nac_digitos(codigo_tributacao_nacional)
    _el(c_serv, "cTribNac", c_trib)
    _el(c_serv, "xDescServ", nfse_dps_descricao_sanitizada(discriminacao))
    nbs_xml = c_nbs_digitos(codigo_nbs)
    if nbs_xml:
        _el(c_serv, "cNBS", nbs_xml)

    # Valores: na **DPS** só existe ``vServ`` em ``vServPrest`` — não há ``vLiq`` no XML enviado (só na NFS-e autorizada).
    # Não emitir ``vDescCondIncond`` / ``vDedRed`` com zeros: omitir grupos (evita E999).
    # Um único Decimal quantizado para ``vServ`` evita divergência de centavos.
    valores = ET.SubElement(inf, f"{{{NS}}}valores")
    v_serv_prest = ET.SubElement(valores, f"{{{NS}}}vServPrest")
    # ``vServ`` (TSDec15V2): sempre exatamente duas casas decimais com ``.`` e sem milhar (ex.: 1200.00).
    v_dec = Decimal(str(amount)).quantize(Decimal("0.01"))
    v_txt = f"{v_dec:.2f}"
    _el(v_serv_prest, "vServ", v_txt)

    # --- trib (MEI / ``opSimpNac`` = 2): regra de ouro nacional ---
    # • Não gerar ``tribFed`` — E0676.
    # • Sem ``pTotTribSN`` — E0710; só ``indTotTrib`` = 0 em ``totTrib``.
    # • ``tribMun``: só ``tribISSQN`` + ``tpRetISSQN`` — não incluir ``cMunicIncid`` (quebra XSD → E1235).
    trib = ET.SubElement(valores, f"{{{NS}}}trib")
    trib_mun = ET.SubElement(trib, f"{{{NS}}}tribMun")
    _el(trib_mun, "tribISSQN", "1")
    _el(trib_mun, "tpRetISSQN", "1")

    tot_trib = ET.SubElement(trib, f"{{{NS}}}totTrib")
    if op_simp_nac == 2:
        _el(tot_trib, "indTotTrib", "0")
    elif p_tot_trib_sn is not None:
        _el(tot_trib, "pTotTribSN", f"{p_tot_trib_sn.quantize(Decimal('0.01')):.2f}")
    else:
        _el(tot_trib, "indTotTrib", "0")

    ET.register_namespace("", NS)
    xml_decl = '<?xml version="1.0" encoding="UTF-8"?>'
    body = ET.tostring(root, encoding="utf-8").decode("utf-8")
    return xml_decl + "\n" + body
