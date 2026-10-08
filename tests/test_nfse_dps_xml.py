"""Extração de Id da infDPS para GET /dps/{id} no ADN."""

from __future__ import annotations

import os
import re
import unittest
import unittest.mock

import xml.etree.ElementTree as ET

from app.nfse_dps_xml import (
    NS,
    _build_inf_dps_id,
    _emissao_br_com_margem,
    _ndps_para_id,
    _ndps_para_xml,
    _serie_para_id,
    _serie_para_xml,
    build_dps_xml_unsigned,
)
from app.nfse_inf_dps_id import extract_inf_dps_id_from_xml

_TS_ID_DPS_RE = re.compile(r"^DPS\d{42}$")

# Payload “limpo” para homologação / MEI (ASCII; exemplo oficial restrita).
_DISCRIM_HOMOLOG = "2x Instalacao de ar-condicionado hi-wall de ate 12000BTUs"


class TestTsIdDpsPattern(unittest.TestCase):
    """TSIdDPS: ``DPS`` + exatamente 42 dígitos (schema ^(DPS[0-9]{42})$)."""

    def test_serie_numeric_only(self) -> None:
        self.assertEqual(_serie_para_id("NF"), "00001")
        self.assertEqual(_serie_para_id("20001"), "20001")

    def test_serie_xml_com_padding_cinco_digitos(self) -> None:
        self.assertEqual(_serie_para_xml("NF"), "00001")
        self.assertEqual(_serie_para_xml("00001"), "00001")
        self.assertEqual(_serie_para_xml("20001"), "20001")

    def test_serie_xml_sem_padding_com_env(self) -> None:
        with unittest.mock.patch.dict(os.environ, {"NFSE_DPS_SERIE_XML_SEM_PADDING": "1"}, clear=False):
            self.assertEqual(_serie_para_xml("NF"), "1")
            self.assertEqual(_serie_para_xml("00001"), "1")

    def test_ndps_padding(self) -> None:
        self.assertEqual(_ndps_para_id("1778095348134"), "001778095348134")
        self.assertEqual(len(_ndps_para_id("99")), 15)

    def test_ndps_xml_ts_num_dps(self) -> None:
        """Tag ``nDPS``: valor canônico sem padding (TSNumDPS)."""

        self.assertEqual(_ndps_para_xml("001778100392875"), "1778100392875")
        self.assertEqual(_ndps_para_xml("1778100392875"), "1778100392875")
        self.assertFalse(_ndps_para_xml("99").startswith("0"))

    def test_build_id_matches_xsd(self) -> None:
        i = _build_inf_dps_id(
            cod_municipio="3503208",
            cpf_cnpj_prest="42731692000198",
            serie="NF",
            numero_dps="1778095348134",
        )
        self.assertEqual(len(i), 45)
        self.assertTrue(_TS_ID_DPS_RE.fullmatch(i))
        self.assertTrue(i.startswith("DPS35032082"))
        self.assertIn("00001", i)
        self.assertTrue(i.endswith("001778095348134"))
        self.assertEqual(_ndps_para_xml("1778095348134"), "1778095348134")


class TestDhEmiBrasilia(unittest.TestCase):
    """dhEmi em America/Sao_Paulo com offset explícito (evita E0008 / fuso errado)."""

    def test_emissao_iso_com_fuso(self) -> None:
        _dt, dh, dc = _emissao_br_com_margem()
        self.assertRegex(
            dh,
            r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$",
        )
        self.assertEqual(dc, _dt.date().isoformat())


class TestTribSchema(unittest.TestCase):
    """E1235: ``trib`` exige totTrib; MEI sem tribFed (E0676). Ordem: tribMun → totTrib."""

    def test_trib_has_mun_tot_without_fed(self) -> None:
        from types import SimpleNamespace

        tenant = SimpleNamespace(address_ibge_code="3503208", cnpj="42731692000198")
        client = SimpleNamespace(
            document="12345678901",
            name="Cliente Teste",
            address_ibge_code="3548906",
            address_postal_code="13560000",
            address_street="Av Paulista",
            address_number="1000",
            address_district="Bela Vista",
            address_complement="",
        )
        xml = build_dps_xml_unsigned(
            tenant=tenant,
            client=client,
            amount=100.0,
            discriminacao=_DISCRIM_HOMOLOG,
            codigo_tributacao_nacional="010101",
            codigo_nbs="115021000",
            mei_environment="homologacao",
            serie="NF",
            numero_dps="60000",
            op_simp_nac=2,
        )
        root = ET.fromstring(xml)
        va = root.find(f".//{{{NS}}}verAplic")
        assert va is not None and va.text == "Climaris"
        xd = root.find(f".//{{{NS}}}xDescServ")
        assert xd is not None and xd.text == _DISCRIM_HOMOLOG

        trib = root.find(f".//{{{NS}}}trib")
        assert trib is not None
        kids = [c.tag.split("}")[-1] for c in list(trib)]
        self.assertEqual(kids, ["tribMun", "totTrib"])
        self.assertIsNone(trib.find(f"{{{NS}}}tribFed"))
        tm = trib.find(f"{{{NS}}}tribMun")
        assert tm is not None
        self.assertEqual(
            [c.tag.split("}")[-1] for c in list(tm)],
            ["tribISSQN", "tpRetISSQN"],
        )
        assert tm.find(f"{{{NS}}}cMunicIncid") is None
        tot = trib.find(f"{{{NS}}}totTrib")
        assert tot is not None
        self.assertEqual(
            [c.tag.split("}")[-1] for c in list(tot)],
            ["indTotTrib"],
        )
        ind = tot.find(f"{{{NS}}}indTotTrib")
        assert ind is not None and ind.text == "0"
        assert tot.find(f"{{{NS}}}pTotTribSN") is None
        loc = root.find(f".//{{{NS}}}cLocPrestacao")
        assert loc is not None and loc.text == "3548906"

    def test_cloc_prestacao_env_forca_araraquara(self) -> None:
        """NFSE_DPS_CMUNIC_INCID fixa ``cLocPrestacao`` (sem ``cMunicIncid`` em ``tribMun`` — XSD)."""

        from types import SimpleNamespace

        tenant = SimpleNamespace(address_ibge_code="3503208", cnpj="42731692000198")
        client = SimpleNamespace(
            document="12345678901",
            name="Cliente Teste",
            address_ibge_code="3550308",
            address_postal_code="01310100",
            address_street="Av Paulista",
            address_number="1000",
            address_district="Bela Vista",
            address_complement="",
        )
        with unittest.mock.patch.dict(os.environ, {"NFSE_DPS_CMUNIC_INCID": "3503208"}, clear=False):
            xml = build_dps_xml_unsigned(
                tenant=tenant,
                client=client,
                amount=1200.0,
                discriminacao=_DISCRIM_HOMOLOG,
                codigo_tributacao_nacional="010101",
                codigo_nbs="115021000",
                mei_environment="homologacao",
                serie="NF",
                numero_dps="60000",
                op_simp_nac=2,
            )
        root = ET.fromstring(xml)
        loc = root.find(f".//{{{NS}}}cLocPrestacao")
        assert loc is not None and loc.text == "3503208"
        tm = root.find(f".//{{{NS}}}tribMun")
        assert tm is not None
        assert tm.find(f"{{{NS}}}cMunicIncid") is None
        vs = root.find(f".//{{{NS}}}vServ")
        assert vs is not None and vs.text == "1200.00"

    def test_prest_im_via_env(self) -> None:
        from types import SimpleNamespace

        tenant = SimpleNamespace(address_ibge_code="3503208", cnpj="42731692000198")
        client = SimpleNamespace(
            document="12345678901",
            name="Cliente Teste",
            address_ibge_code="3548906",
            address_postal_code="13560000",
            address_street="Rua X",
            address_number="1",
            address_district="Centro",
            address_complement="",
        )
        with unittest.mock.patch.dict(
            os.environ,
            {"NFSE_PRESTADOR_INSCRICAO_MUNICIPAL": "999888777"},
            clear=False,
        ):
            xml = build_dps_xml_unsigned(
                tenant=tenant,
                client=client,
                amount=100.0,
                discriminacao=_DISCRIM_HOMOLOG,
                codigo_tributacao_nacional="010101",
                codigo_nbs="115021000",
                mei_environment="homologacao",
                serie="NF",
                numero_dps="60000",
                op_simp_nac=2,
            )
        root = ET.fromstring(xml)
        im = root.find(f".//{{{NS}}}prest/{{{NS}}}IM")
        assert im is not None and im.text == "999888777"

    def test_prest_im_ie_cnpja_fallback_env(self) -> None:
        """IE ativa (CNPJá) como fallback para tag IM quando Admin/env municipal vazios."""

        from types import SimpleNamespace

        tenant = SimpleNamespace(
            address_ibge_code="3503208",
            cnpj="42731692000198",
            phone="(16) 99999-8877",
        )
        client = SimpleNamespace(
            document="12345678901",
            name="Cliente Teste",
            address_ibge_code="3548906",
            address_postal_code="13560000",
            address_street="Rua X",
            address_number="1",
            address_district="Centro",
            address_complement="",
        )
        with unittest.mock.patch.dict(
            os.environ,
            {"NFSE_PRESTADOR_IE_PARA_TAG_IM": "181820892112"},
            clear=False,
        ):
            xml = build_dps_xml_unsigned(
                tenant=tenant,
                client=client,
                amount=100.0,
                discriminacao=_DISCRIM_HOMOLOG,
                codigo_tributacao_nacional="010101",
                codigo_nbs="115021000",
                mei_environment="homologacao",
                serie="NF",
                numero_dps="60000",
                op_simp_nac=2,
            )
        root = ET.fromstring(xml)
        prest = root.find(f".//{{{NS}}}prest")
        assert prest is not None
        kids = [c.tag.split("}")[-1] for c in list(prest)]
        self.assertEqual(kids, ["CNPJ", "IM", "fone", "regTrib"])
        im = prest.find(f"{{{NS}}}IM")
        assert im is not None and im.text == "181820892112"
        assert prest.find(f"{{{NS}}}fone") is not None and prest.find(f"{{{NS}}}fone").text == "16999998877"

    def test_mei_never_sends_p_tot_trib_sn_even_if_passed(self) -> None:
        """E0710: MEI não pode informar pTotTribSN."""

        from types import SimpleNamespace
        from decimal import Decimal

        tenant = SimpleNamespace(address_ibge_code="3503208", cnpj="42731692000198")
        client = SimpleNamespace(
            document="12345678901",
            name="Cliente Teste",
            address_ibge_code="3548906",
            address_postal_code="13560000",
            address_street="Av Paulista",
            address_number="1000",
            address_district="Bela Vista",
            address_complement="",
        )
        xml = build_dps_xml_unsigned(
            tenant=tenant,
            client=client,
            amount=100.0,
            discriminacao=_DISCRIM_HOMOLOG,
            codigo_tributacao_nacional="010101",
            codigo_nbs="115021000",
            mei_environment="homologacao",
            serie="NF",
            numero_dps="60000",
            op_simp_nac=2,
            p_tot_trib_sn=Decimal("12.50"),
        )
        root = ET.fromstring(xml)
        tot = root.find(f".//{{{NS}}}totTrib")
        assert tot is not None
        assert tot.find(f"{{{NS}}}pTotTribSN") is None
        ind = tot.find(f"{{{NS}}}indTotTrib")
        assert ind is not None and ind.text == "0"

    def test_tot_trib_sn_when_sn_percent(self) -> None:
        from types import SimpleNamespace
        from decimal import Decimal

        tenant = SimpleNamespace(address_ibge_code="3503208", cnpj="42731692000198")
        client = SimpleNamespace(
            document="12345678901",
            name="Cliente Teste",
            address_ibge_code="3548906",
            address_postal_code="13560000",
            address_street="Av Paulista",
            address_number="1000",
            address_district="Bela Vista",
            address_complement="",
        )
        xml = build_dps_xml_unsigned(
            tenant=tenant,
            client=client,
            amount=100.0,
            discriminacao=_DISCRIM_HOMOLOG,
            codigo_tributacao_nacional="010101",
            codigo_nbs="115021000",
            mei_environment="homologacao",
            serie="NF",
            numero_dps="60000",
            op_simp_nac=3,
            p_tot_trib_sn=Decimal("12.50"),
        )
        root = ET.fromstring(xml)
        tot = root.find(f".//{{{NS}}}totTrib")
        assert tot is not None
        sn = tot.find(f"{{{NS}}}pTotTribSN")
        assert sn is not None and sn.text == "12.50"

    def test_v_serv_duas_casas_sem_milhar(self) -> None:
        """``vServ`` no padrão nacional: duas decimais, ponto, sem separador de milhar."""

        from types import SimpleNamespace

        tenant = SimpleNamespace(address_ibge_code="3503208", cnpj="42731692000198")
        client = SimpleNamespace(
            document="12345678901",
            name="Cliente Teste",
            address_ibge_code="3548906",
            address_postal_code="13560000",
            address_street="Rua X",
            address_number="1",
            address_district="Centro",
            address_complement="",
        )
        xml = build_dps_xml_unsigned(
            tenant=tenant,
            client=client,
            amount=1200.0,
            discriminacao=_DISCRIM_HOMOLOG,
            codigo_tributacao_nacional="010101",
            codigo_nbs="115021000",
            mei_environment="homologacao",
            serie="NF",
            numero_dps="60000",
            op_simp_nac=2,
        )
        root = ET.fromstring(xml)
        vs = root.find(f".//{{{NS}}}vServ")
        assert vs is not None and vs.text == "1200.00"
        self.assertNotIn(",", vs.text or "")

    def test_xdesc_serv_ascii_fold_e_sem_cedilha(self) -> None:
        from types import SimpleNamespace

        tenant = SimpleNamespace(address_ibge_code="3503208", cnpj="42731692000198")
        client = SimpleNamespace(
            document="12345678901",
            name="Cliente Teste",
            address_ibge_code="3550308",
            address_postal_code="01310100",
            address_street="Av Paulista",
            address_number="1000",
            address_district="Bela Vista",
            address_complement="",
        )
        xml = build_dps_xml_unsigned(
            tenant=tenant,
            client=client,
            amount=100.0,
            discriminacao="Serviço pré-instalação — revisão çÇ",
            codigo_tributacao_nacional="010101",
            codigo_nbs="115021000",
            mei_environment="homologacao",
            serie="NF",
            numero_dps="60000",
            op_simp_nac=2,
        )
        root = ET.fromstring(xml)
        xd = root.find(f".//{{{NS}}}xDescServ")
        assert xd is not None and xd.text is not None
        self.assertNotIn("ç", xd.text)
        self.assertNotIn("Ç", xd.text)
        self.assertIn("Servico", xd.text)


class TestInfDpsId(unittest.TestCase):
    def test_extract_from_tag(self) -> None:
        xml = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01">'
            '<infDPS Id="DPS310620012345678912220001000000000000099">'
            "<tpAmb>2</tpAmb></infDPS></DPS>"
        )
        self.assertEqual(
            extract_inf_dps_id_from_xml(xml),
            "DPS310620012345678912220001000000000000099",
        )


if __name__ == "__main__":
    unittest.main()
