"""Referência resumida de códigos de tributação nacional (cTribNac) para UI.

A tabela oficial é ampla e atualizada pela RFB; use esta lista como atalho para
serviços comuns (climatização / manutenção). Sempre confira o código vigente em
https://www.gov.br/nfse e na documentação técnica do DPS.

Itens marcados como exemplos devem ser validados pelo contador / responsável fiscal.
"""

from __future__ import annotations

# Lista enxuta: código + descrição para typeahead / <select>.
# Códigos seguem padrão alfanumérico do layout nacional (ajuste conforme tabela oficial).
NFS_E_TRIBUTACAO_NACIONAL_CATALOG: list[dict[str, str]] = [
    {
        "codigo": "010101",
        "descricao": "Exemplo — Instalação de equipamentos de ar condicionado (confira código na tabela nacional)",
        "nbs_sugerido": "115021000",
    },
    {
        "codigo": "010102",
        "descricao": "Exemplo — Manutenção / limpeza de sistemas de climatização (confira código na tabela nacional)",
        "nbs_sugerido": "115021000",
    },
    {
        "codigo": "010103",
        "descricao": "Exemplo — Reparo de equipamentos de refrigeração e ventilação (confira código na tabela nacional)",
        "nbs_sugerido": "115021000",
    },
    {
        "codigo": "019900",
        "descricao": "Exemplo — Outros serviços de instalação / reparo em equipamentos (confira código na tabela nacional)",
        "nbs_sugerido": "115021000",
    },
    {
        "codigo": "140101",
        "descricao": "Exemplo — Serviços de engenharia / projetos (confira código na tabela nacional)",
        "nbs_sugerido": "125020000",
    },
    {
        "codigo": "070501",
        "descricao": "Exemplo — Locação de equipamentos sem operador (confira código na tabela nacional)",
        "nbs_sugerido": "105021000",
    },
]


def list_tributacao_nacional_catalog() -> list[dict[str, str]]:
    return list(NFS_E_TRIBUTACAO_NACIONAL_CATALOG)
