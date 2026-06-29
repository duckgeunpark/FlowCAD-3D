"""Canonical input-table columns + Excel/CSV transport normalization."""
from __future__ import annotations

import io

from ..domain.enums import DesignMode
from ..parsing.base import Row

# This is the backend-owned transport schema. The frontend table mirrors this
# list until the project grows a generated shared schema.
_ASSEMBLY_COLUMNS = [
    "seq", "system_type", "part_type", "spec",
    "size_a", "size_b", "length", "angle",
    "bend_to", "offset_direction", "rotation",
    "W", "H", "D", "L", "R",
    "toW", "toH", "toD",
    "branchW", "branchH", "branchD",
    "offset", "X", "NL", "gores",
    "connect_to_seq", "connect_port", "note",
]
PIPE_COLUMNS = _ASSEMBLY_COLUMNS
DUCT_COLUMNS = _ASSEMBLY_COLUMNS

_PIPE_EXAMPLE = [
    1, "pipe", "straight", "SCH40", 100, "", 3000, "",
    "", "", "", "", "", "", "", "", "", "", "", "", "", "",
    "", "", "", "", "", "start", "start pipe",
]
_DUCT_EXAMPLE = [
    1, "duct", "rect_straight", "GI", "", "", "", "",
    "", "", "", 500, 300, "", 1220, "", "", "", "", "", "",
    "", "", "", "", "", "", "start", "start duct",
]

_HEADER_ALIASES = {
    "sequence": "seq",
    "no": "seq",
    "번호": "seq",
    "순번": "seq",
    "계통": "system_type",
    "시스템": "system_type",
    "종류": "part_type",
    "부품종류": "part_type",
    "피팅": "part_type",
    "표준피팅": "part_type",
    "규격": "spec",
    "규격코드": "spec",
    "치수a": "size_a",
    "치수b": "size_b",
    "가로": "W",
    "폭": "W",
    "세로": "H",
    "높이": "H",
    "직경": "D",
    "지름": "D",
    "길이": "L",
    "반경": "R",
    "출구가로": "toW",
    "출구세로": "toH",
    "출구직경": "toD",
    "분기가로": "branchW",
    "분기세로": "branchH",
    "분기직경": "branchD",
    "각도": "angle",
    "엘보방향": "bend_to",
    "방향": "bend_to",
    "오프셋방향": "offset_direction",
    "회전": "rotation",
    "연결대상": "connect_to_seq",
    "연결seq": "connect_to_seq",
    "연결포트": "connect_port",
    "비고": "note",
}


def columns_for(mode: DesignMode) -> list[str]:
    return PIPE_COLUMNS if mode is DesignMode.PIPE else DUCT_COLUMNS


def normalize_table_rows(rows: list[Row]) -> list[Row]:
    """Normalize parsed transport rows into canonical design-table rows."""
    normalized: list[Row] = []
    for raw in rows:
        row: Row = {}
        for key, value in raw.items():
            canonical = _canonical_header(key)
            if canonical:
                row[canonical] = value
        _fill_compat_dimensions(row)
        normalized.append(row)
    return normalized


def build_template_xlsx(mode: DesignMode) -> bytes:
    """Empty workbook with a bold header row, a frozen header, and one example."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    columns = columns_for(mode)
    wb = Workbook()
    ws = wb.active
    ws.title = "FlowCAD"

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="44607A")
    for col_idx, name in enumerate(columns, start=1):
        cell = ws.cell(row=1, column=col_idx, value=name)
        cell.font = header_font
        cell.fill = header_fill
        ws.column_dimensions[cell.column_letter].width = max(10, len(name) + 2)

    example = _PIPE_EXAMPLE if mode is DesignMode.PIPE else _DUCT_EXAMPLE
    for col_idx, value in enumerate(example, start=1):
        ws.cell(row=2, column=col_idx, value=value)

    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def load_table(filename: str, data: bytes) -> list[Row]:
    """Parse an uploaded .xlsx/.csv and normalize it for table/generation use."""
    if filename.lower().endswith((".xlsx", ".xlsm")):
        return normalize_table_rows(_load_xlsx(data))
    from .csv_loader import load_csv
    return normalize_table_rows(load_csv(data))


def _load_xlsx(data: bytes) -> list[Row]:
    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)
    try:
        header = [str(h).strip() if h is not None else "" for h in next(rows_iter)]
    except StopIteration:
        return []

    rows: list[Row] = []
    for values in rows_iter:
        if values is None or all(v is None or v == "" for v in values):
            continue
        row: Row = {}
        for key, value in zip(header, values):
            if key:
                row[key] = "" if value is None else value
        rows.append(row)
    return rows


def _canonical_header(header: object) -> str:
    raw = str(header or "").strip()
    if not raw:
        return ""
    if raw in _ASSEMBLY_COLUMNS:
        return raw
    compact = raw.lower().replace(" ", "").replace("_", "").replace("-", "")
    for col in _ASSEMBLY_COLUMNS:
        if compact == col.lower().replace("_", ""):
            return col
    return _HEADER_ALIASES.get(compact, raw)


def _fill_compat_dimensions(row: Row) -> None:
    """Populate legacy size columns for existing table and assembly logic."""
    part_type = str(row.get("part_type", "")).strip().lower()
    if row.get("length") in (None, "") and row.get("L") not in (None, ""):
        row["length"] = row["L"]
    if row.get("size_a") not in (None, ""):
        return
    if part_type.startswith("transition"):
        if row.get("toD") not in (None, ""):
            row["size_a"] = row["toD"]
        elif row.get("toW") not in (None, ""):
            row["size_a"] = row["toW"]
        if row.get("size_b") in (None, "") and row.get("toH") not in (None, ""):
            row["size_b"] = row["toH"]
        return
    if row.get("W") not in (None, ""):
        row["size_a"] = row["W"]
        if row.get("size_b") in (None, "") and row.get("H") not in (None, ""):
            row["size_b"] = row["H"]
    elif row.get("D") not in (None, ""):
        row["size_a"] = row["D"]
