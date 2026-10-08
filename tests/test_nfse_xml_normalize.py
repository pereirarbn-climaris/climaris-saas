"""Normalização NFS-e XML — sem SQLAlchemy."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from app.nfse_xml_normalize import (
    c_nbs_digitos,
    c_trib_nac_digitos,
    nfse_dps_descricao_sanitizada,
    nfse_xml_ascii_fold,
)


class TestTribNbs(unittest.TestCase):
    def test_c_trib_com_pontos(self) -> None:
        self.assertEqual(c_trib_nac_digitos("14.01.01"), "140101")

    def test_c_trib_sem_pontos(self) -> None:
        self.assertEqual(c_trib_nac_digitos("010101"), "010101")

    def test_c_nbs(self) -> None:
        self.assertEqual(c_nbs_digitos("101063200"), "101063200")


class TestDpsDescricaoSanitizada(unittest.TestCase):
    def test_instalação_até_btus(self) -> None:
        raw = "2x Instalação de ar-condicionado hi-wall de até 12000BTUs"
        want = "2x Instalacao de ar-condicionado hi-wall de ate 12000BTUs"
        self.assertEqual(nfse_dps_descricao_sanitizada(raw), want)
        self.assertEqual(nfse_dps_descricao_sanitizada(want), want)

    def test_força_ascii_mesmo_com_fold_global_desligado(self) -> None:
        with patch.dict("os.environ", {"NFSE_DPS_XML_ASCII_FOLD": "0"}, clear=False):
            self.assertEqual(
                nfse_dps_descricao_sanitizada("Ação"),
                "Acao",
            )


class TestAsciiFold(unittest.TestCase):
    def test_remove_acentos(self) -> None:
        self.assertEqual(nfse_xml_ascii_fold("São Carlos", max_len=80), "Sao Carlos")

    def test_fold_desligado(self) -> None:
        with patch.dict("os.environ", {"NFSE_DPS_XML_ASCII_FOLD": "0"}, clear=False):
            self.assertEqual(nfse_xml_ascii_fold("São Carlos", max_len=80), "São Carlos")


if __name__ == "__main__":
    unittest.main()
