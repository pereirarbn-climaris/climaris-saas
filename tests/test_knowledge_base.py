"""Testes da Knowledge Base (RAG)."""

from app.schemas import KnowledgeAskIn


def test_knowledge_ask_in_strips_question():
    payload = KnowledgeAskIn(question="  Qual a pressão?  ", brand=" LG ", model=None)
    assert payload.question == "Qual a pressão?"
    assert payload.brand == "LG"
    assert payload.model is None
