"""Canonical input-table columns + empty Excel template generation / upload parse.

The column order here is the single source of truth for the input schema; the
frontend `sampleData.ts` mirrors it. Templates are emitted as real .xlsx so
users can fill values in Excel and upload them back.
"""
from __future__ import annotations

import io

from ..domain.enums import DesignMode
from ..parsing.base import Row

PIPE_COLUMNS = [
    "run_id", "seq", "x", "y", "z", "nominal", "schedule",
    "fitting", "drawing_no", "fitting_no", "joint_no",
]
DUCT_COLUMNS = [
    "run_id", "seq", "x", "y", "z", "shape", "width", "height", "diameter",
    "fitting", "drawing_no", "fitting_no", "joint_no",
]

# One guiding example row per mode (helps users understand units/values).
_PIPE_EXAMPLE = ["R1", 1, 0, 0, 0, "100A", "Sch40", "", "DWG-01", "", "JNT-001"]
_DUCT_EXAMPLE = ["D1", 1, 0, 0, 0, "rectangular", 400, 300, "", "", "DWG-D1", "", "DJ-001"]


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
