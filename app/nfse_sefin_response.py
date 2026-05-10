"""Interpretação da resposta JSON da API Sefin Nacional após POST da DPS.

O layout exato varia entre versões da API; cobrimos campos documentados em materiais
oficiais e exemplos de integradores (cStat 100, chaveAcesso, nfse.infNfse.nNFSe, etc.).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class SefinDpsInterpretation:
    """Resultado único para o fluxo de emissão."""

    success: bool
    pending_protocol_only: bool
    error_message: str | None
    nfse_number: str | None
    verification_code: str | None
    access_key: str | None
    municipal_code: str | None


def _deep_first(obj: Any, keys: tuple[str, ...]) -> Any:
    if isinstance(obj, dict):
        for name in keys:
            if name in obj and obj[name] is not None and obj[name] != "":
                return obj[name]
        for v in obj.values():
            r = _deep_first(v, keys)
            if r is not None and r != "":
                return r
    elif isinstance(obj, list):
        for it in obj:
            r = _deep_first(it, keys)
            if r is not None and r != "":
                return r
    return None


def _top_error_messages(d: dict[str, Any]) -> list[str]:
    out: list[str] = []
    erro = d.get("erro")
    if isinstance(erro, dict):
        c = erro.get("cStat")
        x = erro.get("xMotivo") or erro.get("descricao") or erro.get("mensagem")
        if x:
            out.append(f"{c}: {x}" if c is not None else str(x))
    xm = d.get("xMotivo") or d.get("motivo")
    cstat = d.get("cStat")
    if xm and str(cstat) not in ("100", "None", ""):
        if str(cstat) != "100":
            out.append(str(xm))
    for key in ("mensagens", "erros", "listaMensagem", "ListaMensagem", "listaMensagens"):
        raw = d.get(key)
        if not isinstance(raw, list):
            continue
        for it in raw:
            if isinstance(it, str) and it.strip():
                out.append(it.strip())
            elif isinstance(it, dict):
                m = (
                    it.get("xMotivo")
                    or it.get("descricao")
                    or it.get("Descricao")
                    or it.get("mensagem")
                    or it.get("texto")
                )
                c = it.get("cStat") or it.get("codigo") or it.get("Codigo")
                if m:
                    out.append(f"{c}: {m}" if c is not None else str(m))
    return out


def _http_fallback_message(http_code: int) -> str:
    """Mensagem legível quando o JSON não traz motivo (ex.: só status HTTP)."""

    if http_code == 404:
        return (
            "Recurso não encontrado no Ambiente Nacional (HTTP 404). "
            "Na consulta da DPS: o identificador pode estar errado, o ambiente (homologação ou produção) pode não "
            "coincidir com o da emissão ou a DPS não existe no ADN — em geral é preciso Reemitir."
        )
    if http_code in (401, 403):
        return (
            f"Acesso negado pelo ADN (HTTP {http_code}). Confira certificado digital e configuração do ambiente nacional."
        )
    if http_code == 408:
        return "Tempo esgotado ao contatar o ADN (HTTP 408). Tente de novo em instantes."
    if http_code >= 500:
        return (
            f"Indisponibilidade temporária no Ambiente Nacional (HTTP {http_code}). Tente novamente mais tarde."
        )
    return f"Resposta do ADN sem detalhe (HTTP {http_code})."


def extract_sefin_protocol_number(body: Any) -> int | str | None:
    """Extrai nsNRec da primeira resposta da emissão."""

    if not isinstance(body, dict):
        return None
    for key in ("nsNRec", "nsnRec", "protocolo", "ns_n_rec"):
        v = body.get(key)
        if v is not None and str(v).strip() != "":
            return v
    return None


def interpret_sefin_dps_response(http_code: int, body: dict[str, Any] | str) -> SefinDpsInterpretation:
    if http_code == 0:
        msg = body if isinstance(body, str) else "Falha de rede ou timeout ao contatar o Sefin Nacional."
        return SefinDpsInterpretation(
            success=False,
            pending_protocol_only=False,
            error_message=msg[:2000],
            nfse_number=None,
            verification_code=None,
            access_key=None,
            municipal_code=None,
        )

    if isinstance(body, str):
        trimmed = body.strip()
        msg = trimmed[:2000] if trimmed else _http_fallback_message(http_code)
        return SefinDpsInterpretation(
            success=False,
            pending_protocol_only=False,
            error_message=msg,
            nfse_number=None,
            verification_code=None,
            access_key=None,
            municipal_code=None,
        )

    d = body
    access_key = _deep_first(d, ("chaveAcesso", "chave_acesso", "chNFSe"))
    nfse_number = _deep_first(d, ("nNFSe", "numeroNfse", "numero", "numeroNFSe"))
    verification_code = _deep_first(
        d,
        ("cVerif", "cVerifica", "codigoVerificacao", "codigo_verificacao", "codValidacao", "codigoValidacao"),
    )
    municipal_code = _deep_first(d, ("cLocEmi", "cMun", "codigoMunicipio"))

    cstat_raw = d.get("cStat")
    if cstat_raw is None and isinstance(d.get("nfse"), dict):
        cstat_raw = _deep_first(d["nfse"], ("cStat",))
    cstat_s = str(cstat_raw).strip() if cstat_raw is not None else ""

    errs = _top_error_messages(d)
    if not errs and http_code >= 400:
        errs.append(_http_fallback_message(http_code))

    # chNFSe / chaveAcesso — ignorar literal "null" (algumas APIs retornam string).
    if access_key is not None and str(access_key).strip().lower() in ("null", "none", ""):
        access_key = None

    # Sucesso explícito: cStat 100 ou presença de chave + número de NF-e / XML.
    explicit_ok = cstat_s in ("100", "100.0")
    has_doc = bool(
        access_key
        or nfse_number
        or _deep_first(d, ("nfseXmlGZipB64", "xmlNfse", "nfseXml", "xml"))
    )

    if explicit_ok or (has_doc and not errs and http_code in (200, 201)):
        return SefinDpsInterpretation(
            success=True,
            pending_protocol_only=False,
            error_message=None,
            nfse_number=str(nfse_number) if nfse_number is not None else None,
            verification_code=str(verification_code) if verification_code is not None else None,
            access_key=str(access_key) if access_key is not None else None,
            municipal_code=str(municipal_code) if municipal_code is not None else None,
        )

    # Resposta do endpoint de consulta de status: ainda sem resultado final.
    st_outer = d.get("status")
    if st_outer is not None and str(st_outer).strip() in ("-2", "-6") and http_code in (200, 201):
        return SefinDpsInterpretation(
            success=False,
            pending_protocol_only=True,
            error_message=None,
            nfse_number=None,
            verification_code=None,
            access_key=None,
            municipal_code=None,
        )

    # Alguns retornos só trazem protocolo (ex.: status 200 / nsNRec) — nota ainda processando.
    ns_rec = d.get("nsNRec") or d.get("nsnRec") or d.get("protocolo")
    status_num = d.get("status")
    if ns_rec is not None and not has_doc and http_code in (200, 201):
        pend = True
        if status_num == 200 and isinstance(d.get("motivo"), str) and "enviado" in d["motivo"].lower():
            pend = True
        if pend:
            return SefinDpsInterpretation(
                success=False,
                pending_protocol_only=True,
                error_message=None,
                nfse_number=None,
                verification_code=None,
                access_key=None,
                municipal_code=None,
            )

    if cstat_s and cstat_s != "100":
        msg = d.get("xMotivo") or "; ".join(errs) or "Rejeição no ambiente nacional."
    else:
        msg = "; ".join(errs) if errs else "Resposta do Sefin Nacional sem dados de NFS-e autorizada."

    has_e999 = False
    raw_errs = d.get("erros")
    if isinstance(raw_errs, list):
        for it in raw_errs:
            if isinstance(it, dict) and str(it.get("Codigo", "")).strip().upper() == "E999":
                has_e999 = True
                break
    if not has_e999:
        has_e999 = any("E999" in str(e) for e in errs)
    if has_e999 and msg:
        msg = (
            f"{msg} "
            "Verifique: cTribNac e cNBS conforme tabela oficial; série compatível com emissão por API "
            "(faixa de integração, típico 00001–49999 — 70000–79999 costuma ser só no Portal web); "
            "use novo nDPS em cada teste; a produção restrita pode falhar intermitentemente."
        )

    has_e0010 = False
    if isinstance(raw_errs, list):
        for it in raw_errs:
            if isinstance(it, dict) and str(it.get("Codigo", "")).strip().upper() == "E0010":
                has_e0010 = True
                break
    if not has_e0010:
        has_e0010 = any("E0010" in str(e) for e in errs)
    if has_e0010 and msg:
        msg = (
            f"{msg} "
            "Emissão via API (webservice): use série na faixa permitida para integração (orientação nacional, típico 00001–49999). "
            "Série 70000–79999 costuma ser só para emissão pelo Portal Nacional — não replique no POST da API."
        )

    return SefinDpsInterpretation(
        success=False,
        pending_protocol_only=False,
        error_message=msg[:2000],
        nfse_number=str(nfse_number) if nfse_number is not None else None,
        verification_code=str(verification_code) if verification_code is not None else None,
        access_key=str(access_key) if access_key is not None else None,
        municipal_code=str(municipal_code) if municipal_code is not None else None,
    )
