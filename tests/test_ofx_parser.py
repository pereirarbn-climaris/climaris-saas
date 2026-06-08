from decimal import Decimal

from app.ofx_parser import parse_ofx_statement_transactions


def test_parse_ofx_minimal_bank_stmt():
    raw = b"""OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKMSGSRSV1>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20240315120000
<TRNAMT>-150.50
<FITID>abc-1
<NAME>FORNECEDOR X
<MEMO>nota
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20240320120000
<TRNAMT>200.00
<FITID>abc-2
<NAME>CLIENTE Y
</STMTTRN>
</BANKMSGSRSV1>
</OFX>
"""
    txs, err = parse_ofx_statement_transactions(raw)
    assert err is None
    assert len(txs) == 2
    assert txs[0].fit_id == "abc-1"
    assert txs[0].amount == Decimal("-150.50")
    assert txs[0].posted_at.isoformat() == "2024-03-15"
    assert txs[1].amount == Decimal("200.00")


def test_parse_ofx_with_inline_closing_tags():
    """Exportações com </TAG> na mesma linha (ex.: banco digital / Infinitay)."""
    raw = b"""OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT</TRNTYPE>
<DTPOSTED>20260603170734</DTPOSTED>
<TRNAMT>120.00</TRNAMT>
<FITID>7579373683</FITID>
<NAME>Pix TESTE</NAME>
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20260603164711</DTPOSTED>
<TRNAMT>-14.71</TRNAMT>
<FITID>7579199218</FITID>
</STMTTRN>
</BANKTRANLIST>
</OFX>
"""
    txs, err = parse_ofx_statement_transactions(raw)
    assert err is None
    assert len(txs) == 2
    assert txs[0].amount == Decimal("120.00")
    assert txs[0].posted_at.isoformat() == "2026-06-03"
    assert txs[1].amount == Decimal("-14.71")
