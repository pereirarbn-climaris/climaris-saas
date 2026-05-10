"""Decodificação TSIdDPS sem SQLAlchemy."""

from __future__ import annotations

import unittest

from app.nfse_inf_dps_id import inf_dps_id_segments


class TestInfDpsIdSegments(unittest.TestCase):
    def test_segmentos_exemplo_sp(self) -> None:
        i = "DPS350320824273169200019800001001778102761915"
        s = inf_dps_id_segments(i)
        self.assertNotIn("_erro", s)
        self.assertEqual(s["cMunEmissor_7"], "3503208")
        self.assertEqual(s["tipoInscricaoFederal_1"], "2")
        self.assertEqual(s["inscricaoFederal_14"], "42731692000198")
        self.assertEqual(s["serieDPS_5"], "00001")
        self.assertEqual(len(s["numeroDPS_15"]), 15)


if __name__ == "__main__":
    unittest.main()
