"""Canonical input-table columns + empty Excel template generation / upload parse.

The column order here is the single source of truth for the input schema; the
frontend `sampleData.ts` mirrors it. Templates are emitted as real .xlsx so
users can fill values in Excel and upload them back.
"""
from __future__ import annotations

import io

from ..domain.enums import DesignMode
from ..parsing.base import Row

# Plan_v2 `user_input` schema: assembly order + connectivity + key dimensions.
# Positions/orientations are computed by the backend assembly engine.
_ASSEMBLY_COLUMNS = [
    "seq", "system_type", "part_type", "spec",
    "size_a", "size_b", "length", "angle",
    "connect_to_seq", "connect_port", "note",
]
PIPE_COLUMNS = _ASSEMBLY_COLUMNS
DUCT_COLUMNS = _ASSEMBLY_COLUMNS

# One guiding example row per mode (helps users understand units/values).
_PIPE_EXAMPLE = [1, "pipe", "straight", "SCH40", 100, "", 3000, "", "", "start", "시작 배관"]
_DUCT_EXAMPLE = [1, "duct", "straight", "GI", 500, 300, 1500, "", "", "start", "시작 덕트"]


def columns_for(mode: DesignMode) -> list[str]:
    return PIPE_COLUMNS if mode is DesignMode.PIPE else DUCT_COLUMNS


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
    """Parse an uploaded .xlsx or .csv into rows (for table population)."""
    if filename.lower().endswith((".xlsx", ".xlsm")):
        return _load_xlsx(data)
    from .csv_loader import load_csv
    return load_csv(data)


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
