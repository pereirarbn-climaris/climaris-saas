"""Leitura de linhas tabulares em CSV e XLSX (sem dependências externas)."""

from __future__ import annotations

import io
import unicodedata
import zipfile
import xml.etree.ElementTree as ET


def _cell_text_from_xlsx_cell(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        node = cell.find(".//{*}is/{*}t")
        return (node.text or "").strip() if node is not None else ""
    value_node = cell.find("{*}v")
    if value_node is None or value_node.text is None:
        return ""
    raw = value_node.text.strip()
    if cell_type == "s":
        try:
            idx = int(raw)
            return shared_strings[idx] if 0 <= idx < len(shared_strings) else ""
        except ValueError:
            return ""
    return raw


def parse_xlsx_rows(content: bytes) -> list[list[str]]:
    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in zf.namelist():
            shared_root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in shared_root.findall("{*}si"):
                parts = [node.text or "" for node in si.findall(".//{*}t")]
                shared_strings.append("".join(parts).strip())

        workbook_rels_path = "xl/_rels/workbook.xml.rels"
        workbook_path = "xl/workbook.xml"
        if workbook_path not in zf.namelist() or workbook_rels_path not in zf.namelist():
            raise ValueError("Arquivo XLSX inválido.")

        wb_root = ET.fromstring(zf.read(workbook_path))
        first_sheet = wb_root.find(".//{*}sheets/{*}sheet")
        if first_sheet is None:
            return []
        rel_id = first_sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        if not rel_id:
            return []

        rels_root = ET.fromstring(zf.read(workbook_rels_path))
        rel_node = None
        for rel in rels_root.findall("{*}Relationship"):
            if rel.attrib.get("Id") == rel_id:
                rel_node = rel
                break
        if rel_node is None:
            return []

        target = rel_node.attrib.get("Target", "")
        if not target:
            return []
        sheet_path = f"xl/{target}" if not target.startswith("xl/") else target
        if sheet_path not in zf.namelist():
            return []

        sheet_root = ET.fromstring(zf.read(sheet_path))
        data = sheet_root.find("{*}sheetData")
        if data is None:
            return []

        rows: list[list[str]] = []
        for row in data.findall("{*}row"):
            values: list[str] = []
            for cell in row.findall("{*}c"):
                ref = cell.attrib.get("r", "")
                letters = "".join(ch for ch in ref if ch.isalpha())
                col_index = 0
                for ch in letters:
                    col_index = col_index * 26 + (ord(ch.upper()) - ord("A") + 1)
                if col_index <= 0:
                    col_index = len(values) + 1
                needed = col_index - 1
                if len(values) < needed:
                    values.extend([""] * (needed - len(values)))
                text = _cell_text_from_xlsx_cell(cell, shared_strings)
                if len(values) == needed:
                    values.append(text)
                else:
                    values[needed] = text
            if any(v.strip() for v in values):
                rows.append(values)
        return rows


def parse_csv_rows(content: bytes) -> list[list[str]]:
    text = content.decode("utf-8-sig", errors="ignore")
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return []
    delimiter = ";" if ";" in lines[0] else ","
    return [[col.strip() for col in line.split(delimiter)] for line in lines]


def _split_inline_csv_row(row: list[str], delimiter: str) -> list[str]:
    if len(row) != 1:
        return row
    cell = (row[0] or "").strip()
    if delimiter not in cell:
        return row
    return [part.strip() for part in cell.split(delimiter)]


def normalize_rows_shape(rows: list[list[str]]) -> list[list[str]]:
    if not rows:
        return rows
    first = rows[0][0] if rows[0] else ""
    if ";" in first:
        delimiter = ";"
    elif "\t" in first:
        delimiter = "\t"
    else:
        delimiter = ","
    return [_split_inline_csv_row(r, delimiter) for r in rows]


def normalize_header_label(value: str) -> str:
    return (
        unicodedata.normalize("NFD", str(value).strip().lower())
        .encode("ascii", "ignore")
        .decode("ascii")
        .replace(" ", "_")
    )


def header_index(headers: list[str], aliases: list[str]) -> int:
    for i, h in enumerate(headers):
        if h in aliases:
            return i
    return -1


def parse_spreadsheet_rows(content: bytes, filename: str) -> list[list[str]]:
    lower = (filename or "").lower()
    if lower.endswith(".xlsx"):
        rows = parse_xlsx_rows(content)
    elif lower.endswith(".csv") or lower.endswith(".txt"):
        rows = parse_csv_rows(content)
    else:
        raise ValueError("Formato inválido. Use .xlsx ou .csv.")
    return normalize_rows_shape(rows)


def rows_to_dict_records(rows: list[list[str]]) -> list[dict[str, str]]:
    if len(rows) < 2:
        return []
    headers = [normalize_header_label(x) for x in rows[0]]
    records: list[dict[str, str]] = []
    for row in rows[1:]:
        record: dict[str, str] = {}
        for i, key in enumerate(headers):
            if not key:
                continue
            record[key] = row[i].strip() if i < len(row) else ""
        if any(v.strip() for v in record.values()):
            records.append(record)
    return records
