"""Assinatura XML-DSig (envelopada) do infDPS com certificado A1."""

from __future__ import annotations

from typing import Any

from lxml import etree
from signxml import XMLSigner, methods
from signxml.util import namespaces as sx_ns


def sign_dps_xml(xml_string: str, cert_pem: bytes, key_pem: bytes) -> str:
    """Assina o elemento `infDPS` referenciado pelo atributo `Id`.

    O Sefin Nacional rejeita E1228 ("Xml declarado com prefixo de namespace.") quando a
    assinatura XML-DSig usa prefixos ``ds:Signature``. Usamos namespace padrão (sem prefixo)
    para ``http://www.w3.org/2000/09/xmldsig#``, conforme signxml (#275).
    """

    root = etree.fromstring(xml_string.encode("utf-8"))
    signer = XMLSigner(
        method=methods.enveloped,
        signature_algorithm="rsa-sha256",
        digest_algorithm="sha256",
        c14n_algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    )
    signer.namespaces = {None: sx_ns.ds}
    signed_root = signer.sign(root, key=key_pem, cert=cert_pem, reference_uri="#" + _inf_dps_id(root))
    # Serialização única: não alterar o texto depois (evita divergência em validadores estritos).
    # lxml preserva URI de namespace nos elementos (expanded names); não há remoção de prefixos no fluxo acima.
    # Declaração fixa UTF-8 sem BOM — manual NFS-e / xmldsig.
    body = etree.tostring(
        signed_root,
        xml_declaration=False,
        encoding="UTF-8",
        pretty_print=False,
        method="xml",
    )
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + body.decode("utf-8")


def _inf_dps_id(root: Any) -> str:
    for el in root.iter():
        if el.tag.endswith("infDPS") or el.tag == "{http://www.sped.fazenda.gov.br/nfse}infDPS":
            i = el.get("Id")
            if i:
                return i
    raise ValueError("Elemento infDPS com atributo Id não encontrado no XML.")
