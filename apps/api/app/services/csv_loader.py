"""CSV/Excel-export ingestion: bytes -> list[Row].

Kept separate from parsing so the *transport* format (CSV text) is decoupled
from the *domain* parsing (rows -> Network). Numeric-looking cells are coerced
lazily by the parsers, so this stage only splits and trims.
"""
from __future__ import annotations

import csv
import io

from ..parsing.base import Row


def load_csv(data: bytes | str) -> list[Row]:
    text = data.decode("utf-8-sig") if isinstance(data, bytes) else data
    reader = csv.DictReader(io.StringIO(text))
    rows: list[Row] = []
    for raw in reader:
        rows.append({(k or "").strip(): (v.strip() if isinstance(v, str) else v)
                     for k, v in raw.items()})
    return rows
