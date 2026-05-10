"""Testes de extração PEM (EndCertOnly) sem depender de SQLAlchemy."""

from __future__ import annotations

import unittest

from app.nfse_pfx_ssl import leaf_cert_pem_only


class TestLeafCertPemOnly(unittest.TestCase):
    def test_first_block_only(self) -> None:
        a = b"-----BEGIN CERTIFICATE-----\nYQ==\n-----END CERTIFICATE-----\n"
        b = b"-----BEGIN CERTIFICATE-----\nWg==\n-----END CERTIFICATE-----\n"
        out = leaf_cert_pem_only(a + b)
        self.assertIn(b"YQ==", out)
        self.assertNotIn(b"Wg==", out)
        self.assertTrue(out.strip().endswith(b"END CERTIFICATE-----"))


if __name__ == "__main__":
    unittest.main()
