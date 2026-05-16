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
