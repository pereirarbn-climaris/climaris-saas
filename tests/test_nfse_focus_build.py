"""Testes do montador JSON Focus NFSe Nacional (nfsen)."""

from __future__ import annotations

import os
import unittest
import unittest.mock

from types import SimpleNamespace

from app.nfse_focus_emit_body import build_focus_nfsen_payload, focus_datetime_strings_br


class TestFocusNfsenPayload(unittest.TestCase):
    def test_requires_im(self) -> None:
        tenant = SimpleNamespace(
            address_ibge_code="3503208",
            cnpj="42731692000198",
        )
        client = SimpleNamespace(
            document="45276128000110",
            name="Cliente",
            address_ibge_code="3503208",
            address_postal_code="14801901",
            address_street="Rua X",
            address_number="1",
            address_complement="",
            address_district="Centro",
            phone="",
            email="",
        )
        settings = SimpleNamespace(
            prestador_inscricao_municipal=None,
            default_optante_mei=True,
            mei_opt_in=False,
        )
        dh, dc = focus_datetime_strings_br()
        with self.assertRaises(ValueError) as cm:
            build_focus_nfsen_payload(
                tenant=tenant,
                client=client,
                settings=settings,
                amount=100.0,
                codigo_tributacao_nacional="140101",
                codigo_nbs="101063200",
                service_order=None,
                servico_descricao="Servico teste",
                dh_emissao=dh,
                d_compet=dc,
            )
        self.assertIn("Inscrição municipal", str(cm.exception))

    def test_builds_payload(self) -> None:
        tenant = SimpleNamespace(
            address_ibge_code="3503208",
            cnpj="42731692000198",
        )
        client = SimpleNamespace(
            document="45276128000110",
            name="MUNICIPIO TESTE",
            address_ibge_code="3503208",
            address_postal_code="14801901",
            address_street="Rua Sao Bento",
            address_number="840",
            address_complement="",
            address_district="Centro",
            phone="16999999999",
            email="a@b.com",
        )
        settings = SimpleNamespace(
            prestador_inscricao_municipal="12345",
            default_optante_mei=True,
            mei_opt_in=False,
        )
        dh, dc = focus_datetime_strings_br()
        with unittest.mock.patch.dict(os.environ, {}, clear=False):
            p = build_focus_nfsen_payload(
                tenant=tenant,
                client=client,
                settings=settings,
                amount=1200.0,
                codigo_tributacao_nacional="140101",
                codigo_nbs="101063200",
                service_order=None,
                servico_descricao="2x Instalacao",
                dh_emissao=dh,
                d_compet=dc,
            )
        self.assertEqual(p["cnpj_prestador"], "42731692000198")
        self.assertEqual(p["cnpj_tomador"], "45276128000110")
        self.assertEqual(p["codigo_tributacao_nacional_iss"], "140101")
        self.assertEqual(p["codigo_nbs"], "101063200")
        self.assertEqual(p["codigo_opcao_simples_nacional"], 2)


if __name__ == "__main__":
    unittest.main()
