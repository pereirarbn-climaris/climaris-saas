"""Testes do interpretador de respostas JSON do Sefin Nacional."""

from __future__ import annotations

import unittest

from app.nfse_sefin_response import extract_sefin_protocol_number, interpret_sefin_dps_response


class TestSefinResponseInterpret(unittest.TestCase):
    def test_extract_protocol_from_emission(self) -> None:
        self.assertEqual(extract_sefin_protocol_number({"nsNRec": 55}), 55)
        self.assertEqual(extract_sefin_protocol_number({"protocolo": "99"}), "99")
        self.assertIsNone(extract_sefin_protocol_number({}))

    def test_consult_status_success_cstat_100(self) -> None:
        body = {
            "status": 200,
            "motivo": "Consulta realizada com sucesso",
            "chNFSe": "31062002213278005000122000000000001525126902998045",
            "cStat": "100",
            "xml": "<?xml version=\"1.0\"?><NFSe />",
        }
        r = interpret_sefin_dps_response(200, body)
        self.assertTrue(r.success)
        self.assertEqual(r.access_key, "31062002213278005000122000000000001525126902998045")

    def test_outer_status_minus_2_still_pending(self) -> None:
        r = interpret_sefin_dps_response(200, {"status": -2, "motivo": "Processando"})
        self.assertFalse(r.success)
        self.assertTrue(r.pending_protocol_only)

    def test_emission_protocol_only_without_nfse_yet(self) -> None:
        r = interpret_sefin_dps_response(
            200,
            {"status": 200, "nsNRec": 12345, "motivo": "NFSe enviado para Sefaz"},
        )
        self.assertFalse(r.success)
        self.assertTrue(r.pending_protocol_only)

    def test_ch_nfse_literal_null_not_success(self) -> None:
        r = interpret_sefin_dps_response(
            200,
            {"status": 200, "cStat": "-1", "chNFSe": "null"},
        )
        self.assertFalse(r.success)

    def test_http_404_friendly_message(self) -> None:
        r = interpret_sefin_dps_response(404, {})
        self.assertFalse(r.success)
        self.assertIn("404", r.error_message or "")
        self.assertIn("Ambiente Nacional", r.error_message or "")

    def test_http_503_friendly_message(self) -> None:
        r = interpret_sefin_dps_response(503, {})
        self.assertFalse(r.success)
        self.assertIn("Indisponibilidade", r.error_message or "")

    def test_e999_appends_diagnostic_hint(self) -> None:
        body = {
            "tipoAmbiente": 2,
            "erros": [{"Codigo": "E999", "Descricao": "Erro não catalogado"}],
        }
        r = interpret_sefin_dps_response(400, body)
        self.assertFalse(r.success)
        self.assertIn("E999", r.error_message or "")
        self.assertIn("novo nDPS", r.error_message or "")
        self.assertIn("49999", r.error_message or "")

    def test_e0010_appends_api_serie_hint(self) -> None:
        body = {
            "tipoAmbiente": 2,
            "erros": [
                {
                    "Codigo": "E0010",
                    "Descricao": "A série informada na DPS não pertence à faixa definida para o tipo de emissor utilizado para a sua emissão.",
                }
            ],
        }
        r = interpret_sefin_dps_response(400, body)
        self.assertFalse(r.success)
        self.assertIn("E0010", r.error_message or "")
        self.assertIn("49999", r.error_message or "")


if __name__ == "__main__":
    unittest.main()
